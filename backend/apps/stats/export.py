from __future__ import annotations

import csv
import json
from io import BytesIO, StringIO
from typing import Any
from uuid import uuid4

from django.utils import timezone
from openpyxl import Workbook
from rest_framework.exceptions import ValidationError

from apps.schemas.field_security import serialize_data_payload
from apps.schemas.identity import field_is_system_hidden, resolve_display_code_or_fallback
from apps.schemas.models import DataSchema
from apps.temporal.api import resolve_current_view
from apps.temporal.filters import current_view_filter_payload

from .export_columns import resolve_export_fields
from .export_rows import apply_export_row_scope, selected_entity_ids_for_row_scope
from .export_specs import COLUMN_MODE_ALL_EXPORTABLE


def build_current_export(
    schema: DataSchema,
    user,
    query_params,
    *,
    fields_config: list[dict[str, Any]] | None = None,
    schema_version: int | None = None,
    query_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    export_format = str(query_params.get("format") or "xlsx").lower()
    if export_format not in {"xlsx", "csv"}:
        raise ValidationError({"format": "must be xlsx or csv"})
    view, records, retro = resolve_current_view(
        schema,
        query_params,
        user=user,
        fields_config=fields_config,
        schema_version=schema_version,
    )
    export_spec = _snapshot_export_spec(query_snapshot)
    export_fields = (
        resolve_export_fields(schema, user, view.fields_config, export_spec)
        if export_spec is not None
        else _active_export_fields(view.fields_config)
    )
    records = apply_export_row_scope(records, export_spec)
    metadata = _metadata(
        schema,
        user,
        query_params,
        view,
        records,
        retro,
        export_format,
        export_fields=export_fields,
        query_snapshot=query_snapshot,
    )
    content = (
        _csv_bytes(schema, user, view.fields_config, export_fields, records)
        if export_format == "csv"
        else _xlsx_bytes(schema, user, view.fields_config, export_fields, records, metadata)
    )
    return {
        "content": content,
        "format": export_format,
        "filename": f"{schema.schema_code}_{view.at.isoformat()}.{export_format}",
        "metadata": metadata,
    }


def _csv_bytes(
    schema: DataSchema,
    user,
    fields: list[dict[str, Any]],
    export_fields: list[dict[str, Any]],
    records,
) -> bytes:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(_headers(export_fields))
    for record in records:
        writer.writerow(_row(schema, user, fields, export_fields, record))
    return output.getvalue().encode("utf-8-sig")


def _xlsx_bytes(
    schema: DataSchema,
    user,
    fields: list[dict[str, Any]],
    export_fields: list[dict[str, Any]],
    records,
    metadata: dict[str, Any],
) -> bytes:
    workbook = Workbook()
    data_sheet = workbook.active
    data_sheet.title = "data"
    data_sheet.append(_headers(export_fields))
    for record in records:
        data_sheet.append(_row(schema, user, fields, export_fields, record))
    meta_sheet = workbook.create_sheet("metadata")
    for key, value in metadata.items():
        meta_sheet.append([key, value])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _headers(fields: list[dict[str, Any]]) -> list[str]:
    return [
        "display_code",
        "valid_from",
        "valid_to",
        "schema_version",
        *[field.get("label") or field["key"] for field in fields],
    ]


def _row(
    schema: DataSchema,
    user,
    fields: list[dict[str, Any]],
    export_fields: list[dict[str, Any]],
    record,
) -> list[Any]:
    data_payload = serialize_data_payload(schema, fields, record.data_payload, user)
    return [
        resolve_display_code_or_fallback(schema, data_payload, record.business_code),
        record.valid_from.isoformat(),
        record.valid_to.isoformat() if record.valid_to else "",
        record.schema_version,
        *[_cell_value(data_payload.get(field["key"])) for field in export_fields],
    ]


def _cell_value(value: Any) -> Any:
    if isinstance(value, dict | list):
        return json.dumps(value, ensure_ascii=False)
    return value


def _active_export_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        field
        for field in fields
        if not field.get("deprecated") and not field_is_system_hidden(field)
    ]


def _metadata(
    schema,
    user,
    query_params,
    view,
    records,
    retro: bool,
    export_format: str,
    *,
    export_fields: list[dict[str, Any]],
    query_snapshot: dict[str, Any] | None = None,
) -> dict:
    exported_at = timezone.now()
    row_count = len(records)
    snapshot = (
        {**query_snapshot, "row_count": row_count}
        if query_snapshot is not None
        else _query_snapshot(
            schema,
            user,
            query_params,
            view,
            retro=retro,
            requested_at=exported_at,
            row_count=row_count,
        )
    )
    filters = {
        key: query_params.get(key)
        for key in ("search", "ordering", "filters")
        if query_params.get(key) not in (None, "")
    }
    export_column_keys = [field["key"] for field in export_fields]
    return {
        "export_id": f"EXP-{exported_at:%Y%m%d-%H%M%S}-{uuid4().hex[:6].upper()}",
        "exported_at": exported_at.isoformat(),
        "exported_by": getattr(user, "username", str(user)),
        "export_scope": "current_view",
        "schema_name": schema.name,
        "schema_code": schema.schema_code,
        "schema_version": view.schema_version,
        "data_at": view.at.isoformat(),
        "retro": retro,
        "row_count": row_count,
        "format": export_format,
        "export_row_scope_mode": _export_row_scope_mode(query_snapshot),
        "export_row_scope_selected_entity_count": _export_row_scope_selected_count(query_snapshot),
        "export_column_mode": _export_column_mode(query_snapshot),
        "export_column_count": len(export_column_keys),
        "export_column_keys": json.dumps(export_column_keys, ensure_ascii=False),
        "query_snapshot": json.dumps(snapshot, ensure_ascii=False),
        "filters": json.dumps(filters, ensure_ascii=False),
    }


def _snapshot_export_spec(query_snapshot: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(query_snapshot, dict):
        return None
    spec = query_snapshot.get("export_spec")
    return spec if isinstance(spec, dict) else None


def _export_column_mode(query_snapshot: dict[str, Any] | None) -> str:
    spec = _snapshot_export_spec(query_snapshot)
    columns = spec.get("columns") if isinstance(spec, dict) else {}
    if not isinstance(columns, dict):
        return COLUMN_MODE_ALL_EXPORTABLE
    mode = columns.get("mode")
    return str(mode or COLUMN_MODE_ALL_EXPORTABLE)


def _export_row_scope_mode(query_snapshot: dict[str, Any] | None) -> str:
    spec = _snapshot_export_spec(query_snapshot)
    row_scope = spec.get("row_scope") if isinstance(spec, dict) else {}
    if not isinstance(row_scope, dict):
        return "filtered_result"
    return str(row_scope.get("mode") or "filtered_result")


def _export_row_scope_selected_count(query_snapshot: dict[str, Any] | None) -> int:
    return len(selected_entity_ids_for_row_scope(_snapshot_export_spec(query_snapshot)) or [])


def _query_snapshot(
    schema,
    user,
    query_params,
    view,
    *,
    retro: bool,
    requested_at,
    row_count: int,
) -> dict[str, Any]:
    snapshot = {
        "schema_id": schema.id,
        "user_id": getattr(user, "id", None),
        "at": view.at.isoformat(),
        "retro": retro,
        "search": str(query_params.get("search") or ""),
        "ordering": str(query_params.get("ordering") or "business_code"),
        "change_set": _optional_int(query_params.get("change_set")),
        "schema_version": view.schema_version,
        "requested_at": requested_at.isoformat(),
        "row_count": row_count,
    }
    filters = current_view_filter_payload(query_params)
    if filters:
        snapshot["filters"] = filters
    return snapshot


def _optional_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    return int(value)
