from __future__ import annotations

import math
from datetime import timedelta
from typing import Any

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema

from .models import AuditLog

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def list_audit_logs_payload(user: Any, query_params, *, sensitive_only: bool = False) -> dict:
    queryset = audit_logs_queryset(user, query_params, sensitive_only=sensitive_only)
    page = _positive_int(query_params.get("page"), "page", default=1)
    page_size = _positive_int(
        query_params.get("page_size"),
        "page_size",
        default=DEFAULT_PAGE_SIZE,
        maximum=MAX_PAGE_SIZE,
    )
    total = queryset.count()
    start = (page - 1) * page_size
    logs = list(queryset[start : start + page_size])
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": serialize_audit_logs(logs),
    }


def audit_logs_queryset(user: Any, query_params, *, sensitive_only: bool = False):
    queryset = _visible_audit_logs(user).select_related("actor").order_by("-created_at", "-id")
    if sensitive_only:
        queryset = queryset.filter(is_sensitive=True)
        if not query_params.get("created_after") and not query_params.get("created_before"):
            queryset = queryset.filter(created_at__gte=timezone.now() - timedelta(days=30))
    return _apply_filters(queryset, query_params)


def serialize_audit_logs(logs: list[AuditLog]) -> list[dict]:
    context = _target_context(logs)
    return [_serialize_audit_log(log, context) for log in logs]


def _visible_audit_logs(user: Any):
    if getattr(user, "is_superuser", False):
        return AuditLog.objects.all()

    owned_schema_ids = DataSchema.objects.filter(owner=user).values_list("id", flat=True)
    owned_changeset_ids = ChangeSet.objects.filter(schema_id__in=owned_schema_ids).values_list(
        "id", flat=True
    )
    return AuditLog.objects.filter(
        Q(actor=user)
        | Q(target_type="schema", target_id__in=owned_schema_ids)
        | Q(target_type="changeset", target_id__in=owned_changeset_ids)
    ).distinct()


def _apply_filters(queryset, query_params):
    if actor_id := query_params.get("actor_id"):
        queryset = queryset.filter(actor_id=_positive_int(actor_id, "actor_id", default=1))
    if actor := query_params.get("actor"):
        queryset = queryset.filter(actor__username__icontains=actor)
    if action := query_params.get("action"):
        queryset = queryset.filter(action=action)
    if target_type := query_params.get("target_type"):
        queryset = queryset.filter(target_type=target_type)
    if target_id := query_params.get("target_id"):
        queryset = queryset.filter(target_id=_positive_int(target_id, "target_id", default=1))
    if (is_sensitive := query_params.get("is_sensitive")) not in (None, ""):
        queryset = queryset.filter(is_sensitive=_parse_bool(is_sensitive, "is_sensitive"))
    return _apply_time_filters(queryset, query_params)


def _apply_time_filters(queryset, query_params):
    if created_after := query_params.get("created_after"):
        if parsed_date := parse_date(created_after):
            queryset = queryset.filter(created_at__date__gte=parsed_date)
        elif parsed_datetime := parse_datetime(created_after):
            queryset = queryset.filter(created_at__gte=parsed_datetime)
        else:
            raise ValidationError({"created_after": "日期格式必须是 YYYY-MM-DD 或 ISO datetime"})
    if created_before := query_params.get("created_before"):
        if parsed_date := parse_date(created_before):
            queryset = queryset.filter(created_at__date__lte=parsed_date)
        elif parsed_datetime := parse_datetime(created_before):
            queryset = queryset.filter(created_at__lte=parsed_datetime)
        else:
            raise ValidationError({"created_before": "日期格式必须是 YYYY-MM-DD 或 ISO datetime"})
    return queryset


def _target_context(logs: list[AuditLog]) -> dict:
    schema_ids = {log.target_id for log in logs if log.target_type == "schema" and log.target_id}
    changeset_ids = {
        log.target_id for log in logs if log.target_type == "changeset" and log.target_id
    }
    schemas = DataSchema.objects.filter(id__in=schema_ids).in_bulk()
    changesets = (
        ChangeSet.objects.filter(id__in=changeset_ids).select_related("schema").in_bulk()
    )
    return {"schemas": schemas, "changesets": changesets}


def _serialize_audit_log(log: AuditLog, context: dict) -> dict:
    schema_id, schema_name = _target_schema(log, context)
    return {
        "id": log.id,
        "actor_id": log.actor_id,
        "actor_username": log.actor.username,
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "target_schema_id": schema_id,
        "target_schema_name": schema_name,
        "detail": log.detail,
        "is_sensitive": log.is_sensitive,
        "ip_address": log.ip_address,
        "created_at": log.created_at.isoformat(),
    }


def _target_schema(log: AuditLog, context: dict) -> tuple[int | None, str | None]:
    if log.target_type == "schema" and log.target_id:
        schema = context["schemas"].get(log.target_id)
        return (schema.id, schema.name) if schema else (log.target_id, None)
    if log.target_type == "changeset" and log.target_id:
        changeset = context["changesets"].get(log.target_id)
        if changeset:
            return changeset.schema_id, changeset.schema.name
    return None, None


def _positive_int(value: object, field: str, *, default: int, maximum: int | None = None) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "必须是正整数"}) from exc
    if parsed < 1:
        raise ValidationError({field: "必须是正整数"})
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def _parse_bool(value: object, field: str) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise ValidationError({field: "必须是布尔值"})
