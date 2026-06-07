from __future__ import annotations

import datetime as dt
import json
import math
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import record_audit_log
from apps.schemas.field_security import can_view_field_value
from apps.schemas.identity import field_is_system_hidden
from apps.schemas.models import DataSchema
from apps.temporal.api import resolve_current_view
from apps.temporal.queries import resolve_schema_fields

from .export_snapshots import (
    RISK_FLAG_LARGE_EXPORT,
    RISK_FLAG_SENSITIVE_FIELDS,
    build_current_export_query_snapshot,
    build_current_export_snapshot_key,
    find_reusable_export_job,
)
from .export_rows import apply_export_row_scope
from .export_specs import COLUMN_MODE_SELECTED, COLUMN_MODE_VISIBLE_COLUMNS, export_spec_summary
from .models import ExportJob

DEFAULT_EXPORT_JOB_PAGE_SIZE = 20
MAX_EXPORT_JOB_PAGE_SIZE = 100


@dataclass(frozen=True)
class ExportJobCreateResult:
    job: ExportJob
    created: bool


class ExportJobConflictError(Exception):
    def __init__(self, payload: dict[str, Any]) -> None:
        super().__init__(str(payload.get("detail", "export job conflict")))
        self.payload = payload


def create_current_export_job(
    *,
    schema: DataSchema,
    user,
    data,
    ip_address: str | None = None,
) -> ExportJobCreateResult:
    snapshot = build_current_export_query_snapshot(schema, user, data)
    snapshot_key = build_current_export_snapshot_key(snapshot)
    reusable = find_reusable_export_job(user, schema, snapshot["format"], snapshot_key)
    if reusable is not None:
        return ExportJobCreateResult(job=reusable, created=False)

    row_count_estimate = estimate_current_export_row_count(schema, user, snapshot)
    risk_flags, risk_details = detect_current_export_risks(
        schema,
        user,
        snapshot,
        row_count_estimate,
    )
    if risk_flags and not _risk_confirmed(data):
        raise ExportJobConflictError(
            {
                "detail": "export risk confirmation required",
                "risk_confirmation_required": True,
                "row_count_estimate": row_count_estimate,
                "risk_flags": risk_flags,
                "risk_details": risk_details,
            }
        )

    max_active = int(getattr(settings, "EXPORT_MAX_ACTIVE_JOBS_PER_USER", 3))
    active_count = ExportJob.objects.filter(
        owner=user,
        status__in=[ExportJob.Status.QUEUED, ExportJob.Status.RUNNING],
    ).count()
    if active_count >= max_active:
        raise ExportJobConflictError(
            {
                "detail": "active export job limit exceeded",
                "max_active_jobs": max_active,
            }
        )

    risk_confirmed_at = timezone.now() if risk_flags else None
    risk_confirmed_by = user if risk_flags else None
    try:
        with transaction.atomic():
            job = ExportJob.objects.create(
                owner=user,
                schema=schema,
                export_format=snapshot["format"],
                snapshot_key=snapshot_key,
                query_snapshot=snapshot,
                row_count_estimate=row_count_estimate,
                risk_flags=risk_flags,
                risk_details=risk_details,
                risk_confirmed_at=risk_confirmed_at,
                risk_confirmed_by=risk_confirmed_by,
                filename=_export_filename(schema, snapshot, snapshot_key),
                content_type=_content_type(snapshot["format"]),
            )
    except IntegrityError:
        reusable = find_reusable_export_job(user, schema, snapshot["format"], snapshot_key)
        if reusable is not None:
            return ExportJobCreateResult(job=reusable, created=False)
        raise

    _audit_job_create(job, ip_address=ip_address)
    return ExportJobCreateResult(job=job, created=True)


def estimate_current_export_row_count(schema: DataSchema, user, query_snapshot: dict[str, Any]) -> int:
    _, records, _ = resolve_current_view(
        schema,
        current_export_query_params(query_snapshot),
        user=user,
    )
    records = apply_export_row_scope(records, _snapshot_export_spec(query_snapshot))
    return len(records)


def detect_current_export_risks(
    schema: DataSchema,
    user,
    query_snapshot: dict[str, Any],
    row_count_estimate: int,
) -> tuple[list[str], dict[str, Any]]:
    risk_flags: list[str] = []
    risk_details: dict[str, Any] = {}
    threshold = int(getattr(settings, "EXPORT_LARGE_ROW_THRESHOLD", 5000))
    if row_count_estimate > threshold:
        risk_flags.append(RISK_FLAG_LARGE_EXPORT)
        risk_details["large_export_threshold"] = threshold

    sensitive_fields = _sensitive_export_fields(schema, user, query_snapshot)
    if sensitive_fields:
        risk_flags.append(RISK_FLAG_SENSITIVE_FIELDS)
        risk_details["sensitive_fields"] = sensitive_fields
    return risk_flags, risk_details


def current_export_query_params(query_snapshot: dict[str, Any]) -> dict[str, str]:
    spec = _snapshot_export_spec(query_snapshot)
    if spec is not None:
        time = spec.get("time") if isinstance(spec.get("time"), dict) else {}
        change_set = spec.get("change_set")
        return {
            "format": str(spec.get("format") or query_snapshot.get("format") or ExportJob.Format.XLSX),
            "at": str(time.get("at") or query_snapshot.get("at")),
            "retro": "true" if time.get("retro") else "false",
            "filters": _filters_query_value(spec.get("filters")),
            "search": str(spec.get("search") or ""),
            "ordering": str(spec.get("ordering") or "business_code"),
            "change_set": "" if change_set is None else str(change_set),
        }
    return {
        "format": str(query_snapshot["format"]),
        "at": str(query_snapshot["at"]),
        "retro": "true" if query_snapshot.get("retro") else "false",
        "filters": _filters_query_value(query_snapshot.get("filters")),
        "search": str(query_snapshot.get("search") or ""),
        "ordering": str(query_snapshot.get("ordering") or "business_code"),
        "change_set": (
            "" if query_snapshot.get("change_set") is None else str(query_snapshot["change_set"])
        ),
    }


def serialize_export_job(job: ExportJob) -> dict[str, Any]:
    return {
        "job_code": job.job_code,
        "status": job.status,
        "export_scope": job.export_scope,
        "format": job.export_format,
        "schema": {
            "id": job.schema_id,
            "schema_code": job.schema.schema_code,
            "name": job.schema.name,
        },
        "query_snapshot": _response_query_snapshot(job.query_snapshot),
        "export_summary": export_spec_summary(job.query_snapshot),
        "row_count_estimate": job.row_count_estimate,
        "row_count_actual": job.row_count_actual,
        "risk_flags": job.risk_flags,
        "risk_confirmation_required": False,
        "risk_details": job.risk_details,
        "filename": job.filename,
        "file_size_bytes": job.file_size_bytes,
        "error_code": job.error_code or None,
        "error_message": job.error_message or "",
        "expires_at": _iso_or_none(job.expires_at),
        "download_url": _download_url(job),
        "created_at": job.created_at.isoformat(),
        "started_at": _iso_or_none(job.started_at),
        "finished_at": _iso_or_none(job.finished_at),
    }


def list_export_jobs_payload(user, query_params) -> dict[str, Any]:
    page = _positive_int(query_params.get("page"), "page", default=1)
    page_size = _positive_int(
        query_params.get("page_size"),
        "page_size",
        default=DEFAULT_EXPORT_JOB_PAGE_SIZE,
        maximum=MAX_EXPORT_JOB_PAGE_SIZE,
    )
    queryset = _export_jobs_queryset(user, query_params)
    total = queryset.count()
    start = (page - 1) * page_size
    jobs = list(queryset[start : start + page_size])
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": [serialize_export_job(job) for job in jobs],
    }


def get_owned_export_job(user, job_code: str) -> ExportJob | None:
    return (
        ExportJob.objects.select_related("schema", "owner")
        .filter(owner=user, job_code=job_code)
        .first()
    )


def record_export_download(job: ExportJob, *, ip_address: str | None = None) -> None:
    record_audit_log(
        actor=job.owner,
        action="data.export",
        target_type=job.export_scope,
        target_id=job.schema_id,
        detail={
            "job_code": job.job_code,
            "schema_code": job.schema.schema_code,
            "format": job.export_format,
            "export_scope": job.export_scope,
            "row_count_estimate": job.row_count_estimate,
            "row_count_actual": job.row_count_actual,
            "file_size_bytes": job.file_size_bytes,
            "risk_flags": job.risk_flags,
            "query_snapshot": job.query_snapshot,
            "export_summary": export_spec_summary(job.query_snapshot),
        },
        ip_address=ip_address,
    )


def record_export_download_denied(
    job: ExportJob,
    *,
    reason: str,
    ip_address: str | None = None,
) -> None:
    record_audit_log(
        actor=job.owner,
        action="export.download_denied",
        target_type=job.export_scope,
        target_id=job.schema_id,
        detail={
            "job_code": job.job_code,
            "schema_code": job.schema.schema_code,
            "format": job.export_format,
            "export_scope": job.export_scope,
            "reason": reason,
            "query_snapshot": job.query_snapshot,
            "export_summary": export_spec_summary(job.query_snapshot),
        },
        ip_address=ip_address,
    )


def _export_jobs_queryset(user, query_params):
    queryset = ExportJob.objects.select_related("schema").filter(owner=user)
    if status := query_params.get("status"):
        queryset = queryset.filter(status=status)
    if schema_id := query_params.get("schema_id"):
        queryset = queryset.filter(schema_id=_positive_int(schema_id, "schema_id", default=1))
    if export_format := query_params.get("format"):
        queryset = queryset.filter(export_format=export_format)
    if not _parse_bool(query_params.get("include_expired"), "include_expired", default=False):
        queryset = queryset.exclude(status=ExportJob.Status.EXPIRED)
    return queryset.order_by("-created_at", "-id")


def _sensitive_export_fields(schema: DataSchema, user, query_snapshot: dict[str, Any]) -> list[dict]:
    at = dt.date.fromisoformat(str(query_snapshot["at"]))
    schema_fields = resolve_schema_fields(schema, at, retro=bool(query_snapshot.get("retro")))
    included_keys = _included_export_field_keys(query_snapshot)
    return [
        {"key": field["key"], "label": field.get("label") or field["key"]}
        for field in schema_fields.fields_config
        if _field_is_exported(field)
        and (included_keys is None or field["key"] in included_keys)
        and field.get("sensitive")
        and can_view_field_value(user, schema, field)
    ]


def _snapshot_export_spec(query_snapshot: dict[str, Any]) -> dict[str, Any] | None:
    spec = query_snapshot.get("export_spec")
    return spec if isinstance(spec, dict) else None


def _filters_query_value(value: Any) -> str:
    if not isinstance(value, list) or not value:
        return ""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _included_export_field_keys(query_snapshot: dict[str, Any]) -> set[str] | None:
    spec = _snapshot_export_spec(query_snapshot)
    if spec is None:
        return None
    columns = spec.get("columns") if isinstance(spec.get("columns"), dict) else {}
    mode = columns.get("mode")
    if mode not in {COLUMN_MODE_SELECTED, COLUMN_MODE_VISIBLE_COLUMNS}:
        return None
    field_keys = columns.get("field_keys")
    if not isinstance(field_keys, list):
        return set()
    return {key for key in field_keys if isinstance(key, str)}


def _field_is_exported(field: dict[str, Any]) -> bool:
    return (
        isinstance(field.get("key"), str)
        and not field.get("deprecated")
        and not field_is_system_hidden(field)
    )


def _risk_confirmed(data) -> bool:
    value = data.get("risk_confirmed") if hasattr(data, "get") else False
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return False
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValidationError({"risk_confirmed": "布尔值必须是 true 或 false"})


def _export_filename(schema: DataSchema, query_snapshot: dict[str, Any], snapshot_key: str) -> str:
    return f"{schema.schema_code}_{query_snapshot['at']}_{snapshot_key[:6].upper()}.{query_snapshot['format']}"


def _content_type(export_format: str) -> str:
    if export_format == ExportJob.Format.CSV:
        return "text/csv; charset=utf-8"
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _response_query_snapshot(query_snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in query_snapshot.items()
        if key != "requested_at"
    }


def _download_url(job: ExportJob) -> str | None:
    if job.status != ExportJob.Status.COMPLETED:
        return None
    if job.expires_at and job.expires_at <= timezone.now():
        return None
    return f"/api/v1/export/jobs/{job.job_code}/download"


def _iso_or_none(value) -> str | None:
    return value.isoformat() if value else None


def _positive_int(value: object, field: str, *, default: int, maximum: int | None = None) -> int:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        raise ValidationError({field: "必须是正整数"})
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "必须是正整数"}) from exc
    if parsed < 1:
        raise ValidationError({field: "必须是正整数"})
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def _parse_bool(value: object, field: str, *, default: bool) -> bool:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValidationError({field: "布尔值必须是 true 或 false"})


def _audit_job_create(job: ExportJob, *, ip_address: str | None = None) -> None:
    record_audit_log(
        actor=job.owner,
        action="export.job_create",
        target_type="schema",
        target_id=job.schema_id,
        detail={
            "job_code": job.job_code,
            "schema_code": job.schema.schema_code,
            "format": job.export_format,
            "export_scope": job.export_scope,
            "row_count_estimate": job.row_count_estimate,
            "risk_flags": job.risk_flags,
            "risk_confirmed": bool(job.risk_flags),
            "query_snapshot": job.query_snapshot,
            "export_summary": export_spec_summary(job.query_snapshot),
        },
        ip_address=ip_address,
    )
