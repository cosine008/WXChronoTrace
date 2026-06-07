import datetime as dt
import json

import pytest
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.stats.export_job_worker import process_export_jobs
from apps.stats.export_snapshots import (
    build_current_export_query_snapshot,
    build_current_export_snapshot_key,
)
from apps.stats.models import ExportJob
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db, django_user_model):
    return {
        "owner": django_user_model.objects.create_user(username="owner", password="pass"),
        "viewer": django_user_model.objects.create_user(username="viewer", password="pass"),
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
        schema_code="assets",
        name="Assets",
        description="Asset inventory",
        icon="boxes",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "Asset No", "type": "text", "introduced_in_version": 1},
            {
                "key": "status",
                "label": "Status",
                "type": "enum",
                "validators": {"options": ["In Use", "Repair", "Retired"]},
                "introduced_in_version": 1,
            },
            {"key": "owner", "label": "Owner", "type": "text", "introduced_in_version": 1},
            {"key": "price", "label": "Price", "type": "number", "introduced_in_version": 1},
            {
                "key": "purchased_on",
                "label": "Purchased On",
                "type": "date",
                "introduced_in_version": 1,
            },
            {"key": "active", "label": "Active", "type": "boolean", "introduced_in_version": 1},
            {
                "key": "tags",
                "label": "Tags",
                "type": "multi-enum",
                "validators": {"options": ["critical", "finance", "ops"]},
                "introduced_in_version": 1,
            },
            {
                "key": "secret",
                "label": "Secret",
                "type": "text",
                "sensitive": True,
                "masking": {"visible_roles": ["owner"]},
                "introduced_in_version": 1,
            },
            {
                "key": "internal_flag",
                "label": "Internal Flag",
                "type": "text",
                "hidden": True,
                "system": True,
                "introduced_in_version": 1,
            },
        ],
        current_version=1,
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="Initial version",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["owner"],
    )
    return schema


@pytest.fixture
def records(schema, users):
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="Initial data",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.make_aware(dt.datetime(2024, 6, 1, 10, 0, 0)),
    )
    rows = [
        (
            "A-001",
            {
                "asset_no": "A-001",
                "status": "Repair",
                "owner": "Alice",
                "price": 12.5,
                "purchased_on": "2024-01-15",
                "active": True,
                "tags": ["critical", "ops"],
                "secret": "alpha",
                "internal_flag": "hidden-a",
            },
        ),
        (
            "B-001",
            {
                "asset_no": "B-001",
                "status": "In Use",
                "owner": "Bob",
                "price": 35,
                "purchased_on": "2023-12-20",
                "active": False,
                "tags": ["finance"],
                "secret": "bravo",
                "internal_flag": "hidden-b",
            },
        ),
        (
            "C-001",
            {
                "asset_no": "C-001",
                "status": "Retired",
                "owner": "",
                "price": None,
                "purchased_on": "",
                "active": True,
                "tags": [],
                "secret": "charlie",
                "internal_flag": "hidden-c",
            },
        ),
    ]
    for business_code, payload in rows:
        entity = Entity.objects.create(
            schema=schema,
            business_code=business_code,
            created_by=users["owner"],
        )
        record = TemporalRecord.objects.create(
            entity=entity,
            schema_version=1,
            data_payload=payload,
            valid_from=dt.date(2024, 1, 1),
            change_set=change_set,
            recorded_by=users["owner"],
        )
        ChangeEntry.objects.create(
            change_set=change_set,
            entity=entity,
            action=ChangeEntry.Action.CREATE,
            data_after=record.data_payload,
            valid_from=record.valid_from,
            new_record=record,
        )
    return {"change_set": change_set}


def current_view_sql_from(queries):
    table_name = TemporalRecord._meta.db_table
    return [
        query["sql"]
        for query in queries
        if table_name in query["sql"] and "DISTINCT ON" in query["sql"]
    ]


def filters_param(filters: list[dict]) -> str:
    return json.dumps(filters)


@pytest.mark.django_db
def test_records_endpoint_filters_current_view_with_field_filters(client, users, schema, records):
    filters = [
        {"field": "status", "operator": "in", "value": ["Repair", "In Use"]},
        {"field": "owner", "operator": "contains", "value": "ali"},
        {"field": "price", "operator": "greater_than_or_equal", "value": "10"},
        {"field": "purchased_on", "operator": "between", "value": ["2024-01-01", "2024-12-31"]},
        {"field": "active", "operator": "equals", "value": True},
        {"field": "tags", "operator": "in", "value": ["critical"]},
    ]

    with CaptureQueriesContext(connection) as queries:
        response = auth(client, users["viewer"]).get(
            f"/api/v1/schemas/{schema.id}/records/",
            {
                "at": "2024-06-30",
                "filters": filters_param(filters),
                "page": "1",
                "page_size": "1",
            },
        )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["count"] == 1
    assert [record["business_code"] for record in payload["results"]] == ["A-001"]
    current_view_sql = "\n".join(current_view_sql_from(queries)).upper()
    assert "COUNT(*)" not in current_view_sql
    assert "LIMIT" not in current_view_sql


@pytest.mark.django_db
def test_records_endpoint_supports_empty_and_not_in_filters(client, users, schema, records):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {
            "at": "2024-06-30",
            "filters": filters_param(
                [
                    {"field": "owner", "operator": "is_empty"},
                    {"field": "tags", "operator": "not_in", "value": ["critical", "finance"]},
                ]
            ),
        },
    )

    assert response.status_code == 200, response.json()
    assert response.json()["count"] == 1
    assert [record["business_code"] for record in response.json()["results"]] == ["C-001"]


@pytest.mark.django_db
def test_stats_summary_uses_current_view_filters(client, users, schema, records):
    filters = [{"field": "status", "operator": "equals", "value": "Repair"}]

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/stats/summary",
        {"at": "2024-06-30", "filters": filters_param(filters)},
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["metrics"]["total"] == 1
    assert payload["scope"]["filters"] == filters


@pytest.mark.django_db
def test_export_worker_replays_export_spec_filters(tmp_path, settings, users, schema, records):
    settings.MEDIA_ROOT = tmp_path
    spec = export_spec(
        schema,
        filters=[{"field": "status", "operator": "equals", "value": "Repair"}],
        columns={"mode": "selected", "field_keys": ["asset_no", "status"]},
    )
    query_snapshot = build_current_export_query_snapshot(
        schema,
        users["viewer"],
        {"export_spec": spec},
    )
    job = ExportJob.objects.create(
        owner=users["viewer"],
        schema=schema,
        export_format=query_snapshot["format"],
        snapshot_key=build_current_export_snapshot_key(query_snapshot),
        query_snapshot=query_snapshot,
        row_count_estimate=1,
    )

    process_export_jobs(limit=1)

    job.refresh_from_db()
    lines = job.file.read().decode("utf-8-sig").splitlines()
    assert job.status == ExportJob.Status.COMPLETED
    assert job.row_count_actual == 1
    assert lines[0] == "display_code,valid_from,valid_to,schema_version,Asset No,Status"
    assert len(lines) == 2
    assert lines[1].startswith("A-001")
    assert "B-001" not in "\n".join(lines)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "filter_payload,error_key",
    [
        ([{"field": "missing", "operator": "equals", "value": "x"}], "filters.field"),
        ([{"field": "status", "operator": "bad_operator", "value": "x"}], "filters.operator"),
        ([{"field": "price", "operator": "greater_than", "value": "not-a-number"}], "filters.value"),
        ([{"field": "secret", "operator": "equals", "value": "alpha"}], "filters.field"),
        ([{"field": "internal_flag", "operator": "equals", "value": "hidden-a"}], "filters.field"),
    ],
)
def test_records_endpoint_rejects_invalid_filters(
    client,
    users,
    schema,
    records,
    filter_payload,
    error_key,
):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {"at": "2024-06-30", "filters": filters_param(filter_payload)},
    )

    assert response.status_code == 400
    assert error_key in response.json()


def export_spec(
    schema,
    *,
    export_format: str = "csv",
    at: str = "2024-06-30",
    retro: bool = False,
    row_scope: dict | None = None,
    filters: list[dict] | None = None,
    search: str = "",
    ordering: str = "business_code",
    change_set: int | None = None,
    columns: dict | None = None,
    schema_version: int = 1,
) -> dict:
    return {
        "schema_id": schema.id,
        "schema_version": schema_version,
        "scope": "current_view",
        "format": export_format,
        "time": {"at": at, "retro": retro},
        "row_scope": row_scope or {"mode": "filtered_result", "selected_entity_ids": []},
        "filters": filters or [],
        "search": search,
        "ordering": ordering,
        "change_set": change_set,
        "columns": columns or {"mode": "all_exportable", "field_keys": []},
    }
