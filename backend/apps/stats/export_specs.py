from __future__ import annotations

import datetime as dt
import json
from typing import Any

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.schemas.models import DataSchema
from apps.temporal.queries import resolve_schema_fields

from .models import ExportJob

EXPORT_SCOPE_CURRENT_VIEW = ExportJob.Scope.CURRENT_VIEW
ROW_SCOPE_FILTERED_RESULT = "filtered_result"
ROW_SCOPE_CURRENT_PAGE = "current_page"
ROW_SCOPE_SELECTED_ENTITIES = "selected_entities"
ROW_SCOPE_SNAPSHOT_ALL = "snapshot_all"
COLUMN_MODE_VISIBLE_COLUMNS = "visible_columns"
COLUMN_MODE_ALL_EXPORTABLE = "all_exportable"
COLUMN_MODE_SELECTED = "selected"
SUPPORTED_ROW_SCOPE_MODES = {
    ROW_SCOPE_FILTERED_RESULT,
    ROW_SCOPE_CURRENT_PAGE,
    ROW_SCOPE_SELECTED_ENTITIES,
    ROW_SCOPE_SNAPSHOT_ALL,
}
SUPPORTED_COLUMN_MODES = {
    COLUMN_MODE_VISIBLE_COLUMNS,
    COLUMN_MODE_ALL_EXPORTABLE,
    COLUMN_MODE_SELECTED,
}
SUPPORTED_FILTER_OPERATORS = {
    "equals",
    "not_equals",
    "contains",
    "starts_with",
    "is_empty",
    "is_not_empty",
    "greater_than",
    "greater_than_or_equal",
    "less_than",
    "less_than_or_equal",
    "between",
    "in",
    "not_in",
}


def normalize_current_export_params(query_params) -> dict[str, Any]:
    export_format = _export_format(_param(query_params, "format"))
    return {
        "format": export_format,
        "at": _parse_date(_param(query_params, "at")),
        "retro": _parse_bool(_param(query_params, "retro"), "retro"),
        "filters": _normalize_filters(_param(query_params, "filters", preserve_list=True)),
        "search": str(_param(query_params, "search") or ""),
        "ordering": str(_param(query_params, "ordering") or "business_code"),
        "change_set": _optional_int(_param(query_params, "change_set")),
    }


def normalize_export_spec(schema: DataSchema, user, query_params) -> dict[str, Any]:
    raw_spec = _export_spec_payload(query_params)
    legacy = normalize_current_export_params(query_params)
    source = raw_spec or _legacy_export_spec(schema, legacy)
    time = _normalize_time(source.get("time"), legacy)
    schema_fields = resolve_schema_fields(schema, time["at"], retro=time["retro"])
    row_scope = _normalize_row_scope(source.get("row_scope"))
    filters = _normalize_filters(source.get("filters", []))
    search = str(source.get("search", legacy["search"]) or "")
    change_set = _optional_int(source.get("change_set", legacy["change_set"]))
    if row_scope["mode"] == ROW_SCOPE_SNAPSHOT_ALL:
        filters = []
        search = ""
        change_set = None
    return {
        "schema_id": schema.id,
        "schema_version": schema_fields.version,
        "scope": EXPORT_SCOPE_CURRENT_VIEW,
        "format": _export_format(source.get("format", legacy["format"])),
        "time": {"at": time["at"].isoformat(), "retro": time["retro"]},
        "row_scope": row_scope,
        "filters": filters,
        "search": search,
        "ordering": str(source.get("ordering", legacy["ordering"]) or "business_code"),
        "change_set": change_set,
        "columns": _normalize_columns(source.get("columns")),
    }


def export_spec_summary(query_snapshot: dict[str, Any]) -> dict[str, Any]:
    spec = query_snapshot.get("export_spec")
    if not isinstance(spec, dict):
        return {
            "row_scope_mode": ROW_SCOPE_FILTERED_RESULT,
            "column_mode": COLUMN_MODE_ALL_EXPORTABLE,
            "column_count": None,
            "filter_count": 0,
            "search_present": bool(query_snapshot.get("search")),
            "change_set": query_snapshot.get("change_set"),
        }
    columns = spec.get("columns") if isinstance(spec.get("columns"), dict) else {}
    row_scope = spec.get("row_scope") if isinstance(spec.get("row_scope"), dict) else {}
    field_keys = columns.get("field_keys") if isinstance(columns.get("field_keys"), list) else []
    filters = spec.get("filters") if isinstance(spec.get("filters"), list) else []
    return {
        "row_scope_mode": str(row_scope.get("mode") or ROW_SCOPE_FILTERED_RESULT),
        "column_mode": str(columns.get("mode") or COLUMN_MODE_ALL_EXPORTABLE),
        "column_count": len(field_keys),
        "filter_count": len(filters),
        "search_present": bool(spec.get("search")),
        "change_set": spec.get("change_set"),
    }


def _legacy_export_spec(schema: DataSchema, normalized: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_id": schema.id,
        "scope": EXPORT_SCOPE_CURRENT_VIEW,
        "format": normalized["format"],
        "time": {"at": normalized["at"].isoformat(), "retro": normalized["retro"]},
        "row_scope": {"mode": ROW_SCOPE_FILTERED_RESULT, "selected_entity_ids": []},
        "filters": normalized["filters"],
        "search": normalized["search"],
        "ordering": normalized["ordering"],
        "change_set": normalized["change_set"],
        "columns": {"mode": COLUMN_MODE_ALL_EXPORTABLE, "field_keys": []},
    }


def _export_spec_payload(query_params) -> dict[str, Any] | None:
    value = _param(query_params, "export_spec")
    if value in (None, ""):
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValidationError({"export_spec": "must be a JSON object"}) from exc
        if isinstance(parsed, dict):
            return parsed
    raise ValidationError({"export_spec": "must be an object"})


def _export_format(value: Any) -> str:
    export_format = str(value or ExportJob.Format.XLSX).lower()
    if export_format not in {ExportJob.Format.CSV, ExportJob.Format.XLSX}:
        raise ValidationError({"format": "must be xlsx or csv"})
    return export_format


def _normalize_time(raw_time: Any, legacy: dict[str, Any]) -> dict[str, Any]:
    time = raw_time if isinstance(raw_time, dict) else {}
    return {
        "at": _parse_date(time.get("at", legacy["at"])),
        "retro": _parse_bool(time.get("retro", legacy["retro"]), "retro"),
    }


def _normalize_row_scope(raw_row_scope: Any) -> dict[str, Any]:
    row_scope = raw_row_scope if isinstance(raw_row_scope, dict) else {}
    mode = str(row_scope.get("mode") or ROW_SCOPE_FILTERED_RESULT)
    if mode not in SUPPORTED_ROW_SCOPE_MODES:
        raise ValidationError({"export_spec.row_scope.mode": "unsupported row scope mode"})
    selected_entity_ids = _int_list(row_scope.get("selected_entity_ids"))
    if mode == ROW_SCOPE_SELECTED_ENTITIES and not selected_entity_ids:
        raise ValidationError(
            {
                "export_spec.row_scope.selected_entity_ids": (
                    "required for selected_entities row scope"
                )
            }
        )
    return {
        "mode": mode,
        "selected_entity_ids": selected_entity_ids,
    }


def _normalize_filters(raw_filters: Any) -> list[dict[str, Any]]:
    if raw_filters in (None, ""):
        return []
    if isinstance(raw_filters, str):
        try:
            raw_filters = json.loads(raw_filters)
        except json.JSONDecodeError as exc:
            raise ValidationError({"export_spec.filters": "must be a JSON list"}) from exc
    if not isinstance(raw_filters, list):
        raise ValidationError({"export_spec.filters": "must be a list"})
    return [_normalize_filter(item) for item in raw_filters]


def _normalize_filter(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise ValidationError({"export_spec.filters": "each filter must be an object"})
    field = item.get("field")
    operator = str(item.get("operator") or "")
    if not isinstance(field, str) or not field:
        raise ValidationError({"export_spec.filters.field": "field is required"})
    if operator not in SUPPORTED_FILTER_OPERATORS:
        raise ValidationError({"export_spec.filters.operator": "unsupported operator"})
    normalized = {"field": field, "operator": operator}
    if "value" in item:
        normalized["value"] = item["value"]
    return normalized


def _normalize_columns(raw_columns: Any) -> dict[str, Any]:
    columns = raw_columns if isinstance(raw_columns, dict) else {}
    mode = str(columns.get("mode") or COLUMN_MODE_ALL_EXPORTABLE)
    if mode not in SUPPORTED_COLUMN_MODES:
        raise ValidationError({"export_spec.columns.mode": "unsupported column mode"})
    field_keys = [] if mode == COLUMN_MODE_ALL_EXPORTABLE else _string_list(columns.get("field_keys"))
    return {"mode": mode, "field_keys": field_keys}


def _param(query_params, key: str, *, preserve_list: bool = False) -> Any:
    value = query_params.get(key) if hasattr(query_params, "get") else None
    if isinstance(value, list) and not preserve_list:
        return value[-1] if value else None
    return value


def _parse_date(value: Any) -> dt.date:
    if value in (None, ""):
        return timezone.localdate()
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError({"at": "date must use YYYY-MM-DD"}) from exc


def _parse_bool(value: Any, field_name: str) -> bool:
    if value in (None, ""):
        return False
    if isinstance(value, bool):
        return value
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValidationError({field_name: "must be true or false"})


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        raise ValidationError({"change_set": "must be an integer"})
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"change_set": "must be an integer"}) from exc


def _int_list(value: Any) -> list[int]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValidationError({"selected_entity_ids": "must be a list"})
    result: list[int] = []
    for item in value:
        if isinstance(item, bool):
            raise ValidationError({"selected_entity_ids": "must contain integers"})
        try:
            result.append(int(item))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"selected_entity_ids": "must contain integers"}) from exc
    return _unique(result)


def _string_list(value: Any) -> list[str]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValidationError({"field_keys": "must be a list"})
    return _unique([item for item in value if isinstance(item, str) and item])


def _unique(values: list[Any]) -> list[Any]:
    seen = set()
    result = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
