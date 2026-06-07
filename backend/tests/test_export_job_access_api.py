import datetime as dt

import pytest
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.stats.models import ExportJob


@pytest.fixture
def users(db, django_user_model):
    return {
        "owner": django_user_model.objects.create_user(username="owner", password="pass"),
        "viewer": django_user_model.objects.create_user(username="viewer", password="pass"),
        "other": django_user_model.objects.create_user(username="other", password="pass"),
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
        icon="boxes",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[{"key": "asset_no", "label": "Asset No", "type": "text"}],
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
def completed_job(settings, tmp_path, users, schema):
    settings.MEDIA_ROOT = tmp_path
    job = make_job(users["viewer"], schema, status=ExportJob.Status.COMPLETED)
    job.file.save("assets.csv", ContentFile(b"\xef\xbb\xbfdisplay_code\nA-001\n"))
    job.file_size_bytes = job.file.size
    job.save(update_fields=["file", "file_size_bytes"])
    return job


@pytest.mark.django_db
def test_export_job_list_only_returns_current_user_jobs(client, users, schema, completed_job):
    other_job = make_job(users["other"], schema, status=ExportJob.Status.COMPLETED)
    other_job.file_size_bytes = 10
    other_job.save(update_fields=["file_size_bytes"])

    response = auth(client, users["viewer"]).get("/api/v1/export/jobs")

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["job_code"] == completed_job.job_code
    assert payload["results"][0]["download_url"] == (
        f"/api/v1/export/jobs/{completed_job.job_code}/download"
    )


@pytest.mark.django_db
def test_export_job_list_filters_status_and_hides_expired_by_default(client, users, schema):
    completed = make_job(users["viewer"], schema, status=ExportJob.Status.COMPLETED)
    expired = make_job(
        users["viewer"],
        schema,
        status=ExportJob.Status.EXPIRED,
        at="2024-06-29",
    )
    failed = make_job(users["viewer"], schema, status=ExportJob.Status.FAILED, at="2024-06-28")

    api = auth(client, users["viewer"])
    default_response = api.get("/api/v1/export/jobs")
    failed_response = api.get("/api/v1/export/jobs", {"status": "failed"})
    include_expired_response = api.get("/api/v1/export/jobs", {"include_expired": "true"})

    assert default_response.status_code == 200, default_response.json()
    assert [item["job_code"] for item in default_response.json()["results"]] == [
        failed.job_code,
        completed.job_code,
    ]
    assert failed_response.status_code == 200, failed_response.json()
    assert [item["job_code"] for item in failed_response.json()["results"]] == [failed.job_code]
    assert include_expired_response.status_code == 200, include_expired_response.json()
    assert {item["job_code"] for item in include_expired_response.json()["results"]} == {
        completed.job_code,
        expired.job_code,
        failed.job_code,
    }


@pytest.mark.django_db
def test_export_job_detail_requires_owner(client, users, schema, completed_job):
    owner_response = auth(client, users["viewer"]).get(f"/api/v1/export/jobs/{completed_job.job_code}")
    other_response = auth(client, users["other"]).get(f"/api/v1/export/jobs/{completed_job.job_code}")

    assert owner_response.status_code == 200, owner_response.json()
    assert owner_response.json()["job_code"] == completed_job.job_code
    assert other_response.status_code == 404


@pytest.mark.django_db
def test_completed_export_job_downloads_file_and_records_audit(client, users, schema, completed_job):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/export/jobs/{completed_job.job_code}/download"
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert response["Content-Disposition"] == 'attachment; filename="assets_2024-06-30_ABCD12.csv"'
    assert b"display_code" in b"".join(response.streaming_content)

    log = AuditLog.objects.get(action="data.export")
    assert log.actor == users["viewer"]
    assert log.target_type == ExportJob.Scope.CURRENT_VIEW
    assert log.target_id == schema.id
    assert log.detail["job_code"] == completed_job.job_code
    assert log.detail["row_count_actual"] == 2
    assert log.detail["risk_flags"] == ["large_export"]
    assert log.detail["query_snapshot"]["at"] == "2024-06-30"


@pytest.mark.django_db
def test_download_rechecks_schema_permission(client, users, schema, completed_job):
    TableCollaborator.objects.filter(schema=schema, user=users["viewer"]).delete()

    response = auth(client, users["viewer"]).get(
        f"/api/v1/export/jobs/{completed_job.job_code}/download"
    )

    assert response.status_code == 403
    assert not AuditLog.objects.filter(action="data.export").exists()
    denied = AuditLog.objects.get(action="export.download_denied")
    assert denied.detail["job_code"] == completed_job.job_code
    assert denied.detail["reason"] == "permission_denied"


@pytest.mark.django_db
def test_download_rejects_non_completed_expired_and_missing_file(
    client, users, schema, completed_job
):
    queued = make_job(users["viewer"], schema, status=ExportJob.Status.QUEUED, at="2024-06-29")
    expired = make_job(
        users["viewer"],
        schema,
        status=ExportJob.Status.COMPLETED,
        at="2024-06-28",
        expires_at=timezone.now() - dt.timedelta(seconds=1),
    )
    missing = make_job(users["viewer"], schema, status=ExportJob.Status.COMPLETED, at="2024-06-27")
    api = auth(client, users["viewer"])

    queued_response = api.get(f"/api/v1/export/jobs/{queued.job_code}/download")
    expired_response = api.get(f"/api/v1/export/jobs/{expired.job_code}/download")
    missing_response = api.get(f"/api/v1/export/jobs/{missing.job_code}/download")

    assert queued_response.status_code == 409
    assert queued_response.json() == {"detail": "export job is not completed"}
    assert expired_response.status_code == 410
    assert expired_response.json() == {"detail": "export job has expired"}
    assert missing_response.status_code == 404
    assert missing_response.json() == {"detail": "export file does not exist"}


def make_job(
    owner,
    schema,
    *,
    status: str,
    at: str = "2024-06-30",
    expires_at=None,
) -> ExportJob:
    snapshot = {
        "schema_id": schema.id,
        "user_id": owner.id,
        "at": at,
        "retro": False,
        "search": "",
        "ordering": "business_code",
        "change_set": None,
        "schema_version": 1,
        "format": "csv",
        "requested_at": timezone.now().isoformat(),
    }
    finished_at = timezone.now() if status in {ExportJob.Status.COMPLETED, ExportJob.Status.FAILED} else None
    return ExportJob.objects.create(
        owner=owner,
        schema=schema,
        export_format=ExportJob.Format.CSV,
        status=status,
        snapshot_key=f"{owner.id}-{at}-{status}",
        query_snapshot=snapshot,
        row_count_estimate=2,
        row_count_actual=2 if status == ExportJob.Status.COMPLETED else None,
        risk_flags=["large_export"],
        risk_details={"large_export_threshold": 1},
        filename=f"assets_{at}_ABCD12.csv",
        content_type="text/csv; charset=utf-8",
        file_size_bytes=0,
        finished_at=finished_at,
        expires_at=expires_at or (timezone.now() + dt.timedelta(days=30)),
    )
