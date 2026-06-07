import datetime as dt

import pytest
from django.http import QueryDict
from django.utils import timezone

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.notifications.models import Notification
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.stats import export_job_worker
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
        summary="Initial records",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.make_aware(dt.datetime(2024, 6, 21, 10, 0, 0)),
    )
    entity = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    record = TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "In Use"},
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


def create_job(schema, user, query_string: str) -> ExportJob:
    query_snapshot = build_current_export_query_snapshot(schema, user, QueryDict(query_string))
    return ExportJob.objects.create(
        owner=user,
        schema=schema,
        export_format=query_snapshot["format"],
        snapshot_key=build_current_export_snapshot_key(query_snapshot),
        query_snapshot=query_snapshot,
        row_count_estimate=1,
    )


@pytest.mark.django_db
def test_completed_export_creates_finished_notification(
    django_capture_on_commit_callbacks,
    tmp_path,
    settings,
    users,
    schema,
    records,
):
    settings.MEDIA_ROOT = tmp_path
    job = create_job(schema, users["viewer"], "format=csv&at=2024-06-30")

    with django_capture_on_commit_callbacks(execute=True):
        process_export_jobs(limit=1)

    job.refresh_from_db()
    notification = Notification.objects.get(
        recipient=job.owner,
        type=Notification.Type.EXPORT_FINISHED,
        target_id=job.job_code,
    )
    assert notification.severity == Notification.Severity.SUCCESS
    assert notification.target_kind == "export_job"
    assert notification.target_url == f"/schemas/{job.schema_id}/records/export?job={job.job_code}"
    assert notification.payload == {
        "schema_id": job.schema_id,
        "job_code": job.job_code,
        "filename": job.filename,
    }
    assert notification.dedupe_key == f"export_finished:{job.job_code}"


@pytest.mark.django_db
def test_failed_export_creates_failed_notification(
    django_capture_on_commit_callbacks,
    tmp_path,
    settings,
    users,
    schema,
    monkeypatch,
):
    settings.MEDIA_ROOT = tmp_path
    job = create_job(schema, users["viewer"], "format=csv&at=2024-06-30")

    def raise_error(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(export_job_worker, "build_current_export", raise_error)

    with django_capture_on_commit_callbacks(execute=True):
        process_export_jobs(limit=1)

    job.refresh_from_db()
    notification = Notification.objects.get(
        recipient=job.owner,
        type=Notification.Type.EXPORT_FAILED,
        target_id=job.job_code,
    )
    assert notification.severity == Notification.Severity.ERROR
    assert notification.target_kind == "export_job"
    assert notification.target_url == f"/schemas/{job.schema_id}/records/export?job={job.job_code}"
    assert notification.payload == {
        "schema_id": job.schema_id,
        "job_code": job.job_code,
        "error_code": "export_generation_failed",
    }
    assert notification.dedupe_key == f"export_failed:{job.job_code}"
