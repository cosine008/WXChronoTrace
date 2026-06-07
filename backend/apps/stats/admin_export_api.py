from __future__ import annotations

import datetime as dt
import math
from typing import Any

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import NotFound, ValidationError

from apps.audit.models import AuditLog
from apps.schemas.models import DataSchema

from .export_specs import export_spec_summary
from .models import ExportJob

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DEFAULT_WINDOW_DAYS = 30
EXPORT_EVENT_ACTION = "data.export"
RISK_FLAG_LARGE_EXPORT = "large_export"
RISK_FLAG_SENSITIVE_FIELDS = "sensitive_fields"
SAFE_QUERY_SNAPSHOT_KEYS = {
    "schema_id",
    "user_id",
    "at",
    "retro",
    "search",
    "ordering",
    "change_set",
    "schema_version",
    "format",
    "row_count",
}
SAFE_EVENT_DETAIL_KEYS = {
    "job_code",
    "schema_code",
    "format",
    "export_scope",
    "row_count",
    "row_count_actual",
    "row_count_estimate",
    "file_size_bytes",
    "risk_flags",
    "query_snapshot",
    "export_summary",
}


def list_admin_export_jobs_payload(query_params) -> dict[str, Any]:
    jobs = _filter_jobs(query_params)
    return _paginated_payload(
        rows=jobs,
        query_params=query_params,
        serializer=_serialize_job_row,
        summary_builder=_job_summary,
    )


def get_admin_export_job_payload(job_code: str) -> dict[str, Any]:
    job = ExportJob.objects.select_related("owner", "schema").filter(job_code=job_code).first()
    if job is None:
        raise NotFound("export job does not exist")
    payload = _serialize_job_row(job)
    payload["query_snapshot"] = _safe_query_snapshot(job.query_snapshot)
    payload["audit_events"] = [
        {
            "id": log.id,
            "action": log.action,
            "actor_username": log.actor.username if log.actor_id else None,
            "created_at": log.created_at.isoformat(),
        }
        for log in AuditLog.objects.select_related("actor")
        .filter(detail__job_code=job.job_code)
        .order_by("-created_at", "-id")[:20]
    ]
    return payload


def list_admin_export_events_payload(query_params) -> dict[str, Any]:
    logs = _filter_events(query_params)
    schema_by_id, schema_by_code = _event_schema_maps(logs)
    return _paginated_payload(
        rows=logs,
        query_params=query_params,
        serializer=lambda log: _serialize_event_row(log, schema_by_id, schema_by_code),
        summary_builder=_event_summary,
    )


def get_admin_export_event_payload(audit_log_id: int) -> dict[str, Any]:
    log = AuditLog.objects.select_related("actor").filter(id=audit_log_id, action=EXPORT_EVENT_ACTION).first()
    if log is None:
        raise NotFound("export event does not exist")
    schema_by_id, schema_by_code = _event_schema_maps([log])
    payload = _serialize_event_row(log, schema_by_id, schema_by_code)
    payload["query_snapshot"] = _safe_query_snapshot(_detail(log).get("query_snapshot"))
    payload["detail"] = _safe_event_detail(_detail(log))
    return payload


def _filter_jobs(query_params) -> list[ExportJob]:
    queryset = ExportJob.objects.select_related("owner", "schema").all()
    if status := query_params.get("status"):
        queryset = queryset.filter(status=status)
    if export_format := query_params.get("format"):
        queryset = queryset.filter(export_format=export_format)
    if schema_id := query_params.get("schema_id"):
        queryset = queryset.filter(schema_id=_positive_int(schema_id, "schema_id"))
    if schema_query := query_params.get("schema"):
        queryset = queryset.filter(
            Q(schema__schema_code__icontains=schema_query) | Q(schema__name__icontains=schema_query)
        )
    if owner := query_params.get("owner"):
        owner_filter = Q(owner__username__icontains=owner)
        if str(owner).isdigit():
            owner_filter |= Q(owner_id=int(owner))
        queryset = queryset.filter(owner_filter)
    queryset = _apply_date_window(queryset, "created_at", query_params, default_last_30_days=True)
    queryset = _apply_date_bounds(queryset, "finished_at", query_params, "finished_after", "finished_before")
    if expires_before := query_params.get("expires_before"):
        queryset = queryset.filter(expires_at__lte=_parse_bound(expires_before, "expires_before", is_end=True))
    jobs = list(queryset.order_by("-created_at", "-id"))
    if risk := query_params.get("risk"):
        jobs = [job for job in jobs if risk in _list_value(job.risk_flags)]
    if "has_file" in query_params:
        has_file = _parse_bool(query_params.get("has_file"), "has_file")
        jobs = [job for job in jobs if bool(job.file.name) is has_file]
    return jobs


def _filter_events(query_params) -> list[AuditLog]:
    queryset = AuditLog.objects.select_related("actor").filter(action=EXPORT_EVENT_ACTION)
    if actor := query_params.get("actor"):
        actor_filter = Q(actor__username__icontains=actor)
        if str(actor).isdigit():
            actor_filter |= Q(actor_id=int(actor))
        queryset = queryset.filter(actor_filter)
    if schema_query := query_params.get("schema"):
        schema_ids = list(
            DataSchema.objects.filter(Q(schema_code__icontains=schema_query) | Q(name__icontains=schema_query))
            .values_list("id", flat=True)
        )
        queryset = queryset.filter(
            Q(detail__schema_code__icontains=schema_query) | Q(target_id__in=schema_ids)
        )
    if target_type := query_params.get("target_type"):
        queryset = queryset.filter(target_type=target_type)
    if export_format := query_params.get("format"):
        queryset = queryset.filter(detail__format=export_format)
    if job_code := query_params.get("job_code"):
        queryset = queryset.filter(detail__job_code__icontains=job_code)
    queryset = _apply_date_window(queryset, "created_at", query_params, default_last_30_days=True)
    logs = list(queryset.order_by("-created_at", "-id"))
    if risk := query_params.get("risk"):
        logs = [log for log in logs if risk in _event_risk_flags(log)]
    if source := query_params.get("source"):
        logs = [log for log in logs if _event_source(_detail(log)) == source]
    if min_rows := query_params.get("min_rows"):
        minimum = _positive_int(min_rows, "min_rows")
        logs = [log for log in logs if (_event_row_count(_detail(log)) or 0) >= minimum]
    return logs


def _serialize_job_row(job: ExportJob) -> dict[str, Any]:
    return {
        "job_code": job.job_code,
        "status": job.status,
        "owner": {"id": job.owner_id, "username": job.owner.username},
        "schema": {"id": job.schema_id, "schema_code": job.schema.schema_code, "name": job.schema.name},
        "export_scope": job.export_scope,
        "format": job.export_format,
        "row_count_estimate": job.row_count_estimate,
        "row_count_actual": job.row_count_actual,
        "risk_flags": _list_value(job.risk_flags),
        "risk_details": _safe_risk_details(job.risk_details),
        "export_summary": export_spec_summary(job.query_snapshot),
        "filename": job.filename or None,
        "file_size_bytes": job.file_size_bytes,
        "has_file": bool(job.file.name),
        "error_code": job.error_code or None,
        "error_message": _safe_error_message(job.error_message),
        "created_at": job.created_at.isoformat(),
        "started_at": _iso_or_none(job.started_at),
        "finished_at": _iso_or_none(job.finished_at),
        "expires_at": _iso_or_none(job.expires_at),
    }


def _serialize_event_row(log: AuditLog, schema_by_id, schema_by_code) -> dict[str, Any]:
    detail = _detail(log)
    schema = _event_schema(log, detail, schema_by_id, schema_by_code)
    return {
        "id": log.id,
        "actor": None if not log.actor_id else {"id": log.actor_id, "username": log.actor.username},
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "schema_code": detail.get("schema_code") or (schema.schema_code if schema else None),
        "schema_name": detail.get("schema_name") or (schema.name if schema else None),
        "format": detail.get("format"),
        "row_count": _event_row_count(detail),
        "job_code": detail.get("job_code"),
        "risk_flags": _event_risk_flags(log),
        "file_size_bytes": _coerce_int(detail.get("file_size_bytes")),
        "created_at": log.created_at.isoformat(),
        "source": _event_source(detail),
    }


def _job_summary(jobs: list[ExportJob]) -> dict[str, int]:
    return {
        "total": len(jobs),
        "queued": sum(job.status == ExportJob.Status.QUEUED for job in jobs),
        "running": sum(job.status == ExportJob.Status.RUNNING for job in jobs),
        "completed": sum(job.status == ExportJob.Status.COMPLETED for job in jobs),
        "failed": sum(job.status == ExportJob.Status.FAILED for job in jobs),
        "expired": sum(job.status == ExportJob.Status.EXPIRED for job in jobs),
        "high_risk": sum(bool(_list_value(job.risk_flags)) for job in jobs),
    }


def _event_summary(logs: list[AuditLog]) -> dict[str, int]:
    return {
        "total": len(logs),
        "with_job": sum(bool(_detail(log).get("job_code")) for log in logs),
        "without_job": sum(not _detail(log).get("job_code") for log in logs),
        "high_risk": sum(bool(_event_risk_flags(log)) for log in logs),
        "large_export": sum("large_export" in _event_risk_flags(log) for log in logs),
        "sensitive_fields": sum("sensitive_fields" in _event_risk_flags(log) for log in logs),
    }


def _paginated_payload(*, rows: list[Any], query_params, serializer, summary_builder) -> dict[str, Any]:
    page = _positive_int(query_params.get("page"), "page", default=1)
    page_size = _positive_int(query_params.get("page_size"), "page_size", default=DEFAULT_PAGE_SIZE)
    page_size = min(page_size, MAX_PAGE_SIZE)
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "summary": summary_builder(rows),
        "results": [serializer(row) for row in page_rows],
    }


def _event_schema_maps(logs: list[AuditLog]):
    schema_ids = {log.target_id for log in logs if isinstance(log.target_id, int)}
    schema_codes = {str(_detail(log).get("schema_code")) for log in logs if _detail(log).get("schema_code")}
    schema_by_id = DataSchema.objects.in_bulk(schema_ids)
    schema_by_code = {schema.schema_code: schema for schema in DataSchema.objects.filter(schema_code__in=schema_codes)}
    return schema_by_id, schema_by_code


def _event_schema(log: AuditLog, detail: dict[str, Any], schema_by_id, schema_by_code):
    return schema_by_id.get(log.target_id) or schema_by_code.get(str(detail.get("schema_code") or ""))


def _safe_query_snapshot(snapshot: Any) -> dict[str, Any]:
    if not isinstance(snapshot, dict):
        return {}
    safe_snapshot = {key: snapshot[key] for key in SAFE_QUERY_SNAPSHOT_KEYS if key in snapshot}
    if isinstance(snapshot.get("export_spec"), dict):
        safe_snapshot["export_summary"] = export_spec_summary(snapshot)
    return safe_snapshot


def _safe_event_detail(detail: dict[str, Any]) -> dict[str, Any]:
    safe_detail = {key: detail[key] for key in SAFE_EVENT_DETAIL_KEYS if key in detail}
    if "query_snapshot" in safe_detail:
        safe_detail["query_snapshot"] = _safe_query_snapshot(safe_detail["query_snapshot"])
    return safe_detail


def _safe_risk_details(risk_details: Any) -> dict[str, Any]:
    if not isinstance(risk_details, dict):
        return {}
    safe_details: dict[str, Any] = {}
    threshold = _coerce_int(risk_details.get("large_export_threshold"))
    if threshold is not None:
        safe_details["large_export_threshold"] = threshold
    sensitive_fields = risk_details.get("sensitive_fields")
    if isinstance(sensitive_fields, list):
        safe_fields = []
        for item in sensitive_fields:
            if not isinstance(item, dict):
                continue
            key = item.get("key")
            label = item.get("label")
            if isinstance(key, str) and isinstance(label, str):
                safe_fields.append({"key": key, "label": label})
        safe_details["sensitive_fields"] = safe_fields
    return safe_details


def _event_source(detail: dict[str, Any]) -> str:
    if detail.get("job_code"):
        return "export_job"
    if any(key in detail for key in {"schema_code", "format", "row_count", "row_count_actual", "row_count_estimate", "query_snapshot", "export_scope"}):
        return "sync_export"
    return "unknown"


def _event_row_count(detail: dict[str, Any]) -> int | None:
    for key in ("row_count", "row_count_actual", "row_count_estimate"):
        value = _coerce_int(detail.get(key))
        if value is not None:
            return value
    return None


def export_event_row_count(log: AuditLog) -> int | None:
    return _event_row_count(_detail(log))


def _event_risk_flags(log: AuditLog) -> list[str]:
    detail = _detail(log)
    raw_flags = _list_value(detail.get("risk_flags"))
    flags: list[str] = []
    if _event_has_large_export_risk(detail, raw_flags):
        flags.append(RISK_FLAG_LARGE_EXPORT)
    for flag in raw_flags:
        if flag not in flags:
            flags.append(flag)
    return flags


def export_event_has_risk(log: AuditLog, risk: str) -> bool:
    return risk in _event_risk_flags(log)


def _event_has_large_export_risk(detail: dict[str, Any], raw_flags: list[str]) -> bool:
    if RISK_FLAG_LARGE_EXPORT in raw_flags:
        return True
    row_count = _event_row_count(detail)
    return row_count is not None and row_count > _export_large_row_threshold()


def _export_large_row_threshold() -> int:
    return int(getattr(settings, "EXPORT_LARGE_ROW_THRESHOLD", 5000))


def _safe_error_message(message: str) -> str:
    first_line = str(message or "").splitlines()[0] if message else ""
    return "" if first_line.startswith("Traceback") else first_line


def _apply_date_window(queryset, field: str, query_params, *, default_last_30_days: bool):
    after_key = "created_after"
    before_key = "created_before"
    if not query_params.get(after_key) and not query_params.get(before_key) and default_last_30_days:
        return queryset.filter(**{f"{field}__gte": timezone.now() - dt.timedelta(days=DEFAULT_WINDOW_DAYS)})
    return _apply_date_bounds(queryset, field, query_params, after_key, before_key)


def _apply_date_bounds(queryset, field: str, query_params, after_key: str, before_key: str):
    if after_value := query_params.get(after_key):
        queryset = queryset.filter(**{f"{field}__gte": _parse_bound(after_value, after_key, is_end=False)})
    if before_value := query_params.get(before_key):
        queryset = queryset.filter(**{f"{field}__lte": _parse_bound(before_value, before_key, is_end=True)})
    return queryset


def _parse_bound(value: Any, field: str, *, is_end: bool):
    if value in (None, ""):
        raise ValidationError({field: "datetime is required"})
    parsed_dt = parse_datetime(str(value))
    if parsed_dt is not None:
        return parsed_dt if timezone.is_aware(parsed_dt) else timezone.make_aware(parsed_dt)
    parsed_date = parse_date(str(value))
    if parsed_date is None:
        raise ValidationError({field: "invalid datetime"})
    bound_time = dt.time.max if is_end else dt.time.min
    return timezone.make_aware(dt.datetime.combine(parsed_date, bound_time))


def _positive_int(value: Any, field: str, default: int | None = None) -> int:
    if value in (None, ""):
        if default is None:
            raise ValidationError({field: "must be a positive integer"})
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "must be a positive integer"}) from exc
    if parsed < 1:
        raise ValidationError({field: "must be a positive integer"})
    return parsed


def _parse_bool(value: Any, field: str) -> bool:
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValidationError({field: "must be a boolean"})


def _detail(log: AuditLog) -> dict[str, Any]:
    return log.detail if isinstance(log.detail, dict) else {}


def _list_value(value: Any) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def _coerce_int(value: Any) -> int | None:
    try:
        return None if value in (None, "") else int(value)
    except (TypeError, ValueError):
        return None


def _iso_or_none(value) -> str | None:
    return value.isoformat() if value else None
