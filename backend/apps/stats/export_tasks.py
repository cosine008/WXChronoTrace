from __future__ import annotations

import datetime as dt
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from django.core.cache import cache
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.schemas.models import DataSchema
from apps.temporal.filters import current_view_filter_payload
from apps.temporal.queries import resolve_schema_fields

CURRENT_EXPORT_TASK_TTL_SECONDS = 10 * 60


@dataclass(frozen=True)
class ExportTaskLock:
    key: str
    acquired: bool

    def release(self) -> None:
        if self.acquired:
            cache.delete(self.key)


def begin_current_export_task(schema: DataSchema, user, query_params) -> ExportTaskLock:
    key = current_export_task_key(schema, user, query_params)
    acquired = cache.add(key, True, CURRENT_EXPORT_TASK_TTL_SECONDS)
    return ExportTaskLock(key=key, acquired=acquired)


def current_export_task_key(schema: DataSchema, user, query_params) -> str:
    at = _parse_date(query_params.get("at"))
    retro = _parse_bool(query_params.get("retro"))
    schema_version = resolve_schema_fields(schema, at, retro=retro).version
    digest = hashlib.sha256(
        json.dumps(
            {
                "schema_id": schema.id,
                "user_id": getattr(user, "id", None),
                "at": at.isoformat(),
                "retro": retro,
                "filters": current_view_filter_payload(query_params),
                "search": str(query_params.get("search") or ""),
                "ordering": str(query_params.get("ordering") or "business_code"),
                "change_set": _optional_int(query_params.get("change_set")),
                "schema_version": schema_version,
                "format": str(query_params.get("format") or "xlsx").lower(),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return f"current_export_task:{digest}"


def _parse_date(value: str | None) -> dt.date:
    if not value:
        return timezone.localdate()
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({"at": "日期格式必须是 YYYY-MM-DD"}) from exc


def _parse_bool(value: str | None) -> bool:
    if value in (None, ""):
        return False
    normalized = value.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValidationError({"retro": "布尔值必须是 true 或 false"})


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"change_set": "必须是正整数"}) from exc
