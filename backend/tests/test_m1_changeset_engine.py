import datetime as dt
import threading

import pytest
from django.contrib.auth.models import User
from django.db import close_old_connections, transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.changesets.models import ChangeEntry, ChangeSet
from apps.changesets.services import (
    ChangeSetInvalidState,
    apply_changeset,
    approve_changeset,
    reject_changeset,
    revert_changeset,
    submit_changeset,
)
from apps.schemas.models import DataSchema
from apps.temporal.models import Entity, TemporalRecord
from apps.temporal.queries import get_entity_timeline


@pytest.fixture
def user(db):
    return User.objects.create_user(username="changeset_user", password="pass")


@pytest.fixture
def approver(db):
    return User.objects.create_user(username="approver", password="pass")


@pytest.fixture
def schema(user):
    return DataSchema.objects.create(
        schema_code="asset_list",
        name="固定资产表",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text"},
            {"key": "status", "label": "状态", "type": "text"},
        ],
        current_version=2,
        owner=user,
        visibility="shared",
        created_by=user,
    )


@pytest.fixture
def entity(schema, user):
    return Entity.objects.create(schema=schema, business_code="A-001", created_by=user)


def make_changeset(schema, user, *, status="draft", approval_required=False, approver=None):
    return ChangeSet.objects.create(
        schema=schema,
        summary="测试变更",
        status=status,
        approval_required=approval_required,
        approver=approver,
        created_by=user,
    )


def make_base_record(entity, user, payload=None):
    change_set = ChangeSet.objects.create(
        schema=entity.schema,
        summary="初始化",
        status="applied",
        created_by=user,
        applied_at=timezone.now(),
    )
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload=payload or {"asset_no": entity.business_code, "status": "在用"},
        valid_from=dt.date(2024, 1, 1),
        change_set=change_set,
        recorded_by=user,
    )


@pytest.mark.django_db
def test_apply_create_entry_creates_temporal_record_and_audit_log(schema, entity, user):
    change_set = make_changeset(schema, user)
    entry = ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action="create",
        data_after={"asset_no": "A-001", "status": "在用"},
        valid_from=dt.date(2024, 1, 1),
    )

    applied = apply_changeset(change_set, user)
    entry.refresh_from_db()

    assert applied.status == "applied"
    assert applied.applied_at is not None
    assert entry.new_record is not None
    assert entry.new_record.schema_version == schema.current_version
    assert entry.new_record.data_payload["status"] == "在用"
    assert AuditLog.objects.filter(action="changeset.apply", target_id=change_set.id).exists()


@pytest.mark.django_db
def test_apply_update_closes_current_record_and_creates_next_record(schema, entity, user):
    make_base_record(entity, user)
    change_set = make_changeset(schema, user)
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action="update",
        data_before={"asset_no": "A-001", "status": "在用"},
        data_after={"asset_no": "A-001", "status": "维修"},
        valid_from=dt.date(2024, 6, 1),
    )

    apply_changeset(change_set, user)
    timeline = get_entity_timeline(entity)

    assert [(record.valid_from, record.valid_to) for record in timeline] == [
        (dt.date(2024, 1, 1), dt.date(2024, 6, 1)),
        (dt.date(2024, 6, 1), None),
    ]
    assert [record.data_payload["status"] for record in timeline] == ["在用", "维修"]


@pytest.mark.django_db
def test_apply_terminate_closes_current_record_without_new_record(schema, entity, user):
    make_base_record(entity, user)
    change_set = make_changeset(schema, user)
    entry = ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action="terminate",
        data_before={"asset_no": "A-001", "status": "在用"},
        valid_from=dt.date(2024, 7, 1),
    )

    apply_changeset(change_set, user)
    entry.refresh_from_db()
    only_record = TemporalRecord.objects.get(entity=entity)

    assert entry.new_record is None
    assert only_record.valid_to == dt.date(2024, 7, 1)


@pytest.mark.django_db
def test_approval_flow_submits_then_approves_and_applies(schema, entity, user, approver):
    make_base_record(entity, user)
    change_set = make_changeset(
        schema,
        user,
        approval_required=True,
        approver=approver,
    )
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action="update",
        data_before={"asset_no": "A-001", "status": "在用"},
        data_after={"asset_no": "A-001", "status": "报废"},
        valid_from=dt.date(2024, 8, 1),
    )

    submitted = submit_changeset(change_set, user)
    with pytest.raises(ChangeSetInvalidState):
        apply_changeset(submitted, user)
    applied = approve_changeset(submitted, approver)

    assert submitted.status == "submitted"
    assert applied.status == "applied"
    assert applied.approved_at is not None
    assert get_entity_timeline(entity)[-1].data_payload["status"] == "报废"


@pytest.mark.django_db
def test_reject_changeset_marks_submitted_as_rejected(schema, user, approver):
    change_set = make_changeset(
        schema,
        user,
        status="submitted",
        approval_required=True,
        approver=approver,
    )

    rejected = reject_changeset(change_set, approver, reason="数据有误")

    assert rejected.status == "rejected"
    assert rejected.rejected_reason == "数据有误"


@pytest.mark.django_db
def test_revert_applied_update_supersedes_original_and_restores_previous_payload(
    schema, entity, user
):
    make_base_record(entity, user)
    original = make_changeset(schema, user)
    entry = ChangeEntry.objects.create(
        change_set=original,
        entity=entity,
        action="update",
        data_before={"asset_no": "A-001", "status": "在用"},
        data_after={"asset_no": "A-001", "status": "维修"},
        valid_from=dt.date(2024, 6, 1),
    )
    apply_changeset(original, user)
    entry.refresh_from_db()

    revert_set = revert_changeset(original, user)
    original.refresh_from_db()
    entry.new_record.refresh_from_db()
    timeline = get_entity_timeline(entity)

    assert original.status == "reverted"
    assert revert_set.status == "applied"
    assert revert_set.source == "revert"
    assert revert_set.revert_of_id == original.id
    assert entry.new_record.is_superseded is True
    assert timeline[-1].data_payload["status"] == "在用"
    assert AuditLog.objects.filter(action="changeset.revert", target_id=original.id).exists()


@pytest.mark.django_db
def test_revert_applied_create_removes_created_record_from_active_timeline(schema, entity, user):
    original = make_changeset(schema, user)
    ChangeEntry.objects.create(
        change_set=original,
        entity=entity,
        action="create",
        data_after={"asset_no": "A-001", "status": "在用"},
        valid_from=dt.date(2024, 1, 1),
    )
    apply_changeset(original, user)

    revert_changeset(original, user)

    assert get_entity_timeline(entity) == []


@pytest.mark.django_db(transaction=True)
def test_concurrent_apply_on_same_entity_queues_and_keeps_timeline_correct(schema, entity, user):
    make_base_record(entity, user)
    first = make_changeset(schema, user)
    second = make_changeset(schema, user)
    ChangeEntry.objects.create(
        change_set=first,
        entity=entity,
        action="update",
        data_before={"asset_no": "A-001", "status": "在用"},
        data_after={"asset_no": "A-001", "status": "维修"},
        valid_from=dt.date(2024, 2, 1),
    )
    ChangeEntry.objects.create(
        change_set=second,
        entity=entity,
        action="update",
        data_before={"asset_no": "A-001", "status": "维修"},
        data_after={"asset_no": "A-001", "status": "报废"},
        valid_from=dt.date(2024, 3, 1),
    )
    errors = []

    def apply_second():
        close_old_connections()
        try:
            apply_changeset(ChangeSet.objects.get(pk=second.pk), User.objects.get(pk=user.pk))
        except Exception as exc:  # pragma: no cover - asserted below
            errors.append(exc)
        finally:
            close_old_connections()

    with transaction.atomic():
        Entity.objects.select_for_update().get(pk=entity.pk)
        thread = threading.Thread(target=apply_second)
        thread.start()
        apply_changeset(first, user)
    thread.join(timeout=5)

    assert errors == []
    assert not thread.is_alive()
    timeline = get_entity_timeline(entity)
    assert [(record.valid_from, record.valid_to) for record in timeline] == [
        (dt.date(2024, 1, 1), dt.date(2024, 2, 1)),
        (dt.date(2024, 2, 1), dt.date(2024, 3, 1)),
        (dt.date(2024, 3, 1), None),
    ]
    assert [record.data_payload["status"] for record in timeline] == ["在用", "维修", "报废"]
