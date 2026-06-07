import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "editor": User.objects.create_user(username="editor", password="pass"),
        "viewer": User.objects.create_user(username="viewer", password="pass"),
        "outsider": User.objects.create_user(username="outsider", password="pass"),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def current_view_sql_from(queries):
    table_name = TemporalRecord._meta.db_table
    return [
        query["sql"]
        for query in queries
        if table_name in query["sql"] and "DISTINCT ON" in query["sql"]
    ]


def create_current_record(
    schema,
    user,
    change_set,
    business_code: str,
    *,
    valid_from: dt.date | None = None,
    valid_to: dt.date | None = None,
    schema_version: int = 2,
    payload: dict | None = None,
):
    entity = Entity.objects.create(schema=schema, business_code=business_code, created_by=user)
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=schema_version,
        data_payload=payload or {"asset_no": business_code, "status": "在用"},
        valid_from=valid_from or dt.date(2024, 1, 1),
        valid_to=valid_to,
        change_set=change_set,
        recorded_by=user,
    )


@pytest.fixture
def schema(users):
    schema = DataSchema.objects.create(
        schema_code="asset_list",
        name="固定资产表",
        description="内部资产台账",
        icon="boxes",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "introduced_in_version": 1},
            {
                "key": "status",
                "label": "状态",
                "type": "enum",
                "validators": {"options": ["在用", "维修", "报废"]},
                "introduced_in_version": 1,
            },
            {"key": "owner", "label": "负责人", "type": "text", "introduced_in_version": 2},
        ],
        current_version=2,
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config[:2],
        changelog="初始版本",
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=2,
        fields_config=schema.fields_config,
        changelog="新增负责人",
        created_by=users["owner"],
    )
    SchemaVersion.objects.filter(schema=schema, version=1).update(
        created_at=dt.datetime(2024, 1, 1, tzinfo=dt.UTC)
    )
    SchemaVersion.objects.filter(schema=schema, version=2).update(
        created_at=dt.datetime(2024, 7, 1, tzinfo=dt.UTC)
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role="viewer",
        added_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
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
    record_a1 = TemporalRecord.objects.create(
        entity=asset_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "在用"},
        valid_from=dt.date(2024, 1, 1),
        valid_to=dt.date(2024, 6, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    record_a2 = TemporalRecord.objects.create(
        entity=asset_a,
        schema_version=2,
        data_payload={"asset_no": "A-001", "status": "维修", "owner": "张三"},
        valid_from=dt.date(2024, 6, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    record_b1 = TemporalRecord.objects.create(
        entity=asset_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "在用"},
        valid_from=dt.date(2024, 3, 1),
        valid_to=dt.date(2024, 9, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=asset_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "错误旧值"},
        valid_from=dt.date(2024, 3, 1),
        valid_to=dt.date(2024, 9, 1),
        change_set=change_set,
        recorded_by=users["owner"],
        is_superseded=True,
    )
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=asset_a,
        action=ChangeEntry.Action.CREATE,
        data_after=record_a1.data_payload,
        valid_from=record_a1.valid_from,
        valid_to=record_a1.valid_to,
        new_record=record_a1,
    )
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=asset_a,
        action=ChangeEntry.Action.UPDATE,
        data_before=record_a1.data_payload,
        data_after=record_a2.data_payload,
        valid_from=record_a2.valid_from,
        new_record=record_a2,
    )
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=asset_b,
        action=ChangeEntry.Action.CREATE,
        data_after=record_b1.data_payload,
        valid_from=record_b1.valid_from,
        valid_to=record_b1.valid_to,
        new_record=record_b1,
    )
    return {"change_set": change_set, "asset_a": asset_a, "asset_b": asset_b}


@pytest.mark.django_db
def test_records_endpoint_returns_current_view_payload(client, users, schema, records):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/?at=2024-05-15"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"]["id"] == schema.id
    assert payload["schema"]["role"] == "viewer"
    assert payload["at"] == "2024-05-15"
    assert payload["retro"] is False
    assert payload["schema_version"] == 2
    assert payload["count"] == 2
    assert payload["page"] == 1
    assert payload["page_size"] == 50
    assert [field["key"] for field in payload["fields_config"]] == ["asset_no", "status", "owner"]
    assert [record["business_code"] for record in payload["results"]] == ["A-001", "B-001"]
    assert [record["data_payload"]["status"] for record in payload["results"]] == ["在用", "在用"]
    assert all(record["data_payload"]["status"] != "错误旧值" for record in payload["results"])
    assert payload["results"][0]["valid_to"] == "2024-06-01"


@pytest.mark.django_db
def test_records_endpoint_filters_by_change_set_entities(client, users, schema, records):
    focus_change_set = ChangeSet.objects.create(
        schema=schema,
        summary="只复核 A-001",
        status=ChangeSet.Status.DRAFT,
        created_by=users["owner"],
    )
    ChangeEntry.objects.create(
        change_set=focus_change_set,
        entity=records["asset_a"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "在用"},
        data_after={"asset_no": "A-001", "status": "维修"},
        valid_from=dt.date(2024, 5, 15),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {"at": "2024-05-15", "change_set": str(focus_change_set.id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert [record["business_code"] for record in payload["results"]] == ["A-001"]


@pytest.mark.django_db
def test_records_endpoint_pushes_down_business_code_count_and_page(
    client, users, schema, records
):
    for business_code in ["C-001", "D-001", "E-001"]:
        create_current_record(schema, users["owner"], records["change_set"], business_code)

    with CaptureQueriesContext(connection) as queries:
        response = auth(client, users["viewer"]).get(
            f"/api/v1/schemas/{schema.id}/records/",
            {
                "at": "2024-06-15",
                "ordering": "business_code",
                "page": "2",
                "page_size": "2",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 5
    assert payload["total_pages"] == 3
    assert [record["business_code"] for record in payload["results"]] == ["C-001", "D-001"]

    current_view_sql = "\n".join(current_view_sql_from(queries)).upper()
    assert "COUNT(*)" in current_view_sql
    assert "LIMIT" in current_view_sql
    assert "OFFSET" in current_view_sql


@pytest.mark.django_db
def test_records_endpoint_pushes_down_meta_ordering_with_null_boundary(
    client, users, schema, records
):
    create_current_record(
        schema,
        users["owner"],
        records["change_set"],
        "C-001",
        valid_to=dt.date(2024, 8, 1),
    )
    create_current_record(schema, users["owner"], records["change_set"], "D-001")
    create_current_record(
        schema,
        users["owner"],
        records["change_set"],
        "E-001",
        valid_to=dt.date(2024, 7, 1),
    )

    with CaptureQueriesContext(connection) as queries:
        ascending = auth(client, users["viewer"]).get(
            f"/api/v1/schemas/{schema.id}/records/",
            {"at": "2024-06-15", "ordering": "valid_to", "page_size": "5"},
        )
        descending = client.get(
            f"/api/v1/schemas/{schema.id}/records/",
            {"at": "2024-06-15", "ordering": "-valid_to", "page_size": "5"},
        )

    assert ascending.status_code == 200
    assert descending.status_code == 200
    assert [record["business_code"] for record in ascending.json()["results"]] == [
        "E-001",
        "C-001",
        "B-001",
        "A-001",
        "D-001",
    ]
    assert [record["business_code"] for record in descending.json()["results"]] == [
        "A-001",
        "D-001",
        "B-001",
        "C-001",
        "E-001",
    ]
    current_view_sql = "\n".join(current_view_sql_from(queries)).upper()
    assert current_view_sql.count("COUNT(*)") == 2
    assert current_view_sql.count("LIMIT") == 2


@pytest.mark.django_db
def test_records_locate_endpoint_finds_business_code_page_in_both_directions(
    client, users, schema, records
):
    for business_code in ["C-001", "E-001"]:
        create_current_record(schema, users["owner"], records["change_set"], business_code)
    target = create_current_record(schema, users["owner"], records["change_set"], "D-001")

    with CaptureQueriesContext(connection) as queries:
        ascending = auth(client, users["viewer"]).get(
            f"/api/v1/schemas/{schema.id}/records/locate",
            {
                "at": "2024-06-15",
                "ordering": "business_code",
                "page_size": "2",
                "entity_id": str(target.entity_id),
            },
        )
        descending = client.get(
            f"/api/v1/schemas/{schema.id}/records/locate",
            {
                "at": "2024-06-15",
                "ordering": "-business_code",
                "page_size": "2",
                "entity_id": str(target.entity_id),
            },
        )

    assert ascending.status_code == 200
    assert ascending.json() == {
        "schema_id": schema.id,
        "at": "2024-06-15",
        "retro": False,
        "entity_id": target.entity_id,
        "record_id": target.id,
        "supported": True,
        "found": True,
        "ordering": "business_code",
        "page": 2,
        "page_size": 2,
        "offset": 3,
        "position": 4,
        "count": 5,
    }
    assert descending.status_code == 200
    assert descending.json()["page"] == 1
    assert descending.json()["offset"] == 1
    assert descending.json()["position"] == 2
    current_view_sql = "\n".join(current_view_sql_from(queries)).upper()
    assert "ROW_NUMBER()" in current_view_sql


@pytest.mark.django_db
def test_records_locate_endpoint_matches_valid_to_null_ordering(client, users, schema, records):
    create_current_record(
        schema,
        users["owner"],
        records["change_set"],
        "C-001",
        valid_to=dt.date(2024, 8, 1),
    )
    target = create_current_record(schema, users["owner"], records["change_set"], "D-001")
    create_current_record(
        schema,
        users["owner"],
        records["change_set"],
        "E-001",
        valid_to=dt.date(2024, 7, 1),
    )

    ascending = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/locate",
        {
            "at": "2024-06-15",
            "ordering": "valid_to",
            "page_size": "2",
            "entity_id": str(target.entity_id),
        },
    )
    descending = client.get(
        f"/api/v1/schemas/{schema.id}/records/locate",
        {
            "at": "2024-06-15",
            "ordering": "-valid_to",
            "page_size": "2",
            "entity_id": str(target.entity_id),
        },
    )

    assert ascending.status_code == 200
    assert ascending.json()["page"] == 3
    assert ascending.json()["offset"] == 4
    assert ascending.json()["position"] == 5
    assert descending.status_code == 200
    assert descending.json()["page"] == 1
    assert descending.json()["offset"] == 1
    assert descending.json()["position"] == 2


@pytest.mark.django_db
def test_records_locate_endpoint_reports_non_current_entity(client, users, schema, records):
    future = create_current_record(
        schema,
        users["owner"],
        records["change_set"],
        "Z-001",
        valid_from=dt.date(2025, 1, 1),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/locate",
        {
            "at": "2024-06-15",
            "ordering": "business_code",
            "page_size": "2",
            "entity_id": str(future.entity_id),
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "schema_id": schema.id,
        "at": "2024-06-15",
        "retro": False,
        "entity_id": future.entity_id,
        "supported": True,
        "found": False,
        "reason": "entity_not_in_current_view",
        "ordering": "business_code",
        "page_size": 2,
        "count": 2,
    }


@pytest.mark.django_db
def test_records_locate_endpoint_reports_unsupported_scopes(client, users, schema, records):
    schema.fields_config = [
        *schema.fields_config,
        {"key": "rank", "label": "Rank", "type": "number", "introduced_in_version": 2},
    ]
    schema.save(update_fields=["fields_config"])

    search = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/locate",
        {
            "at": "2024-06-15",
            "search": "A-001",
            "entity_id": str(records["asset_a"].id),
        },
    )
    change_set = client.get(
        f"/api/v1/schemas/{schema.id}/records/locate",
        {
            "at": "2024-06-15",
            "change_set": str(records["change_set"].id),
            "entity_id": str(records["asset_a"].id),
        },
    )
    json_ordering = client.get(
        f"/api/v1/schemas/{schema.id}/records/locate",
        {
            "at": "2024-06-15",
            "ordering": "rank",
            "entity_id": str(records["asset_a"].id),
        },
    )

    assert search.status_code == 200
    assert search.json()["supported"] is False
    assert search.json()["reason"] == "search_scope_not_supported"
    assert change_set.status_code == 200
    assert change_set.json()["supported"] is False
    assert change_set.json()["reason"] == "change_set_scope_not_supported"
    assert json_ordering.status_code == 200
    assert json_ordering.json()["supported"] is False
    assert json_ordering.json()["reason"] == "ordering_not_supported"


@pytest.mark.django_db
def test_records_locate_endpoint_respects_schema_visibility(client, users, schema, records):
    response = auth(client, users["outsider"]).get(
        f"/api/v1/schemas/{schema.id}/records/locate",
        {"at": "2024-06-15", "entity_id": str(records["asset_a"].id)},
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_records_endpoint_keeps_json_field_ordering_on_python_path(
    client, users, schema, records
):
    schema.fields_config = [
        *schema.fields_config,
        {"key": "rank", "label": "Rank", "type": "number", "introduced_in_version": 2},
    ]
    schema.save(update_fields=["fields_config"])
    TemporalRecord.objects.filter(entity=records["asset_a"], valid_to__isnull=True).update(
        data_payload={"asset_no": "A-001", "status": "维修", "owner": "张三", "rank": 9}
    )
    TemporalRecord.objects.filter(entity=records["asset_b"], is_superseded=False).update(
        data_payload={"asset_no": "B-001", "status": "在用", "rank": 10}
    )

    with CaptureQueriesContext(connection) as queries:
        response = auth(client, users["viewer"]).get(
            f"/api/v1/schemas/{schema.id}/records/",
            {"at": "2024-06-01", "ordering": "rank", "page": "1", "page_size": "1"},
        )

    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert [record["business_code"] for record in response.json()["results"]] == ["A-001"]

    current_view_sql = "\n".join(current_view_sql_from(queries)).upper()
    assert "COUNT(*)" not in current_view_sql
    assert "LIMIT" not in current_view_sql


@pytest.mark.django_db
def test_records_endpoint_keeps_search_on_python_path(client, users, schema, records):
    with CaptureQueriesContext(connection) as queries:
        response = auth(client, users["viewer"]).get(
            f"/api/v1/schemas/{schema.id}/records/",
            {"at": "2024-06-15", "search": "A-001", "page_size": "1"},
        )

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert [record["business_code"] for record in response.json()["results"]] == ["A-001"]

    current_view_sql = "\n".join(current_view_sql_from(queries)).upper()
    assert "COUNT(*)" not in current_view_sql
    assert "LIMIT" not in current_view_sql


@pytest.mark.django_db
def test_records_endpoint_respects_schema_visibility(client, users, schema, records):
    response = auth(client, users["outsider"]).get(
        f"/api/v1/schemas/{schema.id}/records/?at=2024-05-15"
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_records_endpoint_supports_retro_search_ordering_and_pagination(
    client, users, schema, records
):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {
            "at": "2024-06-01",
            "retro": "true",
            "search": "维修",
            "ordering": "-business_code",
            "page": "1",
            "page_size": "1",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["retro"] is True
    assert payload["schema_version"] == 1
    assert [field["key"] for field in payload["fields_config"]] == ["asset_no", "status"]
    assert payload["count"] == 1
    assert payload["total_pages"] == 1
    assert [record["business_code"] for record in payload["results"]] == ["A-001"]
    assert payload["results"][0]["data_payload"]["status"] == "维修"


@pytest.mark.django_db
def test_records_endpoint_searches_markdown_as_plain_text(client, users, schema, records):
    markdown_field = {
        "key": "maintenance_note",
        "label": "Maintenance Note",
        "type": "markdown",
        "introduced_in_version": 2,
    }
    schema.fields_config = [*schema.fields_config, markdown_field]
    schema.save(update_fields=["fields_config"])
    SchemaVersion.objects.filter(schema=schema, version=2).update(fields_config=schema.fields_config)
    TemporalRecord.objects.filter(entity=records["asset_a"], valid_to__isnull=True).update(
        data_payload={
            "asset_no": "A-001",
            "status": "maintenance",
            "owner": "alice",
            "maintenance_note": (
                "## Inspection\n\n"
                "[Pump guide](https://example.test/pump-guide)\n\n"
                "- replace seal"
            ),
        }
    )

    label_response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {"at": "2024-06-15", "search": "Pump guide"},
    )
    url_response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {"at": "2024-06-15", "search": "example.test"},
    )

    assert label_response.status_code == 200
    assert [record["business_code"] for record in label_response.json()["results"]] == ["A-001"]
    assert url_response.status_code == 200
    assert url_response.json()["count"] == 0


@pytest.mark.django_db
def test_records_endpoint_sorts_number_fields_numerically(client, users, schema, records):
    schema.fields_config = [
        *schema.fields_config,
        {"key": "rank", "label": "Rank", "type": "number", "introduced_in_version": 2},
    ]
    schema.save(update_fields=["fields_config"])
    TemporalRecord.objects.filter(entity=records["asset_a"], valid_to__isnull=True).update(
        data_payload={"asset_no": "A-001", "status": "维修", "owner": "张三", "rank": 9}
    )
    TemporalRecord.objects.filter(entity=records["asset_b"], is_superseded=False).update(
        data_payload={"asset_no": "B-001", "status": "在用", "rank": 10}
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {"at": "2024-06-01", "ordering": "rank"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [record["business_code"] for record in payload["results"]] == ["A-001", "B-001"]
    assert [record["data_payload"]["rank"] for record in payload["results"]] == [9, 10]


@pytest.mark.django_db
def test_records_endpoint_rejects_invalid_query_params(client, users, schema, records):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/?at=not-a-date"
    )

    assert response.status_code == 400
    assert response.json()["at"] == "日期格式必须是 YYYY-MM-DD"


@pytest.mark.django_db
def test_entity_timeline_endpoint_returns_temporal_lifecycle(client, users, schema, records):
    entity = records["asset_a"]

    response = auth(client, users["viewer"]).get(f"/api/v1/entities/{entity.id}/timeline/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["entity"]["id"] == entity.id
    assert payload["entity"]["business_code"] == "A-001"
    assert payload["schema"]["id"] == schema.id
    assert [item["data_payload"]["status"] for item in payload["records"]] == ["在用", "维修"]
    assert payload["records"][0]["valid_to"] == "2024-06-01"
    assert payload["records"][1]["change_summary"] == "初始数据"


@pytest.mark.django_db
def test_entity_timeline_endpoint_respects_visibility(client, users, records):
    entity = records["asset_a"]

    response = auth(client, users["outsider"]).get(f"/api/v1/entities/{entity.id}/timeline/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_entity_timeline_endpoint_masks_sensitive_and_excludes_hidden_system_fields(
    client, users, schema
):
    schema.fields_config = [
        *schema.fields_config,
        {
            "key": "id_card",
            "label": "ID Card",
            "type": "text",
            "sensitive": True,
            "masking": {"mode": "partial", "visible_roles": ["admin", "owner"]},
            "introduced_in_version": 2,
        },
        {
            "key": "internal_flag",
            "label": "Internal Flag",
            "type": "text",
            "hidden": True,
            "system": True,
            "introduced_in_version": 2,
        },
        {
            "key": "public_note",
            "label": "Public Note",
            "type": "text",
            "introduced_in_version": 2,
        },
    ]
    schema.save(update_fields=["fields_config"])
    admin = User.objects.create_superuser(username="admin", password="pass")
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="timeline masking and hidden field boundary",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entity = Entity.objects.create(schema=schema, business_code="M-001", created_by=users["owner"])
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=schema.current_version,
        data_payload={
            "asset_no": "M-001",
            "status": "active",
            "id_card": "110105199001011234",
            "internal_flag": "do-not-leak",
            "public_note": "visible to collaborators",
        },
        valid_from=dt.date(2024, 1, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )

    admin_response = auth(client, admin).get(f"/api/v1/entities/{entity.id}/timeline/")
    owner_response = auth(client, users["owner"]).get(f"/api/v1/entities/{entity.id}/timeline/")
    editor_response = auth(client, users["editor"]).get(f"/api/v1/entities/{entity.id}/timeline/")
    viewer_response = auth(client, users["viewer"]).get(f"/api/v1/entities/{entity.id}/timeline/")

    assert admin_response.status_code == 200
    admin_payload = admin_response.json()["records"][0]["data_payload"]
    assert admin_payload["id_card"] == "110105199001011234"
    assert admin_payload["public_note"] == "visible to collaborators"
    assert "internal_flag" not in admin_payload

    assert owner_response.status_code == 200
    owner_payload = owner_response.json()["records"][0]["data_payload"]
    assert owner_payload["id_card"] == "110105199001011234"
    assert owner_payload["public_note"] == "visible to collaborators"
    assert "internal_flag" not in owner_payload

    assert editor_response.status_code == 200
    editor_payload = editor_response.json()["records"][0]["data_payload"]
    assert editor_payload["id_card"] == {"kind": "masked", "display": "110***********1234"}
    assert editor_payload["public_note"] == "visible to collaborators"
    assert "internal_flag" not in editor_payload

    assert viewer_response.status_code == 200
    viewer_payload = viewer_response.json()["records"][0]["data_payload"]
    assert viewer_payload["id_card"] == {"kind": "masked", "display": "110***********1234"}
    assert viewer_payload["public_note"] == "visible to collaborators"
    assert "internal_flag" not in viewer_payload


@pytest.mark.django_db
def test_entity_timeline_endpoint_preserves_null_missing_and_valid_to_semantics(
    client, users, schema
):
    schema.fields_config = [
        *schema.fields_config,
        {"key": "note", "label": "Note", "type": "text", "introduced_in_version": 2},
    ]
    schema.save(update_fields=["fields_config"])
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="timeline null and terminate semantics",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )

    evolving_entity = Entity.objects.create(
        schema=schema,
        business_code="N-010",
        created_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=evolving_entity,
        schema_version=schema.current_version,
        data_payload={"asset_no": "N-010", "status": "active", "note": None},
        valid_from=dt.date(2024, 1, 1),
        valid_to=dt.date(2024, 6, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=evolving_entity,
        schema_version=schema.current_version,
        data_payload={"asset_no": "N-010", "status": "repair"},
        valid_from=dt.date(2024, 6, 1),
        valid_to=None,
        change_set=change_set,
        recorded_by=users["owner"],
    )

    terminated_entity = Entity.objects.create(
        schema=schema,
        business_code="N-011",
        created_by=users["owner"],
    )
    TemporalRecord.objects.create(
        entity=terminated_entity,
        schema_version=schema.current_version,
        data_payload={"asset_no": "N-011", "status": "retired", "note": None},
        valid_from=dt.date(2024, 2, 1),
        valid_to=dt.date(2024, 7, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )

    evolving_response = auth(client, users["viewer"]).get(
        f"/api/v1/entities/{evolving_entity.id}/timeline/"
    )
    terminated_response = auth(client, users["viewer"]).get(
        f"/api/v1/entities/{terminated_entity.id}/timeline/"
    )

    assert evolving_response.status_code == 200
    evolving_records = evolving_response.json()["records"]
    assert len(evolving_records) == 2
    assert evolving_records[0]["data_payload"]["note"] is None
    assert "note" not in evolving_records[1]["data_payload"]
    assert evolving_records[0]["valid_to"] == "2024-06-01"
    assert evolving_records[1]["valid_to"] is None

    assert terminated_response.status_code == 200
    terminated_records = terminated_response.json()["records"]
    assert len(terminated_records) == 1
    assert terminated_records[0]["data_payload"]["note"] is None
    assert terminated_records[0]["valid_to"] == "2024-07-01"


@pytest.mark.django_db
def test_changeset_stream_endpoint_returns_list_and_detail(client, users, schema, records):
    response = auth(client, users["viewer"]).get(f"/api/v1/schemas/{schema.id}/changesets/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    item = payload["results"][0]
    assert item["id"] == records["change_set"].id
    assert item["status"] == "applied"
    assert item["entry_count"] == 3
    assert item["action_counts"] == {"create": 2, "update": 1, "terminate": 0}

    detail = client.get(f"/api/v1/schemas/{schema.id}/changesets/{item['id']}/")

    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["id"] == item["id"]
    assert len(detail_payload["entries"]) == 3
    update_entry = next(entry for entry in detail_payload["entries"] if entry["action"] == "update")
    assert update_entry["changed_fields"] == ["owner", "status"]
    assert update_entry["data_before"]["status"] == "在用"
    assert update_entry["data_after"]["status"] == "维修"


@pytest.mark.django_db
def test_changeset_detail_paged_endpoint_keeps_full_batch_aggregates(
    client, users, schema, records
):
    change_set = records["change_set"]

    legacy = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/{change_set.id}/"
    )
    assert legacy.status_code == 200
    assert len(legacy.json()["entries"]) == 3
    assert "entries_page" not in legacy.json()

    response = client.get(
        f"/api/v1/schemas/{schema.id}/changesets/{change_set.id}/",
        {"entries_page": "2", "entries_page_size": "2"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "entries" not in payload
    assert payload["id"] == change_set.id
    assert payload["entry_count"] == 3
    assert payload["action_counts"] == {"create": 2, "update": 1, "terminate": 0}
    assert payload["entries_page"]["count"] == 3
    assert payload["entries_page"]["page"] == 2
    assert payload["entries_page"]["page_size"] == 2
    assert payload["entries_page"]["total_pages"] == 2
    assert [entry["business_code"] for entry in payload["entries_page"]["results"]] == ["A-001"]
    assert payload["entries_page"]["results"][0]["action"] == "update"

    aggregates = {item["key"]: item for item in payload["field_aggregates"]}
    assert aggregates["status"] == {
        "key": "status",
        "label": "状态",
        "change_count": 3,
        "entity_count": 2,
        "action_counts": {"create": 2, "update": 1, "terminate": 0},
    }
    assert aggregates["owner"] == {
        "key": "owner",
        "label": "负责人",
        "change_count": 1,
        "entity_count": 1,
        "action_counts": {"create": 0, "update": 1, "terminate": 0},
    }


@pytest.mark.django_db
def test_changeset_detail_paged_endpoint_excludes_hidden_system_field_aggregates(
    client, users, schema, records
):
    schema.fields_config = [
        *schema.fields_config,
        {
            "key": "internal_flag",
            "label": "内部标记",
            "type": "text",
            "hidden": True,
            "system": True,
            "introduced_in_version": 2,
        },
    ]
    schema.save(update_fields=["fields_config"])
    change_set = records["change_set"]
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=records["asset_a"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "维修", "owner": "张三"},
        data_after={
            "asset_no": "A-001",
            "status": "维修",
            "owner": "张三",
            "internal_flag": "do-not-leak",
        },
        valid_from=dt.date(2024, 8, 1),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/{change_set.id}/",
        {"entries_page": "1", "entries_page_size": "80"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "internal_flag" not in {item["key"] for item in payload["field_aggregates"]}
    assert all(
        "internal_flag" not in entry["changed_fields"]
        for entry in payload["entries_page"]["results"]
    )


@pytest.mark.django_db
def test_changeset_compare_endpoint_returns_full_batch_aggregates(client, users, schema, records):
    right = ChangeSet.objects.create(
        schema=schema,
        summary="复核调整",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    asset_c = Entity.objects.create(schema=schema, business_code="C-001", created_by=users["owner"])
    ChangeEntry.objects.create(
        change_set=right,
        entity=records["asset_a"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "维修", "owner": "张三"},
        data_after={"asset_no": "A-001", "status": "维修", "owner": "李四"},
        valid_from=dt.date(2024, 8, 1),
    )
    ChangeEntry.objects.create(
        change_set=right,
        entity=records["asset_b"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "B-001", "status": "在用"},
        data_after={"asset_no": "B-001", "status": "维修"},
        valid_from=dt.date(2024, 8, 1),
    )
    ChangeEntry.objects.create(
        change_set=right,
        entity=asset_c,
        action=ChangeEntry.Action.CREATE,
        data_after={"asset_no": "C-001", "status": "在用"},
        valid_from=dt.date(2024, 8, 1),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/compare",
        {"left": str(records["change_set"].id), "right": str(right.id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["left"]["id"] == records["change_set"].id
    assert payload["right"]["id"] == right.id
    assert payload["entity_overlap"] == {
        "left_entity_count": 2,
        "right_entity_count": 3,
        "shared_entity_count": 2,
        "left_only_entity_count": 0,
        "right_only_entity_count": 1,
    }
    assert payload["action_rows"] == [
        {"action": "create", "left": 2, "right": 1, "delta": -1},
        {"action": "update", "left": 1, "right": 2, "delta": 1},
        {"action": "terminate", "left": 0, "right": 0, "delta": 0},
    ]
    field_rows = {item["key"]: item for item in payload["field_rows"]}
    assert field_rows["status"] == {
        "key": "status",
        "label": "状态",
        "left_changes": 3,
        "right_changes": 2,
        "left_entities": 2,
        "right_entities": 2,
        "delta": -1,
    }
    assert field_rows["asset_no"]["delta"] == -1
    assert field_rows["owner"]["delta"] == 0


@pytest.mark.django_db
def test_changeset_compare_endpoint_excludes_hidden_system_fields(client, users, schema, records):
    schema.fields_config = [
        *schema.fields_config,
        {
            "key": "internal_flag",
            "label": "内部标记",
            "type": "text",
            "hidden": True,
            "system": True,
            "introduced_in_version": 2,
        },
    ]
    schema.save(update_fields=["fields_config"])
    right = ChangeSet.objects.create(
        schema=schema,
        summary="内部字段调整",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    ChangeEntry.objects.create(
        change_set=right,
        entity=records["asset_a"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "维修"},
        data_after={"asset_no": "A-001", "status": "维修", "internal_flag": "do-not-leak"},
        valid_from=dt.date(2024, 8, 1),
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/changesets/compare",
        {"left": str(records["change_set"].id), "right": str(right.id)},
    )

    assert response.status_code == 200
    assert "internal_flag" not in {item["key"] for item in response.json()["field_rows"]}


@pytest.mark.django_db
def test_cell_edit_endpoint_creates_reusable_draft_changeset_entry(client, users, schema, records):
    entity = records["asset_a"]
    payload = {"field_key": "status", "value": "报废", "at": "2024-06-01"}

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/records/{entity.id}/cell/",
        payload,
        format="json",
    )

    assert response.status_code == 201
    first = response.json()
    assert first["status"] == "draft"
    assert first["entry"]["action"] == "update"
    assert first["entry"]["data_before"]["status"] == "维修"
    assert first["entry"]["data_after"]["status"] == "报废"
    assert (
        ChangeSet.objects.filter(schema=schema, status="draft", created_by=users["editor"]).count()
        == 1
    )
    assert ChangeEntry.objects.filter(change_set_id=first["id"]).count() == 1

    second = client.post(
        f"/api/v1/schemas/{schema.id}/records/{entity.id}/cell/",
        {"field_key": "owner", "value": "李四", "at": "2024-06-01"},
        format="json",
    )

    assert second.status_code == 201
    assert second.json()["id"] == first["id"]
    assert ChangeEntry.objects.filter(change_set_id=first["id"]).count() == 1
    entry = ChangeEntry.objects.get(change_set_id=first["id"])
    assert entry.data_after == {"asset_no": "A-001", "status": "报废", "owner": "李四"}


@pytest.mark.django_db
def test_draft_overlay_endpoint_returns_current_user_cells_and_create_rows(
    client, users, schema, records
):
    editor_draft = ChangeSet.objects.create(
        schema=schema,
        summary="编辑员草稿",
        status=ChangeSet.Status.DRAFT,
        created_by=users["editor"],
    )
    owner_draft = ChangeSet.objects.create(
        schema=schema,
        summary="所有者草稿",
        status=ChangeSet.Status.DRAFT,
        created_by=users["owner"],
    )
    created_entity = Entity.objects.create(
        schema=schema,
        business_code="C-001",
        created_by=users["editor"],
    )
    update_entry = ChangeEntry.objects.create(
        change_set=editor_draft,
        entity=records["asset_a"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "维修", "owner": "张三"},
        data_after={"asset_no": "A-001", "status": "报废", "owner": "李四"},
        valid_from=dt.date(2024, 6, 1),
    )
    create_entry = ChangeEntry.objects.create(
        change_set=editor_draft,
        entity=created_entity,
        action=ChangeEntry.Action.CREATE,
        data_after={"asset_no": "C-001", "status": "在用", "owner": "王五"},
        valid_from=dt.date(2024, 6, 1),
    )
    ChangeEntry.objects.create(
        change_set=editor_draft,
        entity=records["asset_b"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "B-001", "status": "在用"},
        data_after={"asset_no": "B-001", "status": "维修"},
        valid_from=dt.date(2024, 7, 1),
    )
    ChangeEntry.objects.create(
        change_set=owner_draft,
        entity=records["asset_b"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "B-001", "status": "在用"},
        data_after={"asset_no": "B-001", "status": "报废"},
        valid_from=dt.date(2024, 6, 1),
    )

    response = auth(client, users["editor"]).get(
        f"/api/v1/schemas/{schema.id}/draft-overlay",
        {"at": "2024-06-01"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["at"] == "2024-06-01"
    assert [item["id"] for item in payload["change_sets"]] == [editor_draft.id]

    cells = {(item["entity_id"], item["field_key"]): item for item in payload["cells"]}
    assert set(cells) == {
        (records["asset_a"].id, "owner"),
        (records["asset_a"].id, "status"),
        (created_entity.id, "asset_no"),
        (created_entity.id, "owner"),
        (created_entity.id, "status"),
    }
    assert cells[(records["asset_a"].id, "status")] == {
        "key": f"2024-06-01:{records['asset_a'].id}:status",
        "entity_id": records["asset_a"].id,
        "field_key": "status",
        "value": "报废",
        "status": "draft",
        "change_set_id": editor_draft.id,
        "entry_id": update_entry.id,
    }

    assert len(payload["create_rows"]) == 1
    create_row = payload["create_rows"][0]
    assert create_row["record_id"] == -create_entry.id
    assert create_row["entity_id"] == created_entity.id
    assert create_row["business_code"] == "C-001"
    assert create_row["display_code"] == "C-001"
    assert create_row["data_payload"] == {
        "asset_no": "C-001",
        "status": "在用",
        "owner": "王五",
    }
    assert create_row["row_status"] == "new"
    assert create_row["changed_fields"] == ["asset_no", "status", "owner"]
    assert create_row["change_set_id"] == editor_draft.id


@pytest.mark.django_db
def test_draft_overlay_endpoint_masks_sensitive_values(client, users, schema, records):
    schema.fields_config = [
        *schema.fields_config,
        {
            "key": "secret_note",
            "label": "密级备注",
            "type": "text",
            "sensitive": True,
            "masking": {"visible_roles": ["owner"], "mode": "full"},
            "introduced_in_version": 2,
        },
        {
            "key": "internal_flag",
            "label": "内部标记",
            "type": "text",
            "hidden": True,
            "system": True,
            "introduced_in_version": 2,
        },
    ]
    schema.save(update_fields=["fields_config"])
    draft = ChangeSet.objects.create(
        schema=schema,
        summary="敏感字段草稿",
        status=ChangeSet.Status.DRAFT,
        created_by=users["editor"],
    )
    entry = ChangeEntry.objects.create(
        change_set=draft,
        entity=records["asset_a"],
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "A-001", "status": "维修", "owner": "张三"},
        data_after={
            "asset_no": "A-001",
            "status": "维修",
            "owner": "张三",
            "secret_note": "内部密钥",
            "internal_flag": "do-not-leak",
        },
        valid_from=dt.date(2024, 6, 1),
    )

    response = auth(client, users["editor"]).get(
        f"/api/v1/schemas/{schema.id}/draft-overlay",
        {"at": "2024-06-01"},
    )

    assert response.status_code == 200
    secret_cell = next(item for item in response.json()["cells"] if item["field_key"] == "secret_note")
    assert secret_cell == {
        "key": f"2024-06-01:{records['asset_a'].id}:secret_note",
        "entity_id": records["asset_a"].id,
        "field_key": "secret_note",
        "value": {"kind": "masked", "display": "***"},
        "status": "draft",
        "change_set_id": draft.id,
        "entry_id": entry.id,
    }
    assert "internal_flag" not in {item["field_key"] for item in response.json()["cells"]}


@pytest.mark.django_db
def test_draft_overlay_endpoint_respects_schema_visibility(client, users, schema, records):
    response = auth(client, users["outsider"]).get(
        f"/api/v1/schemas/{schema.id}/draft-overlay",
        {"at": "2024-06-01"},
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_cell_edit_endpoint_rejects_viewer_and_invalid_payload(client, users, schema, records):
    entity = records["asset_a"]

    denied = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/records/{entity.id}/cell/",
        {"field_key": "status", "value": "报废", "at": "2024-06-01"},
        format="json",
    )

    assert denied.status_code == 403

    invalid = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/records/{entity.id}/cell/",
        {"field_key": "missing", "value": "x", "at": "2024-06-01"},
        format="json",
    )

    assert invalid.status_code == 400
    assert "field_key" in invalid.json()
