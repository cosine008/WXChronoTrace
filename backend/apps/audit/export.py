from __future__ import annotations

import csv
import json
from io import BytesIO, StringIO
from typing import Any
from uuid import uuid4

from django.utils import timezone
from openpyxl import Workbook
from rest_framework.exceptions import ValidationError

from .api import audit_logs_queryset, serialize_audit_logs

FILTER_KEYS = (
    "actor",
    "actor_id",
    "action",
    "target_type",
    "target_id",
    "is_sensitive",
    "created_after",
    "created_before",
)

HEADERS = [
    "id",
    "created_at",
    "actor_username",
    "action",
    "target_type",
    "target_id",
    "target_schema_id",
    "target_schema_name",
    "is_sensitive",
    "ip_address",
    "detail",
]


def build_audit_export(user, query_params, *, sensitive_only: bool = True) -> dict[str, Any]:
    export_format = str(query_params.get("format") or "xlsx").lower()
    if export_format not in {"xlsx", "csv"}:
        raise ValidationError({"format": "must be xlsx or csv"})
    logs = list(audit_logs_queryset(user, query_params, sensitive_only=sensitive_only))
    rows = serialize_audit_logs(logs)
    metadata = _metadata(user, query_params, rows, export_format, sensitive_only)
    content = _csv_bytes(rows) if export_format == "csv" else _xlsx_bytes(rows, metadata)
    return {
        "content": content,
        "format": export_format,
        "filename": f"{metadata['export_scope']}_{metadata['exported_at'][:19].replace(':', '')}.{export_format}",
        "metadata": metadata,
    }


def _csv_bytes(rows: list[dict]) -> bytes:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(HEADERS)
    for row in rows:
        writer.writerow(_row(row))
    return output.getvalue().encode("utf-8-sig")


def _xlsx_bytes(rows: list[dict], metadata: dict[str, Any]) -> bytes:
    workbook = Workbook()
    data_sheet = workbook.active
    data_sheet.title = "data"
    data_sheet.append(HEADERS)
    for row in rows:
        data_sheet.append(_row(row))
    meta_sheet = workbook.create_sheet("metadata")
    for key, value in metadata.items():
        meta_sheet.append([key, _cell_value(value)])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _row(entry: dict) -> list[Any]:
    return [
        entry["id"],
        entry["created_at"],
        entry["actor_username"],
        entry["action"],
        entry["target_type"],
        entry["target_id"],
        entry["target_schema_id"],
        entry["target_schema_name"],
        entry["is_sensitive"],
        entry["ip_address"],
        json.dumps(entry["detail"], ensure_ascii=False),
    ]


def _metadata(user, query_params, rows: list[dict], export_format: str, sensitive_only: bool) -> dict:
    exported_at = timezone.now()
    export_scope = "sensitive_audit_logs" if sensitive_only else "audit_logs"
    return {
        "export_id": f"EXP-{exported_at:%Y%m%d-%H%M%S}-{uuid4().hex[:6].upper()}",
        "exported_at": exported_at.isoformat(),
        "exported_by": getattr(user, "username", str(user)),
        "export_scope": export_scope,
        "row_count": len(rows),
        "format": export_format,
        "filters": _filters(query_params),
    }


def _filters(query_params) -> dict[str, Any]:
    return {
        key: query_params.get(key)
        for key in FILTER_KEYS
        if query_params.get(key) not in (None, "")
    }


def _cell_value(value: Any) -> Any:
    if isinstance(value, dict | list):
        return json.dumps(value, ensure_ascii=False)
    return value
