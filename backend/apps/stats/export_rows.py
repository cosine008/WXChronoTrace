from __future__ import annotations

from typing import Any, Iterable

from .export_specs import ROW_SCOPE_CURRENT_PAGE, ROW_SCOPE_SELECTED_ENTITIES

ROW_SCOPE_ENTITY_ID_MODES = {ROW_SCOPE_CURRENT_PAGE, ROW_SCOPE_SELECTED_ENTITIES}


def apply_export_row_scope(records: Iterable[Any], export_spec: dict[str, Any] | None) -> list[Any]:
    scoped_records = list(records)
    entity_ids = selected_entity_ids_for_row_scope(export_spec)
    if entity_ids is None:
        return scoped_records

    records_by_entity_id = {int(record.entity_id): record for record in scoped_records}
    return [
        records_by_entity_id[entity_id]
        for entity_id in entity_ids
        if entity_id in records_by_entity_id
    ]


def selected_entity_ids_for_row_scope(export_spec: dict[str, Any] | None) -> list[int] | None:
    if not isinstance(export_spec, dict):
        return None
    row_scope = export_spec.get("row_scope")
    if not isinstance(row_scope, dict):
        return None
    if row_scope.get("mode") not in ROW_SCOPE_ENTITY_ID_MODES:
        return None
    selected_entity_ids = row_scope.get("selected_entity_ids")
    if not isinstance(selected_entity_ids, list):
        return []
    return [entity_id for entity_id in selected_entity_ids if isinstance(entity_id, int)]
