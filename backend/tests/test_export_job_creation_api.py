import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.stats.models import ExportJob
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db, django_user_model):
    return {
        "owner": django_user_model.objects.create_user(username="owner", password="pass"),
        "viewer": django_user_model.objects.create_user(username="viewer", password="pass"),
        "outsider": django_user_model.objects.create_user(username="outsider", password="pass"),
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
            {"key": "status", "label": "Status", "type": "text", "introduced_in_version": 1},
            {"key": "owner", "label": "Owner", "type": "text", "introduced_in_version": 1},
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
        summary="Initial changes",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.make_aware(dt.datetime(2024, 6, 1, 10, 0, 0)),
    )
    for code, owner in (("A-001", "Alice"), ("B-001", "Bob")):
        entity = Entity.objects.create(schema=schema, business_code=code, created_by=users["owner"])
        record = TemporalRecord.objects.create(
            entity=entity,
            schema_version=1,
            data_payload={"asset_no": code, "status": "In Use", "owner": owner},
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


@pytest.mark.django_db
def test_create_current_export_job_success(client, users, schema, records):
    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30", "ordering": "business_code"},
        format="json",
    )

    assert response.status_code == 201, response.json()
    payload = response.json()
    job = ExportJob.objects.get(job_code=payload["job_code"])
    assert payload["status"] == ExportJob.Status.QUEUED
    assert payload["export_scope"] == ExportJob.Scope.CURRENT_VIEW
    assert payload["format"] == ExportJob.Format.CSV
    assert payload["schema"] == {
        "id": schema.id,
        "schema_code": "assets",
        "name": "Assets",
    }
    assert payload["query_snapshot"] == {
        "schema_id": schema.id,
        "user_id": users["viewer"].id,
        "at": "2024-06-30",
        "retro": False,
        "search": "",
        "ordering": "business_code",
        "change_set": None,
        "schema_version": 1,
        "format": "csv",
        "export_spec": export_spec(schema, export_format="csv"),
    }
    assert payload["row_count_estimate"] == 2
    assert payload["row_count_actual"] is None
    assert payload["risk_flags"] == []
    assert payload["risk_confirmation_required"] is False
    assert payload["filename"].startswith("assets_2024-06-30_")
    assert payload["filename"].endswith(".csv")
    assert payload["download_url"] is None
    assert job.owner == users["viewer"]
    assert job.row_count_estimate == 2

    log = AuditLog.objects.get(action="export.job_create")
    assert log.actor == users["viewer"]
    assert log.target_type == "schema"
    assert log.target_id == schema.id
    assert log.detail["job_code"] == job.job_code
    assert log.detail["row_count_estimate"] == 2
    assert log.detail["query_snapshot"]["at"] == "2024-06-30"


@pytest.mark.django_db
def test_create_current_export_job_reuses_same_snapshot(client, users, schema, records):
    api = auth(client, users["viewer"])
    first = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30"},
        format="json",
    )
    second = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30", "ordering": "business_code"},
        format="json",
    )

    assert first.status_code == 201, first.json()
    assert second.status_code == 200, second.json()
    assert second.json()["job_code"] == first.json()["job_code"]
    assert ExportJob.objects.count() == 1
    assert AuditLog.objects.filter(action="export.job_create").count() == 1


@pytest.mark.django_db
def test_create_current_export_job_uses_different_snapshot_for_different_scope(
    client, users, schema, records
):
    api = auth(client, users["viewer"])
    first = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30"},
        format="json",
    )
    second = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30", "search": "A-001"},
        format="json",
    )

    assert first.status_code == 201, first.json()
    assert second.status_code == 201, second.json()
    assert second.json()["job_code"] != first.json()["job_code"]
    assert second.json()["row_count_estimate"] == 1
    assert ExportJob.objects.count() == 2


@pytest.mark.django_db
def test_create_current_export_job_accepts_export_spec_payload(client, users, schema, records):
    spec = export_spec(
        schema,
        export_format="csv",
        search="A-001",
        columns={"mode": "selected", "field_keys": ["asset_no", "owner"]},
    )

    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"export_spec": spec},
        format="json",
    )

    assert response.status_code == 201, response.json()
    payload = response.json()
    assert payload["format"] == ExportJob.Format.CSV
    assert payload["row_count_estimate"] == 1
    assert payload["query_snapshot"]["export_spec"] == spec
    assert ExportJob.objects.get(job_code=payload["job_code"]).query_snapshot["export_spec"] == spec


@pytest.mark.django_db
def test_create_current_export_job_accepts_export_spec_with_top_level_filters_list(
    client,
    users,
    schema,
    records,
):
    filters = [{"field": "owner", "operator": "contains", "value": "Ali"}]
    spec = export_spec(
        schema,
        export_format="csv",
        filters=filters,
        columns={"mode": "selected", "field_keys": ["asset_no", "owner"]},
    )

    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {
            "format": "csv",
            "at": "2024-06-30",
            "filters": filters,
            "export_spec": spec,
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    payload = response.json()
    assert payload["row_count_estimate"] == 1
    assert payload["query_snapshot"]["export_spec"]["filters"] == filters
    assert payload["export_summary"]["filter_count"] == 1


@pytest.mark.django_db
def test_create_current_export_job_estimates_selected_entities_row_scope(
    client,
    users,
    schema,
    records,
):
    asset_a = Entity.objects.get(schema=schema, business_code="A-001")
    spec = export_spec(
        schema,
        export_format="csv",
        row_scope={"mode": "selected_entities", "selected_entity_ids": [asset_a.id]},
    )

    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"export_spec": spec},
        format="json",
    )

    assert response.status_code == 201, response.json()
    payload = response.json()
    assert payload["row_count_estimate"] == 1
    assert payload["query_snapshot"]["export_spec"]["row_scope"] == spec["row_scope"]
    assert payload["export_summary"]["row_scope_mode"] == "selected_entities"


@pytest.mark.django_db
def test_create_current_export_job_rejects_empty_selected_entities_row_scope(
    client,
    users,
    schema,
    records,
):
    spec = export_spec(
        schema,
        export_format="csv",
        row_scope={"mode": "selected_entities", "selected_entity_ids": []},
    )

    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"export_spec": spec},
        format="json",
    )

    assert response.status_code == 400
    assert ExportJob.objects.count() == 0


@pytest.mark.django_db
def test_create_current_export_job_rejects_invisible_schema(client, users, schema, records):
    response = auth(client, users["outsider"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30"},
        format="json",
    )

    assert response.status_code == 404
    assert ExportJob.objects.count() == 0


@pytest.mark.django_db
def test_large_export_requires_confirmation(settings, client, users, schema, records):
    settings.EXPORT_LARGE_ROW_THRESHOLD = 1

    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30"},
        format="json",
    )

    assert response.status_code == 409, response.json()
    assert response.json() == {
        "detail": "export risk confirmation required",
        "risk_confirmation_required": True,
        "row_count_estimate": 2,
        "risk_flags": ["large_export"],
        "risk_details": {"large_export_threshold": 1},
    }
    assert ExportJob.objects.count() == 0

    confirmed = client.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30", "risk_confirmed": True},
        format="json",
    )

    assert confirmed.status_code == 201, confirmed.json()
    job = ExportJob.objects.get()
    assert job.risk_flags == ["large_export"]
    assert job.risk_details == {"large_export_threshold": 1}
    assert job.risk_confirmed_by == users["viewer"]
    assert job.risk_confirmed_at is not None


@pytest.mark.django_db
def test_risky_export_reuses_existing_confirmed_snapshot_without_reconfirmation(
    settings, client, users, schema, records
):
    settings.EXPORT_LARGE_ROW_THRESHOLD = 1
    api = auth(client, users["viewer"])
    first = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30", "risk_confirmed": True},
        format="json",
    )
    second = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "xlsx", "at": "2024-06-30"},
        format="json",
    )

    assert first.status_code == 201, first.json()
    assert second.status_code == 200, second.json()
    assert second.json()["job_code"] == first.json()["job_code"]
    assert ExportJob.objects.count() == 1


@pytest.mark.django_db
def test_sensitive_fields_require_confirmation(client, users, schema, records):
    schema.fields_config = [
        *schema.fields_config,
        {
            "key": "phone",
            "label": "Phone",
            "type": "text",
            "sensitive": True,
            "masking": {"visible_roles": ["viewer"]},
            "introduced_in_version": 1,
        },
    ]
    schema.save(update_fields=["fields_config"])
    TemporalRecord.objects.filter(entity__schema=schema).update(data_payload={"phone": "SECRET"})

    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30"},
        format="json",
    )

    assert response.status_code == 409, response.json()
    assert response.json()["risk_flags"] == ["sensitive_fields"]
    assert response.json()["risk_details"] == {
        "sensitive_fields": [{"key": "phone", "label": "Phone"}]
    }
    assert "SECRET" not in str(response.json())
    assert ExportJob.objects.count() == 0


@pytest.mark.django_db
def test_sensitive_field_risk_uses_selected_export_columns(client, users, schema, records):
    schema.fields_config = [
        *schema.fields_config,
        {
            "key": "phone",
            "label": "Phone",
            "type": "text",
            "sensitive": True,
            "masking": {"visible_roles": ["viewer"]},
            "introduced_in_version": 1,
        },
    ]
    schema.save(update_fields=["fields_config"])
    api = auth(client, users["viewer"])

    safe_response = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {
            "export_spec": export_spec(
                schema,
                export_format="csv",
                columns={"mode": "selected", "field_keys": ["asset_no", "status"]},
            )
        },
        format="json",
    )
    risky_response = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {
            "export_spec": export_spec(
                schema,
                export_format="csv",
                columns={"mode": "selected", "field_keys": ["asset_no", "phone"]},
            )
        },
        format="json",
    )

    assert safe_response.status_code == 201, safe_response.json()
    assert safe_response.json()["risk_flags"] == []
    assert risky_response.status_code == 409, risky_response.json()
    assert risky_response.json()["risk_flags"] == ["sensitive_fields"]
    assert risky_response.json()["risk_details"] == {
        "sensitive_fields": [{"key": "phone", "label": "Phone"}]
    }


@pytest.mark.django_db
def test_active_export_job_limit_rejects_new_snapshot(settings, client, users, schema, records):
    settings.EXPORT_MAX_ACTIVE_JOBS_PER_USER = 1
    api = auth(client, users["viewer"])
    first = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30"},
        format="json",
    )
    second = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30", "search": "A-001"},
        format="json",
    )

    assert first.status_code == 201, first.json()
    assert second.status_code == 409, second.json()
    assert second.json() == {
        "detail": "active export job limit exceeded",
        "max_active_jobs": 1,
    }
    assert ExportJob.objects.count() == 1


@pytest.mark.django_db
def test_failed_export_job_is_not_reused(client, users, schema, records):
    api = auth(client, users["viewer"])
    first = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30"},
        format="json",
    )
    job = ExportJob.objects.get(job_code=first.json()["job_code"])
    job.status = ExportJob.Status.FAILED
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at"])

    second = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30"},
        format="json",
    )

    assert first.status_code == 201, first.json()
    assert second.status_code == 201, second.json()
    assert second.json()["job_code"] != first.json()["job_code"]
    assert ExportJob.objects.count() == 2


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


@pytest.mark.django_db
def test_completed_export_job_without_file_is_not_reused(client, users, schema, records):
    api = auth(client, users["viewer"])
    first = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30"},
        format="json",
    )
    job = ExportJob.objects.get(job_code=first.json()["job_code"])
    job.status = ExportJob.Status.COMPLETED
    job.finished_at = timezone.now()
    job.expires_at = timezone.now() + dt.timedelta(days=1)
    job.save(update_fields=["status", "finished_at", "expires_at"])

    second = api.post(
        f"/api/v1/schemas/{schema.id}/export/current/jobs",
        {"format": "csv", "at": "2024-06-30"},
        format="json",
    )

    assert first.status_code == 201, first.json()
    assert second.status_code == 201, second.json()
    assert second.json()["job_code"] != first.json()["job_code"]
    assert ExportJob.objects.count() == 2
