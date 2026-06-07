import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner_p1", password="pass"),
        "viewer": User.objects.create_user(username="viewer_p1", password="pass"),
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
        schema_code="asset_diff_studio",
        name="Asset Diff Studio",
        description="Schema for field diff api tests",
        icon="boxes",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "Asset No", "type": "text", "introduced_in_version": 1},
            {"key": "status", "label": "Status", "type": "text", "introduced_in_version": 1},
            {"key": "owner", "label": "Owner", "type": "text", "introduced_in_version": 1},
        ],
        current_version=1,
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="init",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role="viewer",
        added_by=users["owner"],
    )
    return schema


@pytest.mark.django_db
def test_changeset_field_diffs_endpoint_returns_paginated_field_rows(client, users, schema):
    entity_a = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    entity_b = Entity.objects.create(schema=schema, business_code="B-001", created_by=users["owner"])

    left = ChangeSet.objects.create(
        schema=schema,
        summary="left update",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="right update",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )

    ChangeEntry.objects.create(
        change_set=left,
        entity=entity_b,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "B-001", "status": "active", "owner": "Bob"},
        data_after={"asset_no": "B-001", "status": "repair", "owner": "Bob"},
        valid_from=dt.date(2024, 8, 1),
    )
    ChangeEntry.objects.create(
        change_set=right,
        entity=entity_a,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "active", "owner": "Alice"},
        data_after={"asset_no": "A-001", "status": "retired", "owner": "Carol"},
        valid_from=dt.date(2024, 8, 2),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/compare/field-diffs",
        {"left": str(left.id), "right": str(right.id), "page": "1", "page_size": "2"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["diff_mode"] == "changeset"
    assert payload["left"]["id"] == left.id
    assert payload["right"]["id"] == right.id
    assert payload["count"] == 3
    assert payload["page"] == 1
    assert payload["page_size"] == 2
    assert payload["total_pages"] == 2
    assert payload["summary"]["diff_count"] == 3
    assert payload["summary"]["affected_entity_count"] == 2
    assert payload["summary"]["action_counts"] == {"create": 0, "update": 3, "terminate": 0}

    first = payload["results"][0]
    assert {
        "id",
        "side",
        "entity",
        "field",
        "before",
        "after",
        "action",
        "entry_id",
        "change_set_id",
        "recorded_at",
        "valid_from",
    }.issubset(first)
    assert {item["field"]["key"] for item in payload["results"]}.issubset({"status", "owner"})
    assert [
        (item["entity"]["display_code"], item["field"]["key"], item["side"])
        for item in payload["results"]
    ] == [("A-001", "owner", "right"), ("A-001", "status", "right")]


@pytest.mark.django_db
def test_changeset_field_diffs_endpoint_allows_self_compare_with_unique_row_ids(
    client, users, schema
):
    entity = Entity.objects.create(schema=schema, business_code="A-100", created_by=users["owner"])
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="self compare",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entry = ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-100", "status": "active", "owner": "Alice"},
        data_after={"asset_no": "A-100", "status": "retired", "owner": "Bob"},
        valid_from=dt.date(2024, 8, 3),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/compare/field-diffs",
        {"left": str(change_set.id), "right": str(change_set.id), "page": "1", "page_size": "10"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 4
    ids = [item["id"] for item in payload["results"]]
    assert len(ids) == len(set(ids))
    assert {item["side"] for item in payload["results"]} == {"left", "right"}
    assert f"left:{change_set.id}:{entry.id}:owner" in ids
    assert f"right:{change_set.id}:{entry.id}:owner" in ids


@pytest.mark.django_db
def test_changeset_field_diffs_endpoint_excludes_hidden_system_fields(client, users, schema):
    schema.fields_config = [
        *schema.fields_config,
        {
            "key": "internal_flag",
            "label": "Internal Flag",
            "type": "text",
            "hidden": True,
            "system": True,
            "introduced_in_version": 1,
        },
    ]
    schema.save(update_fields=["fields_config"])
    entity = Entity.objects.create(schema=schema, business_code="A-200", created_by=users["owner"])
    left = ChangeSet.objects.create(
        schema=schema,
        summary="left visible change",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="right hidden change",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    ChangeEntry.objects.create(
        change_set=left,
        entity=entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-200", "status": "active"},
        data_after={"asset_no": "A-200", "status": "repair"},
        valid_from=dt.date(2024, 8, 4),
    )
    ChangeEntry.objects.create(
        change_set=right,
        entity=entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-200", "status": "active"},
        data_after={"asset_no": "A-200", "status": "active", "internal_flag": "do-not-leak"},
        valid_from=dt.date(2024, 8, 5),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/compare/field-diffs",
        {"left": str(left.id), "right": str(right.id), "page": "1", "page_size": "50"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "internal_flag" not in {item["field"]["key"] for item in payload["results"]}
    assert "internal_flag" not in {item["key"] for item in payload["summary"]["top_fields"]}
    assert "internal_flag" not in str(payload)


@pytest.mark.django_db
def test_changeset_field_diffs_endpoint_masks_sensitive_values_for_viewer(client, users):
    schema = DataSchema.objects.create(
        schema_code="employee_cards",
        name="Employee Cards",
        description="Schema for sensitive field masking in field diff api tests",
        icon="id-card",
        temporal_mode="continuous",
        identity_field_key="employee_no",
        fields_config=[
            {"key": "employee_no", "label": "Employee No", "type": "text", "introduced_in_version": 1},
            {
                "key": "salary",
                "label": "Salary",
                "type": "number",
                "sensitive": True,
                "masking": {"mode": "full", "visible_roles": ["owner"]},
                "introduced_in_version": 1,
            },
        ],
        current_version=1,
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="init",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role="viewer",
        added_by=users["owner"],
    )
    entity = Entity.objects.create(schema=schema, business_code="E-001", created_by=users["owner"])
    left = ChangeSet.objects.create(
        schema=schema,
        summary="left baseline",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="right salary update",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    ChangeEntry.objects.create(
        change_set=right,
        entity=entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"employee_no": "E-001", "salary": 120000},
        data_after={"employee_no": "E-001", "salary": 130000},
        valid_from=dt.date(2024, 8, 8),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/compare/field-diffs",
        {"left": str(left.id), "right": str(right.id), "page": "1", "page_size": "10"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "120000" not in str(payload)
    assert "130000" not in str(payload)

    salary_row = next(item for item in payload["results"] if item["field"]["key"] == "salary")
    assert salary_row["field"]["key"] == "salary"
    assert salary_row["before"] == {"kind": "masked", "display": "***"}
    assert salary_row["after"] == {"kind": "masked", "display": "***"}


@pytest.mark.django_db
def test_changeset_field_diffs_endpoint_sorts_by_formula_display_code(client, users, schema):
    schema.fields_config = [
        {
            "key": "asset_no",
            "label": "Asset No",
            "type": "text",
            "introduced_in_version": 1,
            "identity_display_template": "{score_label}",
        },
        {"key": "score", "label": "Score", "type": "number", "introduced_in_version": 1},
        {
            "key": "score_label",
            "label": "Score Label",
            "type": "formula",
            "validators": {"expression": '"S" + score', "result_type": "text"},
            "introduced_in_version": 1,
        },
    ]
    schema.save(update_fields=["fields_config"])

    left_entity = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    right_entity = Entity.objects.create(schema=schema, business_code="B-001", created_by=users["owner"])
    left = ChangeSet.objects.create(
        schema=schema,
        summary="left score",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="right score",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    ChangeEntry.objects.create(
        change_set=left,
        entity=left_entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "score": 0},
        data_after={"asset_no": "A-001", "score": 9},
        valid_from=dt.date(2024, 8, 6),
    )
    ChangeEntry.objects.create(
        change_set=right,
        entity=right_entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "B-001", "score": 0},
        data_after={"asset_no": "B-001", "score": 1},
        valid_from=dt.date(2024, 8, 7),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/compare/field-diffs",
        {"left": str(left.id), "right": str(right.id), "page": "1", "page_size": "2"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [item["entity"]["display_code"] for item in payload["results"]] == ["S1", "S9"]


@pytest.mark.django_db
def test_snapshot_diff_endpoint_returns_filtered_paginated_field_diffs(client, users, schema):
    entity = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    seed = ChangeSet.objects.create(
        schema=schema,
        summary="seed snapshot",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    update = ChangeSet.objects.create(
        schema=schema,
        summary="update snapshot",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    left_record = TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "active", "owner": "Alice"},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=seed,
        recorded_by=users["owner"],
    )
    right_record = TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "repair", "owner": "Alice"},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=update,
        recorded_by=users["owner"],
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "search": "A-001",
            "ordering": "business_code",
            "page": "1",
            "page_size": "80",
            "mode": "fields",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["diff_mode"] == "snapshot"
    assert payload["scope"] == {
        "left_at": "2026-05-10",
        "right_at": "2026-05-25",
        "retro": False,
        "search": "A-001",
        "ordering": "business_code",
        "mode": "fields",
    }
    assert payload["summary"]["diff_count"] == 1
    assert payload["summary"]["affected_entity_count"] == 1
    assert payload["summary"]["left_count"] == 1
    assert payload["summary"]["right_count"] == 1
    assert payload["summary"]["top_fields"] == [{"key": "status", "label": "Status", "count": 1}]
    assert payload["summary"]["action_counts"] == {"create": 0, "update": 1, "terminate": 0}
    assert payload["count"] == 1
    assert payload["page"] == 1
    assert payload["page_size"] == 80
    assert payload["total_pages"] == 1

    first = payload["results"][0]
    assert first["id"] == f"snapshot:{entity.id}:status"
    assert first["entity"] == {
        "id": entity.id,
        "business_code": "A-001",
        "display_code": "A-001",
    }
    assert first["field"] == {"key": "status", "label": "Status"}
    assert first["before"] == "active"
    assert first["after"] == "repair"
    assert first["action"] == "update"
    assert first["left_record_id"] == left_record.id
    assert first["right_record_id"] == right_record.id
    assert first["left_change_set_id"] == seed.id
    assert first["right_change_set_id"] == update.id
    assert first["recorded_at"] == right_record.recorded_at.isoformat()


@pytest.mark.django_db
def test_snapshot_diff_requires_left_and_right_dates(client, users, schema):
    response = auth(client, users["viewer"]).get(f"/api/v1/schemas/{schema.id}/snapshot-diff")

    assert response.status_code == 400
    payload = response.json()
    assert "left_at" in payload
    assert "right_at" in payload


@pytest.mark.django_db
def test_snapshot_diff_ordering_changes_display_order_not_count(client, users, schema):
    left = ChangeSet.objects.create(
        schema=schema,
        summary="baseline snapshot",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="changed snapshot",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entity_a = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    entity_b = Entity.objects.create(schema=schema, business_code="B-001", created_by=users["owner"])
    TemporalRecord.objects.create(
        entity=entity_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "active", "owner": "Alice"},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=left,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=entity_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "active", "owner": "Bob"},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=left,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=entity_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "repair", "owner": "Alice"},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=right,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=entity_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "retired", "owner": "Bob"},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=right,
        recorded_by=users["owner"],
    )

    asc = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "ordering": "business_code",
            "page": "1",
            "page_size": "80",
            "mode": "fields",
        },
    )
    desc = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "ordering": "-business_code",
            "page": "1",
            "page_size": "80",
            "mode": "fields",
        },
    )

    assert asc.status_code == 200
    assert desc.status_code == 200
    assert asc.json()["count"] == desc.json()["count"] == 2
    assert [item["entity"]["business_code"] for item in asc.json()["results"]] == ["A-001", "B-001"]
    assert [item["entity"]["business_code"] for item in desc.json()["results"]] == ["B-001", "A-001"]


@pytest.mark.django_db
def test_snapshot_diff_serializes_only_current_page_rows(client, users, schema, monkeypatch):
    from apps.temporal import api as temporal_api

    left = ChangeSet.objects.create(
        schema=schema,
        summary="baseline snapshot page serialization",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="updated snapshot page serialization",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    for business_code, before_status, after_status in (
        ("A-001", "active", "repair"),
        ("B-001", "active", "retired"),
        ("C-001", "active", "lost"),
    ):
        entity = Entity.objects.create(
            schema=schema,
            business_code=business_code,
            created_by=users["owner"],
        )
        TemporalRecord.objects.create(
            entity=entity,
            schema_version=1,
            data_payload={"asset_no": business_code, "status": before_status, "owner": business_code},
            valid_from=dt.date(2026, 5, 1),
            valid_to=dt.date(2026, 5, 25),
            change_set=left,
            recorded_by=users["owner"],
        )
        TemporalRecord.objects.create(
            entity=entity,
            schema_version=1,
            data_payload={"asset_no": business_code, "status": after_status, "owner": business_code},
            valid_from=dt.date(2026, 5, 25),
            valid_to=None,
            change_set=right,
            recorded_by=users["owner"],
        )

    serialize_calls: list[dict[str, object] | None] = []
    original_serialize = temporal_api.serialize_data_payload

    def counting_serialize(schema_arg, fields_config_arg, data_payload_arg, user_arg):
        serialize_calls.append(data_payload_arg)
        return original_serialize(schema_arg, fields_config_arg, data_payload_arg, user_arg)

    monkeypatch.setattr(temporal_api, "serialize_data_payload", counting_serialize)

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "ordering": "business_code",
            "page": "1",
            "page_size": "1",
            "mode": "fields",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 3
    assert len(payload["results"]) == 1
    assert payload["results"][0]["entity"]["business_code"] == "A-001"
    assert len(serialize_calls) == 2
    assert [call["asset_no"] for call in serialize_calls] == ["A-001", "A-001"]
    assert [call["status"] for call in serialize_calls] == ["active", "repair"]


@pytest.mark.django_db
def test_snapshot_diff_keeps_sensitive_changed_field_for_viewer_with_masked_values(client, users):
    schema = DataSchema.objects.create(
        schema_code="employee_snapshot_diff",
        name="Employee Snapshot Diff",
        description="Schema for sensitive snapshot diff masking tests",
        icon="id-card",
        temporal_mode="continuous",
        identity_field_key="employee_no",
        fields_config=[
            {"key": "employee_no", "label": "Employee No", "type": "text", "introduced_in_version": 1},
            {
                "key": "salary",
                "label": "Salary",
                "type": "number",
                "sensitive": True,
                "masking": {"mode": "full", "visible_roles": ["owner"]},
                "introduced_in_version": 1,
            },
        ],
        current_version=1,
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="init",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role="viewer",
        added_by=users["owner"],
    )
    seed = ChangeSet.objects.create(
        schema=schema,
        summary="salary baseline",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    update = ChangeSet.objects.create(
        schema=schema,
        summary="salary update",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entity = Entity.objects.create(schema=schema, business_code="E-001", created_by=users["owner"])
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"employee_no": "E-001", "salary": 120000},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=seed,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"employee_no": "E-001", "salary": 130000},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=update,
        recorded_by=users["owner"],
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "page": "1",
            "page_size": "20",
            "mode": "fields",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "120000" not in str(payload)
    assert "130000" not in str(payload)

    salary_row = next(item for item in payload["results"] if item["field"]["key"] == "salary")
    assert salary_row["field"] == {"key": "salary", "label": "Salary"}
    assert salary_row["action"] == "update"
    assert salary_row["before"] == {"kind": "masked", "display": "***"}
    assert salary_row["after"] == {"kind": "masked", "display": "***"}


@pytest.mark.django_db
def test_snapshot_diff_supports_desc_display_code_ordering_and_preserves_scope(
    client, users, schema
):
    from apps.temporal.api import _snapshot_current_view_ordering

    schema.fields_config = [
        {
            "key": "asset_no",
            "label": "Asset No",
            "type": "text",
            "introduced_in_version": 1,
            "identity_display_template": "{score_label}",
        },
        {"key": "status", "label": "Status", "type": "text", "introduced_in_version": 1},
        {"key": "score", "label": "Score", "type": "number", "introduced_in_version": 1},
        {
            "key": "score_label",
            "label": "Score Label",
            "type": "formula",
            "validators": {"expression": '"S" + score', "result_type": "text"},
            "introduced_in_version": 1,
        },
    ]
    schema.save(update_fields=["fields_config"])
    assert _snapshot_current_view_ordering("-display_code") == "-business_code"

    left = ChangeSet.objects.create(
        schema=schema,
        summary="baseline display order",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="changed display order",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entity_a = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    entity_b = Entity.objects.create(schema=schema, business_code="B-001", created_by=users["owner"])
    TemporalRecord.objects.create(
        entity=entity_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "active", "score": 9},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=left,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=entity_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "active", "score": 1},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=left,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=entity_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "repair", "score": 9},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=right,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=entity_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "retired", "score": 1},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=right,
        recorded_by=users["owner"],
    )

    asc = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "ordering": "display_code",
            "page": "1",
            "page_size": "80",
            "mode": "fields",
        },
    )
    desc = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "ordering": "-display_code",
            "page": "1",
            "page_size": "80",
            "mode": "fields",
        },
    )

    assert asc.status_code == 200
    assert desc.status_code == 200
    assert asc.json()["scope"]["ordering"] == "display_code"
    assert desc.json()["scope"]["ordering"] == "-display_code"
    assert asc.json()["count"] == desc.json()["count"] == 2
    assert [item["entity"]["display_code"] for item in asc.json()["results"]] == ["S1", "S9"]
    assert [item["entity"]["display_code"] for item in desc.json()["results"]] == ["S9", "S1"]


@pytest.mark.django_db
def test_snapshot_diff_handles_create_terminate_and_missing_vs_explicit_null(
    client, users, schema
):
    schema.fields_config = [
        *schema.fields_config,
        {"key": "note", "label": "Note", "type": "text", "introduced_in_version": 1},
    ]
    schema.save(update_fields=["fields_config"])

    left = ChangeSet.objects.create(
        schema=schema,
        summary="left snapshot semantics",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    right = ChangeSet.objects.create(
        schema=schema,
        summary="right snapshot semantics",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )

    create_entity = Entity.objects.create(
        schema=schema,
        business_code="C-001",
        created_by=users["owner"],
    )
    terminate_entity = Entity.objects.create(
        schema=schema,
        business_code="T-001",
        created_by=users["owner"],
    )
    null_create_entity = Entity.objects.create(
        schema=schema,
        business_code="N-001",
        created_by=users["owner"],
    )
    null_terminate_entity = Entity.objects.create(
        schema=schema,
        business_code="N-002",
        created_by=users["owner"],
    )

    terminate_left = TemporalRecord.objects.create(
        entity=terminate_entity,
        schema_version=1,
        data_payload={"asset_no": "T-001", "status": "retired", "owner": "Tom"},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=left,
        recorded_by=users["owner"],
    )
    null_create_left = TemporalRecord.objects.create(
        entity=null_create_entity,
        schema_version=1,
        data_payload={"asset_no": "N-001", "status": "active", "owner": "Nina"},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=left,
        recorded_by=users["owner"],
    )
    null_terminate_left = TemporalRecord.objects.create(
        entity=null_terminate_entity,
        schema_version=1,
        data_payload={"asset_no": "N-002", "status": "active", "owner": "Nora", "note": None},
        valid_from=dt.date(2026, 5, 1),
        valid_to=dt.date(2026, 5, 25),
        change_set=left,
        recorded_by=users["owner"],
    )

    create_right = TemporalRecord.objects.create(
        entity=create_entity,
        schema_version=1,
        data_payload={"asset_no": "C-001", "status": "active", "owner": "Cara"},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=right,
        recorded_by=users["owner"],
    )
    null_create_right = TemporalRecord.objects.create(
        entity=null_create_entity,
        schema_version=1,
        data_payload={"asset_no": "N-001", "status": "active", "owner": "Nina", "note": None},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=right,
        recorded_by=users["owner"],
    )
    null_terminate_right = TemporalRecord.objects.create(
        entity=null_terminate_entity,
        schema_version=1,
        data_payload={"asset_no": "N-002", "status": "active", "owner": "Nora"},
        valid_from=dt.date(2026, 5, 25),
        valid_to=None,
        change_set=right,
        recorded_by=users["owner"],
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/snapshot-diff",
        {
            "left_at": "2026-05-10",
            "right_at": "2026-05-25",
            "ordering": "business_code",
            "page": "1",
            "page_size": "80",
            "mode": "fields",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["diff_count"] == 8
    assert payload["summary"]["affected_entity_count"] == 4
    assert payload["summary"]["left_count"] == 3
    assert payload["summary"]["right_count"] == 3
    assert payload["summary"]["action_counts"] == {"create": 4, "update": 0, "terminate": 4}
    assert payload["count"] == 8

    rows = {
        (item["entity"]["business_code"], item["field"]["key"]): item
        for item in payload["results"]
    }

    create_status = rows[("C-001", "status")]
    assert create_status["action"] == "create"
    assert create_status["before"] is None
    assert create_status["after"] == "active"
    assert create_status["left_record_id"] is None
    assert create_status["right_record_id"] == create_right.id
    assert create_status["left_change_set_id"] is None
    assert create_status["right_change_set_id"] == right.id

    terminate_status = rows[("T-001", "status")]
    assert terminate_status["action"] == "terminate"
    assert terminate_status["before"] == "retired"
    assert terminate_status["after"] is None
    assert terminate_status["left_record_id"] == terminate_left.id
    assert terminate_status["right_record_id"] is None
    assert terminate_status["left_change_set_id"] == left.id
    assert terminate_status["right_change_set_id"] is None

    null_create_note = rows[("N-001", "note")]
    assert null_create_note["action"] == "create"
    assert null_create_note["before"] is None
    assert null_create_note["after"] is None
    assert null_create_note["left_record_id"] == null_create_left.id
    assert null_create_note["right_record_id"] == null_create_right.id
    assert null_create_note["left_change_set_id"] == left.id
    assert null_create_note["right_change_set_id"] == right.id

    null_terminate_note = rows[("N-002", "note")]
    assert null_terminate_note["action"] == "terminate"
    assert null_terminate_note["before"] is None
    assert null_terminate_note["after"] is None
    assert null_terminate_note["left_record_id"] == null_terminate_left.id
    assert null_terminate_note["right_record_id"] == null_terminate_right.id
    assert null_terminate_note["left_change_set_id"] == left.id
    assert null_terminate_note["right_change_set_id"] == right.id
