from __future__ import annotations

from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.schemas.field_security import serialize_data_payload
from apps.schemas.identity import resolve_display_code_or_fallback
from apps.schemas.permissions import can_edit_data
from apps.temporal.models import TemporalRecord
from apps.temporal.queries import get_entity_timeline

from .models import EntityLabel
from .services import serialize_label


def build_resolved_scan_payload(label: EntityLabel, user: Any) -> dict[str, Any]:
    record = _current_record(label)
    data_payload = serialize_data_payload(
        label.schema,
        label.schema.fields_config,
        record.data_payload if record else {},
        user,
    )
    display_code = resolve_display_code_or_fallback(
        label.schema,
        data_payload,
        label.entity.business_code,
    )
    return {
        "outcome": "resolved",
        "label": serialize_label(label),
        "entity": {
            "id": label.entity_id,
            "schema_id": label.schema_id,
            "business_code": label.entity.business_code,
            "display_code": display_code,
        },
        "record": _serialize_record(record, data_payload),
        "recent_changes": _recent_changes(label),
        "attachments": _attachment_fields(label.schema.fields_config, data_payload),
        "capabilities": {
            "can_manage_labels": can_edit_data(user, label.schema),
            "can_start_change_set_draft": can_edit_data(user, label.schema),
        },
    }


def _current_record(label: EntityLabel) -> TemporalRecord | None:
    today = timezone.localdate()
    return (
        TemporalRecord.objects.filter(entity=label.entity, is_superseded=False)
        .filter(valid_from__lte=today)
        .filter(Q(valid_to__isnull=True) | Q(valid_to__gt=today))
        .order_by("-valid_from", "-id")
        .first()
    )


def _serialize_record(record: TemporalRecord | None, data_payload: dict[str, Any]) -> dict[str, Any] | None:
    if record is None:
        return None
    return {
        "record_id": record.id,
        "data_payload": data_payload,
        "valid_from": record.valid_from.isoformat(),
        "valid_to": record.valid_to.isoformat() if record.valid_to else None,
        "schema_version": record.schema_version,
        "change_set_id": record.change_set_id,
        "recorded_by_id": record.recorded_by_id,
        "recorded_at": record.recorded_at.isoformat(),
    }


def _recent_changes(label: EntityLabel) -> list[dict[str, Any]]:
    records = get_entity_timeline(label.entity)[-3:]
    return [
        {
            "record_id": record.record_id,
            "change_set_id": record.change_set_id,
            "change_summary": record.change_summary,
            "valid_from": record.valid_from.isoformat(),
            "valid_to": record.valid_to.isoformat() if record.valid_to else None,
            "recorded_at": record.recorded_at.isoformat(),
        }
        for record in reversed(records)
    ]


def _attachment_fields(fields_config: list[dict[str, Any]], data_payload: dict[str, Any]) -> list[dict[str, Any]]:
    attachments = []
    for field in fields_config:
        key = field.get("key")
        if field.get("type") not in {"attachment", "image"} or not isinstance(key, str):
            continue
        attachments.append(
            {
                "field_key": key,
                "label": field.get("label") or key,
                "value": data_payload.get(key, []),
            }
        )
    return attachments
