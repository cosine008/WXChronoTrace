from __future__ import annotations

from typing import Any

from apps.schemas.field_security import can_view_field_value
from apps.schemas.identity import field_is_system_hidden
from apps.schemas.models import DataSchema

from .export_specs import (
    COLUMN_MODE_ALL_EXPORTABLE,
    COLUMN_MODE_SELECTED,
    COLUMN_MODE_VISIBLE_COLUMNS,
)


def resolve_export_fields(
    schema: DataSchema,
    user,
    fields_config: list[dict[str, Any]],
    export_spec: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    exportable_fields = [
        field
        for field in fields_config
        if _field_is_exportable(schema, user, field)
    ]
    columns = export_spec.get("columns") if isinstance(export_spec, dict) else {}
    columns = columns if isinstance(columns, dict) else {}
    mode = str(columns.get("mode") or COLUMN_MODE_ALL_EXPORTABLE)
    if mode == COLUMN_MODE_ALL_EXPORTABLE:
        return exportable_fields
    if mode not in {COLUMN_MODE_SELECTED, COLUMN_MODE_VISIBLE_COLUMNS}:
        return exportable_fields

    by_key = {field["key"]: field for field in exportable_fields}
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    field_keys = columns.get("field_keys") if isinstance(columns.get("field_keys"), list) else []
    for key in field_keys:
        if not isinstance(key, str) or key in seen or key not in by_key:
            continue
        seen.add(key)
        result.append(by_key[key])
    return result


def _field_is_exportable(schema: DataSchema, user, field: dict[str, Any]) -> bool:
    return (
        isinstance(field.get("key"), str)
        and not field.get("deprecated")
        and not field_is_system_hidden(field)
        and can_view_field_value(user, schema, field)
    )
