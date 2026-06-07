from __future__ import annotations

import json
from io import BytesIO
from typing import Any
from uuid import uuid4

from django.utils import timezone
from openpyxl import Workbook

from apps.changesets.api import get_changeset_payload
from apps.changesets.models import ChangeSet
from apps.schemas.identity import IDENTITY_CODE_FIELD_KEY, field_is_system_hidden
from apps.temporal.api import build_entity_timeline_payload
from apps.temporal.models import Entity


def build_changeset_export(change_set: ChangeSet, user) -> dict[str, Any]:
    detail = get_changeset_payload(change_set.schema, change_set.id, user)
    metadata = _metadata(
        user,
        export_scope="changeset",
        schema=change_set.schema,
        row_count=len(detail["entries"]),
        extra={"change_set_id": change_set.id, "status": change_set.status},
    )
    return {
        "content": _workbook_bytes(
            _changeset_headers(), _changeset_rows(change_set.id, detail["entries"]), metadata
        ),
        "filename": f"{change_set.schema.schema_code}_changeset_{change_set.id}.xlsx",
        "metadata": metadata,
    }


def build_entity_export(entity: Entity, user) -> dict[str, Any]:
    payload = build_entity_timeline_payload(entity, user)
    fields = _active_non_identity_fields(entity.schema.fields_config, entity.schema.identity_field_key)
    display_code = payload["entity"].get("display_code") or entity.business_code
    metadata = _metadata(
        user,
        export_scope="entity",
        schema=entity.schema,
        row_count=len(payload["records"]),
        extra={
            "entity_id": entity.id,
            "business_code": entity.business_code,
            "display_code": display_code,
        },
    )
    headers = [
        "display_code",
        "valid_from",
        "valid_to",
        "schema_version",
        "change_set_id",
        *[field.get("label") or field["key"] for field in fields],
    ]
    rows = [
        [
            display_code,
            record["valid_from"],
            record["valid_to"] or "",
            record["schema_version"],
            record["change_set_id"],
            *[_cell_value(record["data_payload"].get(field["key"])) for field in fields],
        ]
        for record in payload["records"]
    ]
    return {
        "content": _workbook_bytes(headers, rows, metadata),
        "filename": f"{entity.schema.schema_code}_{entity.business_code}_lifecycle.xlsx",
        "metadata": metadata,
    }


def _changeset_headers() -> list[str]:
    return [
        "change_set_id",
        "display_code",
        "action",
        "field",
        "before",
        "after",
        "valid_from",
        "valid_to",
    ]


def _changeset_rows(change_set_id: int, entries: list[dict]) -> list[list[Any]]:
    rows = []
    for entry in entries:
        fields = [field for field in entry["changed_fields"] if field != IDENTITY_CODE_FIELD_KEY] or [""]
        for field in fields:
            rows.append(
                [
                    change_set_id,
                    entry.get("display_code") or entry["business_code"],
                    entry["action"],
                    field,
                    _cell_value((entry["data_before"] or {}).get(field)),
                    _cell_value((entry["data_after"] or {}).get(field)),
                    entry["valid_from"],
                    entry["valid_to"] or "",
                ]
            )
    return rows


def _workbook_bytes(headers: list[str], rows: list[list[Any]], metadata: dict[str, Any]) -> bytes:
    workbook = Workbook()
    data_sheet = workbook.active
    data_sheet.title = "data"
    data_sheet.append(headers)
    for row in rows:
        data_sheet.append(row)
    meta_sheet = workbook.create_sheet("metadata")
    for key, value in metadata.items():
        meta_sheet.append([key, value])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _metadata(user, *, export_scope: str, schema, row_count: int, extra: dict[str, Any]) -> dict:
    exported_at = timezone.now()
    return {
        "export_id": f"EXP-{exported_at:%Y%m%d-%H%M%S}-{uuid4().hex[:6].upper()}",
        "exported_at": exported_at.isoformat(),
        "exported_by": getattr(user, "username", str(user)),
        "export_scope": export_scope,
        "schema_name": schema.name,
        "schema_code": schema.schema_code,
        "schema_version": schema.current_version,
        "row_count": row_count,
        **extra,
    }


def _active_non_identity_fields(fields_config: list[dict], identity_field_key: str) -> list[dict]:
    return [
        field
        for field in fields_config
        if (
            field.get("key") != identity_field_key
            and not field.get("deprecated", False)
            and not field_is_system_hidden(field)
        )
    ]


def _cell_value(value: Any) -> Any:
    if isinstance(value, dict | list):
        return json.dumps(value, ensure_ascii=False)
    return value
