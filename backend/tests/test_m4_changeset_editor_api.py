import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord
from apps.temporal.queries import get_entity_timeline


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "editor": User.objects.create_user(username="editor", password="pass"),
        "approver": User.objects.create_user(username="approver", password="pass"),
        "viewer": User.objects.create_user(username="viewer", password="pass"),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def schema(users):
    schema = DataSchema.objects.create(
        schema_code="asset_list",
        name="固定资产表",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "required": True},
            {
                "key": "status",
                "label": "状态",
                "type": "enum",
                "validators": {"options": ["在用", "维修", "报废"]},
            },
            {"key": "owner", "label": "负责人", "type": "text"},
        ],
        current_version=1,
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    for name, role in (("editor", "editor"), ("approver", "editor"), ("viewer", "viewer")):
        TableCollaborator.objects.create(
            schema=schema,
            user=users[name],
            role=role,
            added_by=users["owner"],
        )
    return schema


@pytest.fixture
def records(schema, users):
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="初始数据",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    asset_a = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    asset_b = Entity.objects.create(schema=schema, business_code="B-001", created_by=users["owner"])
    TemporalRecord.objects.create(
        entity=asset_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "维修", "owner": "张三"},
        valid_from=dt.date(2024, 6, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=asset_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "在用", "owner": "李四"},
        valid_from=dt.date(2024, 3, 1),
        valid_to=dt.date(2024, 9, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    return {"asset_a": asset_a, "asset_b": asset_b}


@pytest.mark.django_db
def test_editor_can_build_mixed_draft_and_submit_without_approval(client, users, schema, records):
    create_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "8 月资产盘点"},
        format="json",
    )

    assert create_response.status_code == 201
    draft = create_response.json()
    assert draft["status"] == "draft"
    assert draft["entry_count"] == 0

    create_entry = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "create",
            "valid_from": "2024-08-01",
            "data_after": {"asset_no": "C-001", "status": "在用", "owner": "王五"},
        },
        format="json",
    )
    update_entry = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "update",
            "entity_id": records["asset_a"].id,
            "valid_from": "2024-08-01",
            "data_after": {"status": "报废"},
        },
        format="json",
    )
    terminate_entry = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "terminate",
            "entity_id": records["asset_b"].id,
            "valid_from": "2024-07-01",
        },
        format="json",
    )

    assert create_entry.status_code == 201
    assert update_entry.status_code == 201
    assert update_entry.json()["data_before"]["status"] == "维修"
    assert update_entry.json()["data_after"] == {
        "asset_no": "A-001",
        "status": "报废",
        "owner": "张三",
    }
    assert terminate_entry.status_code == 201

    submit_response = client.post(
        f"/api/v1/changesets/{draft['id']}/submit",
        {"summary": "8 月资产盘点发布"},
        format="json",
    )

    assert submit_response.status_code == 200
    submitted = submit_response.json()
    assert submitted["status"] == "applied"
    assert submitted["summary"] == "8 月资产盘点发布"
    assert submitted["action_counts"] == {"create": 1, "update": 1, "terminate": 1}
    assert Entity.objects.filter(schema=schema, business_code="C-001").exists()
    assert get_entity_timeline(records["asset_a"])[-1].data_payload["status"] == "报废"
    assert get_entity_timeline(records["asset_b"])[0].valid_to == dt.date(2024, 7, 1)


@pytest.mark.django_db
def test_create_entry_normalizes_explicit_business_code_through_identity_resolver(
    client, users, schema
):
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "手工新增"},
        format="json",
    )
    draft = draft_response.json()

    response = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "create",
            "valid_from": "2024-08-01",
            "business_code": " C-001 ",
            "data_after": {"status": "在用", "owner": "王五"},
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data_after"]["asset_no"] == "C-001"
    assert Entity.objects.filter(schema=schema, business_code="C-001").exists()
    assert not Entity.objects.filter(schema=schema, business_code=" C-001 ").exists()


@pytest.mark.django_db
def test_create_entry_generates_auto_number_identity_when_missing(client, users):
    schema = DataSchema.objects.create(
        schema_code="asset_auto",
        name="自动编码资产表",
        temporal_mode="continuous",
        identity_field_key="entity_code",
        fields_config=[
            {
                "key": "entity_code",
                "label": "实体编码",
                "type": "auto-number",
                "required": True,
                "indexed": True,
                "validators": {
                    "prefix": "ASSET_AUTO-",
                    "padding": 6,
                    "sequence_reset_period": "none",
                },
            },
            {"key": "status", "label": "状态", "type": "text"},
        ],
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )
    Entity.objects.create(schema=schema, business_code="ASSET_AUTO-000001", created_by=users["owner"])
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "自动编号新增"},
        format="json",
    )
    draft = draft_response.json()

    response = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "create",
            "valid_from": "2024-08-01",
            "data_after": {"status": "在用"},
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["business_code"] == "ASSET_AUTO-000002"
    assert response.json()["data_after"]["entity_code"] == "ASSET_AUTO-000002"
    assert Entity.objects.filter(schema=schema, business_code="ASSET_AUTO-000002").exists()


@pytest.mark.django_db
def test_create_entry_uses_custom_auto_number_start_sequence(client, users):
    schema = DataSchema.objects.create(
        schema_code="equipment_registry",
        name="Equipment Registry",
        temporal_mode="continuous",
        identity_field_key="entity_code",
        fields_config=[
            {
                "key": "entity_code",
                "label": "Entity Code",
                "type": "auto-number",
                "required": True,
                "indexed": True,
                "validators": {
                    "prefix": "EQ-",
                    "padding": 4,
                    "start_sequence": 42,
                    "sequence_reset_period": "none",
                },
            },
            {"key": "status", "label": "Status", "type": "text"},
        ],
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "manual auto-number create"},
        format="json",
    )
    draft = draft_response.json()

    response = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "create",
            "valid_from": "2026-05-15",
            "data_after": {"status": "active"},
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["business_code"] == "EQ-0042"
    assert response.json()["data_after"]["entity_code"] == "EQ-0042"


@pytest.mark.django_db
def test_create_entry_resets_auto_number_identity_by_year(client, users):
    schema = DataSchema.objects.create(
        schema_code="equipment_registry",
        name="Equipment Registry",
        temporal_mode="continuous",
        identity_field_key="entity_code",
        fields_config=[
            {
                "key": "entity_code",
                "label": "Entity Code",
                "type": "auto-number",
                "required": True,
                "indexed": True,
                "validators": {
                    "prefix": "EQ-",
                    "padding": 3,
                    "start_sequence": 10,
                    "sequence_reset_period": "year",
                },
            },
            {"key": "status", "label": "Status", "type": "text"},
        ],
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )
    Entity.objects.create(schema=schema, business_code="EQ-2025-099", created_by=users["owner"])
    Entity.objects.create(schema=schema, business_code="EQ-2026-010", created_by=users["owner"])
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "manual auto-number create"},
        format="json",
    )
    draft = draft_response.json()

    response = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "create",
            "valid_from": "2026-05-15",
            "data_after": {"status": "active"},
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["business_code"] == "EQ-2026-011"
    assert response.json()["data_after"]["entity_code"] == "EQ-2026-011"


@pytest.mark.django_db
def test_update_entry_normalizes_unchanged_identity_through_identity_resolver(
    client, users, schema, records
):
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "更新资产"},
        format="json",
    )
    draft = draft_response.json()

    response = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "update",
            "entity_id": records["asset_a"].id,
            "valid_from": "2024-08-01",
            "data_after": {"asset_no": " A-001 ", "status": "报废"},
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data_after"]["asset_no"] == "A-001"
    assert response.json()["data_after"]["status"] == "报废"


@pytest.mark.django_db
def test_approval_required_submit_goes_to_pending_and_approver_applies(
    client, users, schema, records
):
    schema.approval_required = True
    schema.save(update_fields=["approval_required"])
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "需要审批的调整"},
        format="json",
    )
    draft = draft_response.json()
    client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "update",
            "entity_id": records["asset_a"].id,
            "valid_from": "2024-08-01",
            "data_after": {"status": "报废"},
        },
        format="json",
    )

    submitted_response = client.post(
        f"/api/v1/changesets/{draft['id']}/submit",
        {"approver_id": users["approver"].id},
        format="json",
    )

    assert submitted_response.status_code == 200
    submitted = submitted_response.json()
    assert submitted["status"] == "submitted"
    assert submitted["approver_id"] == users["approver"].id

    pending_response = auth(client, users["approver"]).get("/api/v1/changesets/pending/")

    assert pending_response.status_code == 200
    assert [item["id"] for item in pending_response.json()["results"]] == [draft["id"]]

    approve_response = client.post(f"/api/v1/changesets/{draft['id']}/approve")

    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "applied"
    assert get_entity_timeline(records["asset_a"])[-1].data_payload["status"] == "报废"


@pytest.mark.django_db
def test_approval_required_submit_accepts_schema_owner_as_approver(
    client, users, schema, records
):
    schema.approval_required = True
    schema.save(update_fields=["approval_required"])
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "owner approver"},
        format="json",
    )
    draft = draft_response.json()
    client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "update",
            "entity_id": records["asset_a"].id,
            "valid_from": "2024-08-01",
            "data_after": {"owner": "next-owner"},
        },
        format="json",
    )

    submitted_response = client.post(
        f"/api/v1/changesets/{draft['id']}/submit",
        {"approver_id": users["owner"].id},
        format="json",
    )

    assert submitted_response.status_code == 200
    submitted = submitted_response.json()
    assert submitted["status"] == "submitted"
    assert submitted["approver_id"] == users["owner"].id

    approve_response = auth(client, users["owner"]).post(
        f"/api/v1/changesets/{draft['id']}/approve"
    )

    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "applied"


@pytest.mark.django_db
def test_changeset_editor_rejects_viewer_and_invalid_approver(client, users, schema, records):
    denied = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "只读用户不能起草"},
        format="json",
    )
    assert denied.status_code == 403

    schema.approval_required = True
    schema.save(update_fields=["approval_required"])
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "审批人非法"},
        format="json",
    )
    draft = draft_response.json()
    client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "update",
            "entity_id": records["asset_a"].id,
            "valid_from": "2024-08-01",
            "data_after": {"status": "报废"},
        },
        format="json",
    )

    invalid = client.post(
        f"/api/v1/changesets/{draft['id']}/submit",
        {"approver_id": users["viewer"].id},
        format="json",
    )

    assert invalid.status_code == 400
    assert "approver_id" in invalid.json()


@pytest.mark.django_db
def test_editor_can_delete_draft_entry_and_discard_whole_draft(client, users, schema, records):
    draft_response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {"summary": "可撤回草稿"},
        format="json",
    )
    draft = draft_response.json()
    create_entry = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "create",
            "valid_from": "2024-08-01",
            "data_after": {"asset_no": "C-001", "status": "在用", "owner": "王五"},
        },
        format="json",
    )
    update_entry = client.post(
        f"/api/v1/changesets/{draft['id']}/entries/",
        {
            "action": "update",
            "entity_id": records["asset_a"].id,
            "valid_from": "2024-08-01",
            "data_after": {"status": "报废"},
        },
        format="json",
    )

    assert create_entry.status_code == 201
    assert update_entry.status_code == 201
    assert Entity.objects.filter(schema=schema, business_code="C-001").exists()

    delete_create = client.delete(
        f"/api/v1/changesets/{draft['id']}/entries/{create_entry.json()['id']}/"
    )
    detail_after_entry_delete = client.get(f"/api/v1/changesets/{draft['id']}/")

    assert delete_create.status_code == 204
    assert not Entity.objects.filter(schema=schema, business_code="C-001").exists()
    assert detail_after_entry_delete.json()["entry_count"] == 1

    delete_draft = client.delete(f"/api/v1/changesets/{draft['id']}/")

    assert delete_draft.status_code == 204
    assert not ChangeSet.objects.filter(pk=draft["id"]).exists()


@pytest.mark.django_db
def test_editor_cannot_delete_applied_changeset(client, users, schema, records):
    applied = ChangeSet.objects.create(
        schema=schema,
        summary="已生效批次",
        status=ChangeSet.Status.APPLIED,
        created_by=users["editor"],
        applied_at=timezone.now(),
    )

    response = auth(client, users["editor"]).delete(f"/api/v1/changesets/{applied.id}/")

    assert response.status_code == 400
    assert ChangeSet.objects.filter(pk=applied.id).exists()


@pytest.mark.django_db
def test_changeset_list_supports_status_creator_and_date_filters(client, users, schema):
    old_draft = ChangeSet.objects.create(
        schema=schema,
        summary="旧草稿",
        status=ChangeSet.Status.DRAFT,
        created_by=users["editor"],
    )
    old_draft.created_at = dt.datetime(2024, 7, 1, tzinfo=dt.UTC)
    old_draft.save(update_fields=["created_at"])
    submitted = ChangeSet.objects.create(
        schema=schema,
        summary="待审批",
        status=ChangeSet.Status.SUBMITTED,
        created_by=users["approver"],
    )
    submitted.created_at = dt.datetime(2024, 8, 1, tzinfo=dt.UTC)
    submitted.save(update_fields=["created_at"])
    new_draft = ChangeSet.objects.create(
        schema=schema,
        summary="新草稿",
        status=ChangeSet.Status.DRAFT,
        created_by=users["editor"],
    )
    new_draft.created_at = dt.datetime(2024, 8, 2, tzinfo=dt.UTC)
    new_draft.save(update_fields=["created_at"])

    response = auth(client, users["owner"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/",
        {
            "status": "draft",
            "created_by": users["editor"].id,
            "created_from": "2024-08-01",
            "created_to": "2024-08-31",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == new_draft.id
    assert payload["results"][0]["summary"] == "新草稿"
