import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.changesets.services import approve_changeset, reject_changeset, submit_changeset
from apps.notifications.models import Notification
from apps.schemas.models import DataSchema
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "submitter": User.objects.create_user(username="approval_submitter", password="pass"),
        "approver": User.objects.create_user(username="approval_approver", password="pass"),
    }


@pytest.fixture
def schema(users):
    return DataSchema.objects.create(
        schema_code="approval_assets",
        name="审批资产表",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text"},
            {"key": "status", "label": "状态", "type": "text"},
        ],
        current_version=1,
        owner=users["submitter"],
        visibility="shared",
        approval_required=True,
        created_by=users["submitter"],
    )


@pytest.fixture
def entity(schema, users):
    return Entity.objects.create(
        schema=schema,
        business_code="A-001",
        created_by=users["submitter"],
    )


def make_changeset(schema, users, *, status=ChangeSet.Status.DRAFT):
    return ChangeSet.objects.create(
        schema=schema,
        summary="审批通知测试",
        status=status,
        approval_required=True,
        approver=users["approver"],
        created_by=users["submitter"],
    )


def make_base_record(entity, users):
    base_change_set = ChangeSet.objects.create(
        schema=entity.schema,
        summary="初始化",
        status=ChangeSet.Status.APPLIED,
        created_by=users["submitter"],
        applied_at=timezone.now(),
    )
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=entity.schema.current_version,
        data_payload={"asset_no": "A-001", "status": "在用"},
        valid_from=dt.date(2024, 1, 1),
        change_set=base_change_set,
        recorded_by=users["submitter"],
    )


def add_update_entry(change_set, entity):
    return ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "在用"},
        data_after={"asset_no": "A-001", "status": "报废"},
        valid_from=dt.date(2024, 8, 1),
    )


@pytest.mark.django_db
def test_submit_approval_required_changeset_notifies_approver(
    django_capture_on_commit_callbacks,
    users,
    schema,
):
    change_set = make_changeset(schema, users)

    with django_capture_on_commit_callbacks(execute=True):
        submitted = submit_changeset(change_set, users["submitter"])

    assert submitted.status == ChangeSet.Status.SUBMITTED
    notification = Notification.objects.get(
        recipient=users["approver"],
        type=Notification.Type.APPROVAL_ASSIGNED,
        target_kind="changeset",
    )
    assert notification.actor == users["submitter"]
    assert notification.target_id == str(change_set.id)
    assert notification.target_url == f"/approvals?changeset_id={change_set.id}"
    assert notification.payload == {
        "schema_id": schema.id,
        "change_set_id": change_set.id,
        "status": ChangeSet.Status.SUBMITTED,
    }
    assert notification.dedupe_key == f"approval_assigned:{change_set.id}:{users['approver'].id}"


@pytest.mark.django_db
def test_approve_changeset_notifies_submitter(
    django_capture_on_commit_callbacks,
    users,
    schema,
    entity,
):
    make_base_record(entity, users)
    change_set = make_changeset(schema, users, status=ChangeSet.Status.SUBMITTED)
    add_update_entry(change_set, entity)

    with django_capture_on_commit_callbacks(execute=True):
        applied = approve_changeset(change_set, users["approver"])

    assert applied.status == ChangeSet.Status.APPLIED
    notification = Notification.objects.get(
        recipient=users["submitter"],
        type=Notification.Type.APPROVAL_UPDATED,
        target_kind="changeset",
    )
    assert notification.actor == users["approver"]
    assert notification.target_id == str(change_set.id)
    assert notification.target_url == f"/schemas/{schema.id}/records?change_set={change_set.id}"
    assert notification.payload == {
        "schema_id": schema.id,
        "change_set_id": change_set.id,
        "status": ChangeSet.Status.APPROVED,
    }
    assert notification.severity == Notification.Severity.SUCCESS
    assert notification.dedupe_key == f"approval_updated:{change_set.id}:approved"
    assert "通过" in notification.body


@pytest.mark.django_db
def test_reject_changeset_notifies_submitter(
    django_capture_on_commit_callbacks,
    users,
    schema,
):
    change_set = make_changeset(schema, users, status=ChangeSet.Status.SUBMITTED)

    with django_capture_on_commit_callbacks(execute=True):
        rejected = reject_changeset(change_set, users["approver"], reason="数据有误")

    assert rejected.status == ChangeSet.Status.REJECTED
    notification = Notification.objects.get(
        recipient=users["submitter"],
        type=Notification.Type.APPROVAL_UPDATED,
        target_kind="changeset",
    )
    assert notification.actor == users["approver"]
    assert notification.target_id == str(change_set.id)
    assert notification.target_url == f"/schemas/{schema.id}/records?change_set={change_set.id}"
    assert notification.payload == {
        "schema_id": schema.id,
        "change_set_id": change_set.id,
        "status": ChangeSet.Status.REJECTED,
    }
    assert notification.severity == Notification.Severity.WARNING
    assert notification.dedupe_key == f"approval_updated:{change_set.id}:rejected"
    assert "驳回" in notification.body
