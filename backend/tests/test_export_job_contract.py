import datetime as dt
from copy import deepcopy

import pytest
from django.core.files.base import ContentFile
from django.db import IntegrityError
from django.http import QueryDict
from django.utils import timezone

from apps.schemas.models import DataSchema, SchemaVersion
from apps.stats.export_snapshots import (
    EXPORT_SCOPE_CURRENT_VIEW,
    build_current_export_query_snapshot,
    build_current_export_snapshot_key,
    find_reusable_export_job,
)
from apps.stats.export_jobs import current_export_query_params
from apps.stats.models import ExportJob


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
            {"key": "asset_no", "label": "Asset No", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
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
    return schema


@pytest.fixture
def users(db, django_user_model):
    return {
        "owner": django_user_model.objects.create_user(username="owner", password="pass"),
        "viewer": django_user_model.objects.create_user(username="viewer", password="pass"),
    }


@pytest.mark.django_db
def test_current_export_snapshot_key_is_stable_for_same_semantics(users, schema):
    first = build_current_export_query_snapshot(
        schema,
        users["viewer"],
        QueryDict("format=xlsx&at=2024-06-30&retro=false&ordering=business_code"),
        requested_at=timezone.make_aware(dt.datetime(2026, 5, 25, 9, 0, 0)),
    )
    second = build_current_export_query_snapshot(
        schema,
        users["viewer"],
        QueryDict("at=2024-06-30&format=xlsx"),
        requested_at=timezone.make_aware(dt.datetime(2026, 5, 25, 9, 5, 0)),
    )

    assert first["requested_at"] != second["requested_at"]
    assert first == {
        "schema_id": schema.id,
        "user_id": users["viewer"].id,
        "at": "2024-06-30",
        "retro": False,
        "search": "",
        "ordering": "business_code",
        "change_set": None,
        "schema_version": 1,
        "format": "xlsx",
        "export_spec": export_spec(schema),
        "requested_at": first["requested_at"],
    }
    assert build_current_export_snapshot_key(first) == build_current_export_snapshot_key(second)


@pytest.mark.django_db
def test_current_export_snapshot_key_changes_for_export_semantics(users, schema):
    base = snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-30")

    assert snapshot_key(schema, users["viewer"], "format=csv&at=2024-06-30") != base
    assert snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-29") != base
    assert snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-30&search=A") != base
    assert (
        snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-30&ordering=-business_code")
        != base
    )
    assert snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-30&change_set=1") != base

    schema.current_version = 2
    schema.save(update_fields=["current_version"])
    assert snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-30") != base


@pytest.mark.django_db
def test_export_spec_snapshot_key_changes_for_columns_and_filters(users, schema):
    base_spec = export_spec(
        schema,
        columns={"mode": "selected", "field_keys": ["asset_no"]},
    )
    columns_spec = deepcopy(base_spec)
    columns_spec["columns"]["field_keys"] = ["asset_no", "status"]
    filters_spec = deepcopy(base_spec)
    filters_spec["filters"] = [{"field": "status", "operator": "equals", "value": "In Use"}]

    base = snapshot_key_from_spec(schema, users["viewer"], base_spec)

    assert snapshot_key_from_spec(schema, users["viewer"], columns_spec) != base
    assert snapshot_key_from_spec(schema, users["viewer"], filters_spec) != base


@pytest.mark.django_db
def test_export_spec_snapshot_all_clears_filtered_result_params(users, schema):
    spec = export_spec(
        schema,
        row_scope={"mode": "snapshot_all", "selected_entity_ids": []},
        search="A-001",
        change_set=12,
        filters=[{"field": "status", "operator": "equals", "value": "In Use"}],
    )

    snapshot = build_current_export_query_snapshot(schema, users["viewer"], {"export_spec": spec})
    query_params = current_export_query_params(snapshot)

    assert snapshot["search"] == ""
    assert snapshot["change_set"] is None
    assert snapshot["export_spec"]["search"] == ""
    assert snapshot["export_spec"]["change_set"] is None
    assert snapshot["export_spec"]["filters"] == []
    assert query_params["search"] == ""
    assert query_params["change_set"] == ""


@pytest.mark.django_db
def test_export_job_defaults_and_active_snapshot_constraint(users, schema):
    key = snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-30")
    snapshot = build_current_export_query_snapshot(
        schema,
        users["viewer"],
        QueryDict("format=xlsx&at=2024-06-30"),
    )

    job = ExportJob.objects.create(
        owner=users["viewer"],
        schema=schema,
        export_format=ExportJob.Format.XLSX,
        snapshot_key=key,
        query_snapshot=snapshot,
        row_count_estimate=12,
    )

    assert job.job_code.startswith("EXP-")
    assert job.export_scope == ExportJob.Scope.CURRENT_VIEW
    assert job.status == ExportJob.Status.QUEUED
    assert job.risk_flags == []
    assert job.risk_details == {}
    assert job.file_size_bytes == 0
    assert str(job) == f"{job.job_code} queued"

    with pytest.raises(IntegrityError):
        ExportJob.objects.create(
            owner=users["viewer"],
            schema=schema,
            export_format=ExportJob.Format.XLSX,
            snapshot_key=key,
            query_snapshot=snapshot,
            row_count_estimate=12,
        )


@pytest.mark.django_db
def test_find_reusable_export_job_ignores_failed_expired_and_missing_file_jobs(
    tmp_path, settings, users, schema
):
    settings.MEDIA_ROOT = tmp_path
    key = snapshot_key(schema, users["viewer"], "format=xlsx&at=2024-06-30")
    snapshot = build_current_export_query_snapshot(
        schema,
        users["viewer"],
        QueryDict("format=xlsx&at=2024-06-30"),
    )
    now = timezone.now()
    base = {
        "owner": users["viewer"],
        "schema": schema,
        "export_format": ExportJob.Format.XLSX,
        "snapshot_key": key,
        "query_snapshot": snapshot,
        "row_count_estimate": 2,
    }

    ExportJob.objects.create(**base, status=ExportJob.Status.FAILED)
    assert find_reusable_export_job(users["viewer"], schema, ExportJob.Format.XLSX, key, now=now) is None

    ExportJob.objects.create(
        **base,
        status=ExportJob.Status.COMPLETED,
        expires_at=now - dt.timedelta(seconds=1),
    )
    assert find_reusable_export_job(users["viewer"], schema, ExportJob.Format.XLSX, key, now=now) is None

    reusable = ExportJob.objects.create(
        **base,
        status=ExportJob.Status.COMPLETED,
        expires_at=now + dt.timedelta(days=1),
    )
    assert find_reusable_export_job(users["viewer"], schema, ExportJob.Format.XLSX, key, now=now) is None
    reusable.file.save("ready.xlsx", ContentFile(b"ready"), save=True)

    assert (
        find_reusable_export_job(users["viewer"], schema, ExportJob.Format.XLSX, key, now=now)
        == reusable
    )


def snapshot_key(schema, user, query: str) -> str:
    snapshot = build_current_export_query_snapshot(schema, user, QueryDict(query))
    assert snapshot["format"] in {ExportJob.Format.CSV, ExportJob.Format.XLSX}
    assert EXPORT_SCOPE_CURRENT_VIEW == ExportJob.Scope.CURRENT_VIEW
    return build_current_export_snapshot_key(snapshot)


def snapshot_key_from_spec(schema, user, spec: dict) -> str:
    snapshot = build_current_export_query_snapshot(schema, user, {"export_spec": spec})
    assert snapshot["export_spec"] == spec
    return build_current_export_snapshot_key(snapshot)


def export_spec(
    schema,
    *,
    export_format: str = "xlsx",
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
