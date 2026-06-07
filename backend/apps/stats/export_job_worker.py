from __future__ import annotations

import datetime as dt

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import QueryDict
from django.utils import timezone

from apps.audit.services import record_audit_log
from apps.notifications.models import Notification
from apps.notifications.services import schedule_notification_on_commit
from apps.schemas.models import SchemaVersion

from .export import build_current_export
from .export_jobs import current_export_query_params
from .export_specs import export_spec_summary
from .models import ExportJob

STALE_RUNNING_TIMEOUT = dt.timedelta(minutes=30)


class ExportJobWorkerError(Exception):
    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code


def process_export_jobs(
    *, limit: int = 10, now=None, cleanup_expired: bool = False
) -> dict[str, int]:
    now = now or timezone.now()
    summary = {
        "processed": 0,
        "failed": 0,
        "stale_failed": fail_stale_running_jobs(now=now),
        "expired": cleanup_expired_jobs(now=now) if cleanup_expired else 0,
    }
    for _ in range(max(limit, 0)):
        job = _start_next_queued_job(now=now)
        if job is None:
            break
        outcome = _process_running_job(job)
        summary[outcome] += 1
    return summary


def fail_stale_running_jobs(*, now=None) -> int:
    now = now or timezone.now()
    stale_before = now - STALE_RUNNING_TIMEOUT
    count = 0
    jobs = ExportJob.objects.filter(
        status=ExportJob.Status.RUNNING,
        started_at__isnull=False,
        started_at__lte=stale_before,
    )
    for job in jobs.iterator():
        _mark_job_failed(
            job,
            error_code="worker_timeout",
            error_message="export job exceeded 30 minutes in worker",
            finished_at=now,
        )
        count += 1
    return count


def cleanup_expired_jobs(*, now=None) -> int:
    now = now or timezone.now()
    count = 0
    jobs = ExportJob.objects.filter(
        status=ExportJob.Status.COMPLETED,
        expires_at__isnull=False,
        expires_at__lte=now,
    )
    for job in jobs.iterator():
        _delete_job_file(job)
        job.status = ExportJob.Status.EXPIRED
        job.save(update_fields=["status", "file"])
        count += 1
    return count


def _start_next_queued_job(*, now) -> ExportJob | None:
    with transaction.atomic():
        job = (
            ExportJob.objects.select_for_update(skip_locked=True)
            .select_related("schema", "owner")
            .filter(status=ExportJob.Status.QUEUED)
            .order_by("created_at")
            .first()
        )
        if job is None:
            return None
        job.status = ExportJob.Status.RUNNING
        job.started_at = now
        job.error_code = ""
        job.error_message = ""
        job.save(update_fields=["status", "started_at", "error_code", "error_message"])
        return job


def _process_running_job(job: ExportJob) -> str:
    try:
        fields_config, schema_version = _snapshot_fields(job)
        export = build_current_export(
            job.schema,
            job.owner,
            _query_params(job.query_snapshot),
            fields_config=fields_config,
            schema_version=schema_version,
            query_snapshot=job.query_snapshot,
        )
        _mark_job_completed(job, export=export, finished_at=timezone.now())
        return "processed"
    except ExportJobWorkerError as exc:
        _mark_job_failed(
            job,
            error_code=exc.error_code,
            error_message=_error_message(exc),
            finished_at=timezone.now(),
        )
        return "failed"
    except Exception as exc:  # noqa: BLE001
        _mark_job_failed(
            job,
            error_code="export_generation_failed",
            error_message=_error_message(exc),
            finished_at=timezone.now(),
        )
        return "failed"


def _mark_job_completed(job: ExportJob, *, export: dict, finished_at) -> None:
    content = export["content"]
    job.export_format = export["format"]
    job.file.save(export["filename"], ContentFile(content), save=False)
    job.filename = export["filename"]
    job.content_type = _content_type(export["format"])
    job.row_count_actual = int(export["metadata"]["row_count"])
    job.file_size_bytes = len(content)
    job.status = ExportJob.Status.COMPLETED
    job.finished_at = finished_at
    job.expires_at = finished_at + dt.timedelta(days=settings.EXPORT_JOB_RETENTION_DAYS)
    job.error_code = ""
    job.error_message = ""
    job.save(
        update_fields=[
            "file",
            "filename",
            "content_type",
            "export_format",
            "row_count_actual",
            "file_size_bytes",
            "status",
            "finished_at",
            "expires_at",
            "error_code",
            "error_message",
        ]
    )
    _schedule_export_finished_notification(job)
    _record_completed_audit(job)


def _mark_job_failed(
    job: ExportJob,
    *,
    error_code: str,
    error_message: str,
    finished_at,
) -> None:
    _delete_job_file(job)
    job.status = ExportJob.Status.FAILED
    job.error_code = error_code
    job.error_message = error_message
    job.finished_at = finished_at
    job.save(update_fields=["status", "error_code", "error_message", "finished_at", "file"])
    _schedule_export_failed_notification(job)
    _record_failed_audit(job)


def _schedule_export_finished_notification(job: ExportJob) -> None:
    schedule_notification_on_commit(
        recipient=job.owner,
        type=Notification.Type.EXPORT_FINISHED,
        severity=Notification.Severity.SUCCESS,
        title="导出已完成",
        body=f"{job.filename} 已生成，可以下载。",
        target_kind="export_job",
        target_id=job.job_code,
        target_url=f"/schemas/{job.schema_id}/records/export?job={job.job_code}",
        payload={
            "schema_id": job.schema_id,
            "job_code": job.job_code,
            "filename": job.filename,
        },
        dedupe_key=f"export_finished:{job.job_code}",
    )


def _schedule_export_failed_notification(job: ExportJob) -> None:
    schedule_notification_on_commit(
        recipient=job.owner,
        type=Notification.Type.EXPORT_FAILED,
        severity=Notification.Severity.ERROR,
        title="导出失败",
        body=job.error_message or "导出任务执行失败，请查看任务详情。",
        target_kind="export_job",
        target_id=job.job_code,
        target_url=f"/schemas/{job.schema_id}/records/export?job={job.job_code}",
        payload={
            "schema_id": job.schema_id,
            "job_code": job.job_code,
            "error_code": job.error_code,
        },
        dedupe_key=f"export_failed:{job.job_code}",
    )


def _query_params(snapshot: dict) -> QueryDict:
    query = QueryDict("", mutable=True)
    for key, value in current_export_query_params(snapshot).items():
        if value != "":
            query[key] = value
    return query


def _snapshot_fields(job: ExportJob) -> tuple[list[dict], int]:
    schema_version = int(job.query_snapshot.get("schema_version") or job.schema.current_version)
    version = (
        SchemaVersion.objects.filter(schema=job.schema, version=schema_version)
        .order_by("-created_at", "-id")
        .first()
    )
    if version is None:
        raise ExportJobWorkerError(
            "schema_version_missing",
            f"schema version {schema_version} is missing for export job snapshot",
        )
    return version.fields_config, version.version


def _content_type(export_format: str) -> str:
    if export_format == ExportJob.Format.CSV:
        return "text/csv; charset=utf-8"
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _delete_job_file(job: ExportJob) -> None:
    if job.file.name:
        job.file.delete(save=False)


def _error_message(exc: Exception) -> str:
    message = " ".join(str(exc).splitlines()).strip()
    return message or exc.__class__.__name__


def _record_completed_audit(job: ExportJob) -> None:
    record_audit_log(
        actor=job.owner,
        action="export.job_completed",
        target_type=job.export_scope,
        target_id=job.schema_id,
        detail={
            "job_code": job.job_code,
            "format": job.export_format,
            "row_count": job.row_count_actual or 0,
            "schema_code": job.schema.schema_code,
            "query_snapshot": job.query_snapshot,
            "export_summary": export_spec_summary(job.query_snapshot),
        },
    )


def _record_failed_audit(job: ExportJob) -> None:
    record_audit_log(
        actor=job.owner,
        action="export.job_failed",
        target_type=job.export_scope,
        target_id=job.schema_id,
        detail={
            "job_code": job.job_code,
            "format": job.export_format,
            "error_code": job.error_code,
            "schema_code": job.schema.schema_code,
        },
    )
