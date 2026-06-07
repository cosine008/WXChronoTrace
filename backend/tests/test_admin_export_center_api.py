import datetime as dt
import json

import pytest
from django.core.files.base import ContentFile
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.audit.services import is_sensitive_action, record_audit_log
from apps.schemas.models import DataSchema, SchemaVersion
from apps.stats.models import ExportJob


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def users(db, django_user_model):
    return {
        "admin": django_user_model.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="pass",
        ),
        "viewer": django_user_model.objects.create_user(username="viewer", password="pass"),
        "owner": django_user_model.objects.create_user(username="owner", password="pass"),
        "other": django_user_model.objects.create_user(username="other_user", password="pass"),
    }


def auth(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def schema(users):
    primary = make_schema("assets", "Assets", users["owner"])
    secondary = make_schema("people", "People", users["admin"])
    return {"primary": primary, "secondary": secondary}


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def make_schema(schema_code, name, owner):
    schema = DataSchema.objects.create(
        schema_code=schema_code,
        name=name,
        description=f"{name} schema",
        icon="box",
        temporal_mode="continuous",
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "Code", "type": "text"}],
        current_version=1,
        owner=owner,
        visibility=DataSchema.Visibility.SHARED,
        created_by=owner,
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="Initial version",
        created_by=owner,
    )
    return schema


def make_job(
    owner,
    schema,
    *,
    status=ExportJob.Status.COMPLETED,
    export_format=ExportJob.Format.CSV,
    created_at=None,
    started_at=None,
    finished_at=None,
    expires_at=None,
    has_file=False,
    row_count_estimate=120,
    row_count_actual=100,
    risk_flags=None,
    risk_details=None,
    error_code="",
    error_message="",
    query_snapshot=None,
    filename=None,
):
    created_at = created_at or timezone.now()
    finished_at = finished_at if finished_at is not None else (
        timezone.now() if status in {ExportJob.Status.COMPLETED, ExportJob.Status.FAILED} else None
    )
    snapshot = {
        "schema_id": schema.id,
        "user_id": owner.id,
        "at": "2026-05-01",
        "retro": False,
        "search": "asset",
        "ordering": "business_code",
        "change_set": 7,
        "schema_version": 3,
        "format": export_format,
        "row_count": row_count_actual,
        "requested_at": timezone.now().isoformat(),
        "secret_token": "should-not-leak",
    }
    if query_snapshot:
        snapshot.update(query_snapshot)

    job = ExportJob.objects.create(
        owner=owner,
        schema=schema,
        export_scope=ExportJob.Scope.CURRENT_VIEW,
        export_format=export_format,
        status=status,
        snapshot_key=f"{owner.id}-{schema.id}-{status}-{created_at.timestamp()}",
        query_snapshot=snapshot,
        row_count_estimate=row_count_estimate,
        row_count_actual=row_count_actual,
        risk_flags=risk_flags or [],
        risk_details=risk_details or {},
        filename=filename or f"{schema.schema_code}_{owner.username}.{export_format}",
        content_type="text/csv; charset=utf-8",
        file_size_bytes=0,
        error_code=error_code,
        error_message=error_message,
        started_at=started_at,
        finished_at=finished_at,
        expires_at=expires_at or (created_at + dt.timedelta(days=10)),
    )
    ExportJob.objects.filter(id=job.id).update(created_at=created_at)
    job.refresh_from_db()
    if has_file:
        job.file.save(
            f"{schema.schema_code}.{export_format}",
            ContentFile(b"header\nvalue\n"),
            save=False,
        )
        job.file_size_bytes = job.file.size
        job.save(update_fields=["file", "file_size_bytes"])
        job.refresh_from_db()
    return job


def make_export_log(
    actor,
    *,
    created_at=None,
    target_type="current_view",
    target_id=None,
    detail=None,
):
    detail = detail or {}
    if created_at is None:
        return record_audit_log(
            actor=actor,
            action="data.export",
            target_type=target_type,
            target_id=target_id,
            detail=detail,
        )
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO audit_auditlog (
                actor_id,
                action,
                target_type,
                target_id,
                detail,
                is_sensitive,
                ip_address,
                created_at
            )
            VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s)
            RETURNING id
            """,
            [
                actor.id,
                "data.export",
                target_type,
                target_id,
                json.dumps(detail),
                is_sensitive_action("data.export", detail),
                None,
                created_at,
            ],
        )
        log_id = cursor.fetchone()[0]
    return AuditLog.objects.select_related("actor").get(id=log_id)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("path", "status_code"),
    [
        ("/api/v1/admin/export-jobs", 403),
        ("/api/v1/admin/export-jobs/EXP-MISSING", 403),
        ("/api/v1/admin/export-events", 403),
        ("/api/v1/admin/export-events/999", 403),
    ],
)
def test_admin_export_center_requires_superuser(client, users, path, status_code):
    response = auth(client, users["viewer"]).get(path)

    assert response.status_code == status_code


@pytest.mark.django_db
def test_admin_export_job_list_defaults_to_recent_30_days_and_returns_summary(client, users, schema):
    now = timezone.now()
    completed = make_job(
        users["viewer"],
        schema["primary"],
        status=ExportJob.Status.COMPLETED,
        created_at=now - dt.timedelta(days=1),
        finished_at=now - dt.timedelta(hours=6),
        has_file=True,
        risk_flags=["large_export"],
        risk_details={"large_export_threshold": 50},
        error_message="completed ok",
    )
    queued = make_job(
        users["owner"],
        schema["secondary"],
        status=ExportJob.Status.QUEUED,
        created_at=now - dt.timedelta(days=2),
        row_count_actual=None,
    )
    running = make_job(
        users["viewer"],
        schema["secondary"],
        status=ExportJob.Status.RUNNING,
        created_at=now - dt.timedelta(days=3),
        row_count_actual=None,
        started_at=now - dt.timedelta(days=3, hours=-1),
    )
    expired = make_job(
        users["owner"],
        schema["primary"],
        status=ExportJob.Status.EXPIRED,
        created_at=now - dt.timedelta(days=4),
        row_count_actual=None,
        expires_at=now - dt.timedelta(hours=1),
        risk_flags=["sensitive_fields"],
        risk_details={"sensitive_fields": [{"key": "id_no", "label": "ID No"}]},
    )
    make_job(
        users["other"],
        schema["primary"],
        status=ExportJob.Status.FAILED,
        created_at=now - dt.timedelta(days=45),
        error_code="EXPORT_FAIL",
        error_message="Traceback:\nprivate stack",
    )

    response = auth(client, users["admin"]).get("/api/v1/admin/export-jobs")

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["count"] == 4
    assert payload["page"] == 1
    assert payload["page_size"] == 20
    assert payload["total_pages"] == 1
    assert payload["summary"] == {
        "total": 4,
        "queued": 1,
        "running": 1,
        "completed": 1,
        "failed": 0,
        "expired": 1,
        "high_risk": 2,
    }
    assert [item["job_code"] for item in payload["results"]] == [
        completed.job_code,
        queued.job_code,
        running.job_code,
        expired.job_code,
    ]
    row = payload["results"][0]
    assert row["owner"] == {"id": users["viewer"].id, "username": "viewer"}
    assert row["schema"] == {
        "id": schema["primary"].id,
        "schema_code": "assets",
        "name": "Assets",
    }
    assert row["format"] == "csv"
    assert row["has_file"] is True
    assert row["file_size_bytes"] == completed.file_size_bytes
    assert row["risk_flags"] == ["large_export"]
    assert "download_url" not in row
    assert "file" not in row
    assert "path" not in row


@pytest.mark.django_db
def test_admin_export_job_list_supports_filters(client, users, schema):
    now = timezone.now()
    matching = make_job(
        users["viewer"],
        schema["primary"],
        status=ExportJob.Status.FAILED,
        export_format=ExportJob.Format.XLSX,
        created_at=now - dt.timedelta(days=5),
        finished_at=now - dt.timedelta(days=2),
        expires_at=now + dt.timedelta(days=1),
        has_file=True,
        risk_flags=["sensitive_fields"],
        risk_details={"sensitive_fields": [{"key": "salary", "label": "Salary"}]},
    )
    make_job(
        users["viewer"],
        schema["primary"],
        status=ExportJob.Status.FAILED,
        export_format=ExportJob.Format.XLSX,
        created_at=now - dt.timedelta(days=40),
        finished_at=now - dt.timedelta(days=2),
        expires_at=now + dt.timedelta(days=1),
        has_file=True,
        risk_flags=["sensitive_fields"],
    )
    make_job(
        users["viewer"],
        schema["secondary"],
        status=ExportJob.Status.FAILED,
        export_format=ExportJob.Format.XLSX,
        created_at=now - dt.timedelta(days=5),
        finished_at=now - dt.timedelta(days=2),
        expires_at=now + dt.timedelta(days=1),
        has_file=True,
        risk_flags=["sensitive_fields"],
    )
    make_job(
        users["viewer"],
        schema["primary"],
        status=ExportJob.Status.COMPLETED,
        export_format=ExportJob.Format.XLSX,
        created_at=now - dt.timedelta(days=5),
        finished_at=now - dt.timedelta(days=2),
        expires_at=now + dt.timedelta(days=1),
        has_file=True,
        risk_flags=["sensitive_fields"],
    )
    make_job(
        users["owner"],
        schema["primary"],
        status=ExportJob.Status.FAILED,
        export_format=ExportJob.Format.XLSX,
        created_at=now - dt.timedelta(days=5),
        finished_at=now - dt.timedelta(days=2),
        expires_at=now + dt.timedelta(days=1),
        has_file=True,
        risk_flags=["sensitive_fields"],
    )
    make_job(
        users["viewer"],
        schema["primary"],
        status=ExportJob.Status.FAILED,
        export_format=ExportJob.Format.CSV,
        created_at=now - dt.timedelta(days=5),
        finished_at=now - dt.timedelta(days=2),
        expires_at=now + dt.timedelta(days=1),
        has_file=True,
        risk_flags=["sensitive_fields"],
    )
    make_job(
        users["viewer"],
        schema["primary"],
        status=ExportJob.Status.FAILED,
        export_format=ExportJob.Format.XLSX,
        created_at=now - dt.timedelta(days=5),
        finished_at=now - dt.timedelta(days=10),
        expires_at=now + dt.timedelta(days=30),
        has_file=False,
        risk_flags=[],
    )

    response = auth(client, users["admin"]).get(
        "/api/v1/admin/export-jobs",
        {
            "status": "failed",
            "format": "xlsx",
            "schema_id": str(schema["primary"].id),
            "schema": "asset",
            "owner": "viewer",
            "risk": "sensitive_fields",
            "created_after": (now - dt.timedelta(days=10)).isoformat(),
            "created_before": (now - dt.timedelta(days=1)).isoformat(),
            "finished_after": (now - dt.timedelta(days=3)).isoformat(),
            "finished_before": (now - dt.timedelta(days=1)).isoformat(),
            "expires_before": (now + dt.timedelta(days=2)).isoformat(),
            "has_file": "true",
        },
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["count"] == 1
    assert payload["summary"] == {
        "total": 1,
        "queued": 0,
        "running": 0,
        "completed": 0,
        "failed": 1,
        "expired": 0,
        "high_risk": 1,
    }
    assert payload["results"][0]["job_code"] == matching.job_code


@pytest.mark.django_db
def test_admin_export_job_detail_returns_safe_snapshot_and_recent_audit_refs(client, users, schema):
    job = make_job(
        users["viewer"],
        schema["primary"],
        status=ExportJob.Status.FAILED,
        created_at=timezone.now() - dt.timedelta(days=1),
        error_code="EXPORT_FAIL",
        error_message="human message\nTraceback: hidden",
        query_snapshot={"secret_clause": "omit-me"},
        risk_flags=["large_export", "sensitive_fields"],
    )
    for index in range(22):
        record_audit_log(
            actor=users["admin"],
            action="data.export" if index % 2 == 0 else "export.job_create",
            target_type="current_view",
            target_id=schema["primary"].id,
            detail={"job_code": job.job_code, "sequence": index},
        )

    response = auth(client, users["admin"]).get(f"/api/v1/admin/export-jobs/{job.job_code}")

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["job_code"] == job.job_code
    assert payload["error_code"] == "EXPORT_FAIL"
    assert payload["error_message"] == "human message"
    assert payload["query_snapshot"] == {
        "schema_id": schema["primary"].id,
        "user_id": users["viewer"].id,
        "at": "2026-05-01",
        "retro": False,
        "search": "asset",
        "ordering": "business_code",
        "change_set": 7,
        "schema_version": 3,
        "format": "csv",
        "row_count": 100,
    }
    assert len(payload["audit_events"]) == 20
    assert set(payload["audit_events"][0]) == {"id", "action", "actor_username", "created_at"}
    assert "file" not in payload
    assert "download_url" not in payload
    assert "path" not in payload


@pytest.mark.django_db
def test_admin_export_event_list_defaults_to_recent_30_days_and_builds_summary(client, users, schema):
    now = timezone.now()
    export_job_event = make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=1),
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-100",
            "schema_code": "assets",
            "format": "csv",
            "row_count_actual": 1200,
            "risk_flags": ["large_export"],
            "file_size_bytes": 2048,
            "payload": {"secret": "omit"},
        },
    )
    sync_event = make_export_log(
        users["owner"],
        created_at=now - dt.timedelta(days=2),
        target_id=schema["secondary"].id,
        detail={
            "schema_code": "people",
            "format": "xlsx",
            "row_count": 55,
            "risk_flags": ["sensitive_fields"],
            "query_snapshot": {"search": "alice", "secret": "omit"},
        },
    )
    unknown_event = make_export_log(
        users["admin"],
        created_at=now - dt.timedelta(days=3),
        target_id=schema["primary"].id,
        detail={},
    )
    make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=40),
        target_id=schema["primary"].id,
        detail={"job_code": "EXP-OLD", "row_count_actual": 9999, "risk_flags": ["large_export"]},
    )

    response = auth(client, users["admin"]).get("/api/v1/admin/export-events")

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["count"] == 3
    assert payload["summary"] == {
        "total": 3,
        "with_job": 1,
        "without_job": 2,
        "high_risk": 2,
        "large_export": 1,
        "sensitive_fields": 1,
    }
    assert [item["id"] for item in payload["results"]] == [
        export_job_event.id,
        sync_event.id,
        unknown_event.id,
    ]
    first = payload["results"][0]
    assert first["source"] == "export_job"
    assert first["row_count"] == 1200
    assert first["schema_code"] == "assets"
    assert first["schema_name"] == "Assets"
    assert first["actor"] == {"id": users["viewer"].id, "username": "viewer"}
    assert "payload" not in first
    second = payload["results"][1]
    assert second["source"] == "sync_export"
    assert second["row_count"] == 55
    third = payload["results"][2]
    assert third["source"] == "unknown"
    assert third["row_count"] is None


@pytest.mark.django_db
def test_admin_export_event_list_supports_filters(client, users, schema):
    now = timezone.now()
    matching = make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=5),
        target_type="current_view",
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-MATCH",
            "schema_code": "assets",
            "format": "xlsx",
            "row_count_actual": 800,
            "risk_flags": ["large_export"],
            "file_size_bytes": 1024,
        },
    )
    make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=5),
        target_type="schema",
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-WRONG-TARGET",
            "schema_code": "assets",
            "format": "xlsx",
            "row_count_actual": 800,
            "risk_flags": ["large_export"],
        },
    )
    make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=5),
        target_type="current_view",
        target_id=schema["secondary"].id,
        detail={
            "job_code": "EXP-WRONG-SCHEMA",
            "schema_code": "people",
            "format": "xlsx",
            "row_count_actual": 800,
            "risk_flags": ["large_export"],
        },
    )
    make_export_log(
        users["other"],
        created_at=now - dt.timedelta(days=5),
        target_type="current_view",
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-WRONG-ACTOR",
            "schema_code": "assets",
            "format": "xlsx",
            "row_count_actual": 800,
            "risk_flags": ["large_export"],
        },
    )
    make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=5),
        target_type="current_view",
        target_id=schema["primary"].id,
        detail={
            "schema_code": "assets",
            "format": "xlsx",
            "row_count": 800,
            "risk_flags": ["large_export"],
        },
    )
    make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=5),
        target_type="current_view",
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-WRONG-FORMAT",
            "schema_code": "assets",
            "format": "csv",
            "row_count_actual": 800,
            "risk_flags": ["large_export"],
        },
    )
    make_export_log(
        users["viewer"],
        created_at=now - dt.timedelta(days=20),
        target_type="current_view",
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-OLD",
            "schema_code": "assets",
            "format": "xlsx",
            "row_count_actual": 800,
            "risk_flags": ["large_export"],
        },
    )

    response = auth(client, users["admin"]).get(
        "/api/v1/admin/export-events",
        {
            "actor": "viewer",
            "schema": "asset",
            "target_type": "current_view",
            "format": "xlsx",
            "risk": "large_export",
            "job_code": "EXP-MATCH",
            "min_rows": "700",
            "source": "export_job",
            "created_after": (now - dt.timedelta(days=10)).isoformat(),
            "created_before": (now - dt.timedelta(days=1)).isoformat(),
        },
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == matching.id


@pytest.mark.django_db
def test_admin_export_event_large_export_risk_is_inferred_from_row_count_threshold(
    settings, client, users, schema
):
    settings.EXPORT_LARGE_ROW_THRESHOLD = 1000
    inferred = make_export_log(
        users["viewer"],
        created_at=timezone.now() - dt.timedelta(days=1),
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-INFERRED",
            "schema_code": "assets",
            "format": "csv",
            "row_count_actual": 1001,
        },
    )
    make_export_log(
        users["viewer"],
        created_at=timezone.now() - dt.timedelta(days=1, minutes=1),
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-NOT-LARGE",
            "schema_code": "assets",
            "format": "csv",
            "row_count_actual": 1000,
        },
    )

    response = auth(client, users["admin"]).get(
        "/api/v1/admin/export-events",
        {"risk": "large_export"},
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["count"] == 1
    assert payload["summary"] == {
        "total": 1,
        "with_job": 1,
        "without_job": 0,
        "high_risk": 1,
        "large_export": 1,
        "sensitive_fields": 0,
    }
    assert payload["results"][0]["id"] == inferred.id
    assert payload["results"][0]["risk_flags"] == ["large_export"]


@pytest.mark.django_db
def test_admin_export_event_detail_returns_safe_detail_and_snapshot(client, users, schema):
    log = make_export_log(
        users["viewer"],
        created_at=timezone.now() - dt.timedelta(days=1),
        target_id=schema["primary"].id,
        detail={
            "job_code": "EXP-DETAIL",
            "schema_code": "assets",
            "format": "csv",
            "export_scope": "current_view",
            "row_count_actual": 12,
            "row_count_estimate": 20,
            "file_size_bytes": 128,
            "risk_flags": ["large_export"],
            "query_snapshot": {
                "schema_id": schema["primary"].id,
                "user_id": users["viewer"].id,
                "at": "2026-05-01",
                "format": "csv",
                "search": "asset",
                "requested_at": "2026-05-01T00:00:00Z",
                "token": "omit",
            },
            "payload": [{"value": "secret"}],
            "internal_path": "/tmp/private.csv",
            "content": "file-bytes",
        },
    )

    response = auth(client, users["admin"]).get(f"/api/v1/admin/export-events/{log.id}")

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["id"] == log.id
    assert payload["source"] == "export_job"
    assert payload["row_count"] == 12
    assert payload["query_snapshot"] == {
        "schema_id": schema["primary"].id,
        "user_id": users["viewer"].id,
        "at": "2026-05-01",
        "format": "csv",
        "search": "asset",
    }
    assert payload["detail"] == {
        "job_code": "EXP-DETAIL",
        "schema_code": "assets",
        "format": "csv",
        "export_scope": "current_view",
        "row_count_actual": 12,
        "row_count_estimate": 20,
        "file_size_bytes": 128,
        "risk_flags": ["large_export"],
        "query_snapshot": {
            "schema_id": schema["primary"].id,
            "user_id": users["viewer"].id,
            "at": "2026-05-01",
            "format": "csv",
            "search": "asset",
        },
    }


@pytest.mark.django_db
def test_admin_export_job_admin_endpoints_whitelist_risk_details(client, users, schema):
    job = make_job(
        users["viewer"],
        schema["primary"],
        created_at=timezone.now() - dt.timedelta(days=1),
        risk_flags=["large_export", "sensitive_fields"],
        risk_details={
            "large_export_threshold": 50,
            "sensitive_fields": [
                {"key": "id_no", "label": "ID No", "value": "330101", "payload": {"secret": "drop"}},
                {"key": "salary", "label": "Salary", "nested": ["drop"]},
                {"key": "badge_only"},
                {"label": "missing-key"},
                {"key": 99, "label": "Wrong Type"},
                "not-a-dict",
            ],
            "query_snapshot": {"token": "drop"},
            "secret_token": "drop",
            "approval_payload": {"reason": "drop"},
        },
    )

    list_response = auth(client, users["admin"]).get("/api/v1/admin/export-jobs")
    detail_response = auth(client, users["admin"]).get(f"/api/v1/admin/export-jobs/{job.job_code}")

    assert list_response.status_code == 200, list_response.json()
    assert detail_response.status_code == 200, detail_response.json()
    expected = {
        "large_export_threshold": 50,
        "sensitive_fields": [
            {"key": "id_no", "label": "ID No"},
            {"key": "salary", "label": "Salary"},
        ],
    }
    assert list_response.json()["results"][0]["risk_details"] == expected
    assert detail_response.json()["risk_details"] == expected


@pytest.mark.django_db
def test_admin_export_detail_endpoints_handle_missing_records_and_legacy_event_fields(
    client, users, schema
):
    legacy = make_export_log(
        users["viewer"],
        created_at=timezone.now() - dt.timedelta(days=1),
        target_id=schema["secondary"].id,
        detail={"row_count": 7},
    )

    event_response = auth(client, users["admin"]).get(f"/api/v1/admin/export-events/{legacy.id}")
    missing_job = auth(client, users["admin"]).get("/api/v1/admin/export-jobs/EXP-NOT-FOUND")
    missing_event = auth(client, users["admin"]).get("/api/v1/admin/export-events/999999")

    assert event_response.status_code == 200, event_response.json()
    assert event_response.json()["source"] == "sync_export"
    assert event_response.json()["row_count"] == 7
    assert event_response.json()["detail"] == {"row_count": 7}
    assert missing_job.status_code == 404
    assert missing_event.status_code == 404
