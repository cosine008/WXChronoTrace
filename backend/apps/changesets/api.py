from __future__ import annotations

import copy
import datetime as dt
import math
from collections import Counter
from typing import Any

from django.db import transaction
from django.db.models import Count
from rest_framework.exceptions import NotFound, ValidationError

from apps.schemas.field_security import serialize_data_payload
from apps.schemas.formulas import FormulaError, formula_dependencies
from apps.schemas.identity import (
    DISPLAY_TEMPLATE_RE,
    field_is_system_hidden,
    resolve_display_code_or_fallback,
    schema_identity_display_template,
    schema_identity_field_keys,
)
from apps.schemas.models import DataSchema
from apps.schemas.serializers import validation_issues
from apps.schemas.validation import FieldValidationError, validate_data_payload
from apps.temporal.models import Entity, TemporalRecord

from .models import ChangeEntry, ChangeSet

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DEFAULT_ENTRY_PAGE_SIZE = 80
MAX_ENTRY_PAGE_SIZE = 200
DRAFT_SUMMARY = "表格编辑草稿"
CHANGE_ACTIONS = (
    ChangeEntry.Action.CREATE,
    ChangeEntry.Action.UPDATE,
    ChangeEntry.Action.TERMINATE,
)


def list_changesets_payload(schema: DataSchema, query_params) -> dict[str, Any]:
    page = _parse_positive_int(query_params.get("page"), "page", default=1)
    page_size = _parse_positive_int(
        query_params.get("page_size"),
        "page_size",
        default=DEFAULT_PAGE_SIZE,
        maximum=MAX_PAGE_SIZE,
    )
    queryset = (
        ChangeSet.objects.filter(schema=schema)
        .select_related("created_by", "approver")
        .annotate(entry_count=Count("entries"))
        .order_by("-applied_at", "-created_at", "-id")
    )
    status_filter = query_params.get("status")
    if status_filter:
        if status_filter not in ChangeSet.Status.values:
            raise ValidationError({"status": "非法 ChangeSet 状态"})
        queryset = queryset.filter(status=status_filter)
    created_by = query_params.get("created_by")
    if created_by:
        queryset = queryset.filter(created_by_id=_parse_positive_int(created_by, "created_by", default=1))
    created_from = query_params.get("created_from")
    if created_from:
        queryset = queryset.filter(created_at__date__gte=_parse_date_param(created_from, "created_from"))
    created_to = query_params.get("created_to")
    if created_to:
        queryset = queryset.filter(created_at__date__lte=_parse_date_param(created_to, "created_to"))

    total = queryset.count()
    start = (page - 1) * page_size
    changesets = list(queryset[start : start + page_size])
    action_counts = _action_counts_by_changeset([item.id for item in changesets])
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": [
            _serialize_changeset_summary(item, action_counts.get(item.id, Counter()))
            for item in changesets
        ],
    }


def get_changeset_payload(
    schema: DataSchema,
    change_set_id: int,
    user: Any = None,
    query_params=None,
) -> dict[str, Any]:
    change_set = (
        ChangeSet.objects.select_related("created_by", "approver")
        .filter(schema=schema, pk=change_set_id)
        .first()
    )
    if change_set is None:
        raise NotFound("变更批次不存在")

    entries = change_set.entries.select_related("entity", "new_record").order_by(
        "valid_from", "entity__business_code", "id"
    )
    if _wants_paged_entries(query_params):
        return _get_changeset_paged_payload(change_set, schema, entries, query_params, user)

    return {
        **_serialize_changeset_summary(change_set, _action_counts(entries)),
        "entries": [_serialize_entry(entry, schema, user) for entry in entries],
    }


def compare_changesets_payload(schema: DataSchema, query_params) -> dict[str, Any]:
    left = _changeset_for_schema(schema, _parse_required_positive_int(query_params.get("left"), "left"))
    right = _changeset_for_schema(schema, _parse_required_positive_int(query_params.get("right"), "right"))
    left_entries = _changeset_entries(left)
    right_entries = _changeset_entries(right)
    left_counts = _action_counts(left_entries)
    right_counts = _action_counts(right_entries)
    return {
        "left": _serialize_changeset_summary(left, left_counts),
        "right": _serialize_changeset_summary(right, right_counts),
        "action_rows": _compare_action_rows(left_counts, right_counts),
        "field_rows": _compare_field_rows(schema, left_entries, right_entries),
        "entity_overlap": _compare_entity_overlap(left_entries, right_entries),
    }


def changeset_field_diffs_payload(
    schema: DataSchema,
    query_params,
    user: Any = None,
) -> dict[str, Any]:
    left = _changeset_for_schema(schema, _parse_required_positive_int(query_params.get("left"), "left"))
    right = _changeset_for_schema(schema, _parse_required_positive_int(query_params.get("right"), "right"))
    page = _parse_positive_int(query_params.get("page"), "page", default=1)
    page_size = _parse_positive_int(
        query_params.get("page_size"),
        "page_size",
        default=DEFAULT_ENTRY_PAGE_SIZE,
        maximum=MAX_ENTRY_PAGE_SIZE,
    )

    left_entries = _changeset_entries(left)
    right_entries = _changeset_entries(right)
    left_counts = _action_counts(left_entries)
    right_counts = _action_counts(right_entries)

    descriptors = [
        *_field_diff_descriptors_for_side(schema, left_entries, "left", user),
        *_field_diff_descriptors_for_side(schema, right_entries, "right", user),
    ]
    descriptors = _sorted_field_diff_descriptors(descriptors)
    total = len(descriptors)
    start = (page - 1) * page_size
    paged_rows = _serialize_field_diff_rows(
        descriptors[start : start + page_size],
        schema,
        user,
    )
    return {
        "diff_mode": "changeset",
        "left": _serialize_changeset_summary(left, left_counts),
        "right": _serialize_changeset_summary(right, right_counts),
        "summary": _field_diff_summary(descriptors),
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": paged_rows,
    }


def build_draft_overlay_payload(schema: DataSchema, query_params, user: Any) -> dict[str, Any]:
    at = _parse_date(query_params.get("at"))
    drafts = list(
        ChangeSet.objects.filter(
            schema=schema,
            status=ChangeSet.Status.DRAFT,
            created_by=user,
            entries__valid_from=at,
        )
        .select_related("created_by", "approver")
        .distinct()
        .order_by("created_at", "id")
    )
    entries = list(
        ChangeEntry.objects.filter(change_set__in=drafts, valid_from=at)
        .select_related("change_set", "entity")
        .order_by("change_set__created_at", "change_set_id", "id")
    )
    action_counts = _action_counts_by_changeset([draft.id for draft in drafts])
    cells: list[dict[str, Any]] = []
    create_rows: list[dict[str, Any]] = []
    for entry in entries:
        serialized = _serialize_entry(entry, schema, user)
        if entry.action == ChangeEntry.Action.CREATE:
            create_rows.append(_draft_create_row(entry, serialized, schema))
        if entry.action == ChangeEntry.Action.TERMINATE or serialized["data_after"] is None:
            continue
        for field_key in _overlay_field_keys(schema, entry, serialized):
            cells.append(
                {
                    "key": _draft_cell_key(at, entry.entity_id, field_key),
                    "entity_id": entry.entity_id,
                    "field_key": field_key,
                    "value": serialized["data_after"][field_key],
                    "status": "draft",
                    "change_set_id": entry.change_set_id,
                    "entry_id": entry.id,
                }
            )
    return {
        "at": at.isoformat(),
        "cells": cells,
        "create_rows": create_rows,
        "change_sets": [
            _serialize_changeset_summary(draft, action_counts.get(draft.id, Counter()))
            for draft in drafts
        ],
    }


def save_cell_edit(schema: DataSchema, entity_id: int, user: Any, payload: dict) -> dict[str, Any]:
    field_key = _field_key(payload)
    field = _editable_field(schema, field_key)
    at = _parse_date(payload.get("at"))
    value = payload.get("value")

    with transaction.atomic():
        entity = _lock_entity(schema, entity_id)
        current = _current_record(entity, at)
        draft = _get_or_create_edit_draft(schema, user)
        existing = _draft_update_entry(draft, entity, at)
        data_after = copy.deepcopy(
            existing.data_after if existing is not None else current.data_payload
        )
        data_after[field["key"]] = value
        _validate_payload(schema, data_after)

        entry = _upsert_update_entry(draft, entity, current, data_after, at, existing)
        return {
            **_serialize_changeset_summary(draft, Counter({entry.action: 1})),
            "entry": _serialize_entry(entry, schema, user),
        }


def _serialize_changeset_summary(change_set: ChangeSet, action_counts: Counter) -> dict[str, Any]:
    return {
        "id": change_set.id,
        "schema_id": change_set.schema_id,
        "summary": change_set.summary,
        "status": change_set.status,
        "source": change_set.source,
        "approval_required": change_set.approval_required,
        "approver_id": change_set.approver_id,
        "approver_username": change_set.approver.username if change_set.approver else None,
        "created_at": change_set.created_at.isoformat(),
        "created_by_id": change_set.created_by_id,
        "created_by_username": change_set.created_by.username,
        "applied_at": change_set.applied_at.isoformat() if change_set.applied_at else None,
        "revert_of_id": change_set.revert_of_id,
        "entry_count": sum(action_counts.values()),
        "action_counts": {
            ChangeEntry.Action.CREATE: action_counts.get(ChangeEntry.Action.CREATE, 0),
            ChangeEntry.Action.UPDATE: action_counts.get(ChangeEntry.Action.UPDATE, 0),
            ChangeEntry.Action.TERMINATE: action_counts.get(ChangeEntry.Action.TERMINATE, 0),
        },
    }


def _serialize_entry(
    entry: ChangeEntry,
    schema: DataSchema | None = None,
    user: Any = None,
) -> dict[str, Any]:
    data_before = entry.data_before
    data_after = entry.data_after
    if schema is not None:
        data_before = (
            serialize_data_payload(schema, schema.fields_config, entry.data_before, user)
            if entry.data_before is not None
            else None
        )
        data_after = (
            serialize_data_payload(schema, schema.fields_config, entry.data_after, user)
            if entry.data_after is not None
            else None
        )
    display_payload = data_after if data_after is not None else data_before
    display_code = (
        resolve_display_code_or_fallback(schema, display_payload or {}, entry.entity.business_code)
        if schema is not None
        else entry.entity.business_code
    )
    return {
        "id": entry.id,
        "entity_id": entry.entity_id,
        "business_code": entry.entity.business_code,
        "display_code": display_code,
        "action": entry.action,
        "data_before": data_before,
        "data_after": data_after,
        "changed_fields": _changed_fields(entry),
        "valid_from": entry.valid_from.isoformat(),
        "valid_to": entry.valid_to.isoformat() if entry.valid_to else None,
        "new_record_id": entry.new_record_id,
    }


def _action_counts_by_changeset(change_set_ids: list[int]) -> dict[int, Counter]:
    counters: dict[int, Counter] = {}
    if not change_set_ids:
        return counters
    rows = (
        ChangeEntry.objects.filter(change_set_id__in=change_set_ids)
        .values("change_set_id", "action")
        .annotate(total=Count("id"))
    )
    for row in rows:
        counters.setdefault(row["change_set_id"], Counter())[row["action"]] = row["total"]
    return counters


def _action_counts(entries) -> Counter:
    return Counter(entry.action for entry in entries)


def _changeset_for_schema(schema: DataSchema, change_set_id: int) -> ChangeSet:
    change_set = (
        ChangeSet.objects.select_related("created_by", "approver")
        .filter(schema=schema, pk=change_set_id)
        .first()
    )
    if change_set is None:
        raise NotFound("变更批次不存在")
    return change_set


def _changeset_entries(change_set: ChangeSet) -> list[ChangeEntry]:
    return list(
        change_set.entries.select_related("change_set", "entity", "new_record").order_by(
            "valid_from", "entity__business_code", "id"
        )
    )


def _compare_action_rows(left_counts: Counter, right_counts: Counter) -> list[dict[str, Any]]:
    return [
        {
            "action": action,
            "left": left_counts.get(action, 0),
            "right": right_counts.get(action, 0),
            "delta": right_counts.get(action, 0) - left_counts.get(action, 0),
        }
        for action in CHANGE_ACTIONS
    ]


def _compare_field_rows(
    schema: DataSchema,
    left_entries: list[ChangeEntry],
    right_entries: list[ChangeEntry],
) -> list[dict[str, Any]]:
    left_fields = {item["key"]: item for item in _field_aggregates(schema, left_entries)}
    right_fields = {item["key"]: item for item in _field_aggregates(schema, right_entries)}
    rows = [
        _compare_field_row(key, left_fields.get(key), right_fields.get(key))
        for key in set(left_fields) | set(right_fields)
    ]
    return sorted(
        rows,
        key=lambda item: (-abs(item["delta"]), -item["right_changes"], item["label"]),
    )


def _compare_field_row(
    key: str,
    left: dict[str, Any] | None,
    right: dict[str, Any] | None,
) -> dict[str, Any]:
    left_changes = left["change_count"] if left else 0
    right_changes = right["change_count"] if right else 0
    return {
        "key": key,
        "label": (left or right or {}).get("label") or key,
        "left_changes": left_changes,
        "right_changes": right_changes,
        "left_entities": left["entity_count"] if left else 0,
        "right_entities": right["entity_count"] if right else 0,
        "delta": right_changes - left_changes,
    }


def _compare_entity_overlap(
    left_entries: list[ChangeEntry],
    right_entries: list[ChangeEntry],
) -> dict[str, int]:
    left_ids = {entry.entity_id for entry in left_entries}
    right_ids = {entry.entity_id for entry in right_entries}
    shared_count = len(left_ids & right_ids)
    return {
        "left_entity_count": len(left_ids),
        "right_entity_count": len(right_ids),
        "shared_entity_count": shared_count,
        "left_only_entity_count": len(left_ids - right_ids),
        "right_only_entity_count": len(right_ids - left_ids),
    }


def _field_diff_descriptors_for_side(
    schema: DataSchema,
    entries: list[ChangeEntry],
    side: str,
    user: Any = None,
) -> list[dict[str, Any]]:
    fields = _visible_field_map(schema)
    rows: list[dict[str, Any]] = []
    for entry in entries:
        sort_display_code = _canonical_sort_display_code(schema, entry, user)
        for field_key in _changed_fields(entry):
            field = fields.get(field_key)
            if field is None:
                continue
            rows.append(
                {
                    "entry": entry,
                    "side": side,
                    "entity_id": entry.entity_id,
                    "business_code": entry.entity.business_code,
                    "display_code": sort_display_code,
                    "field_key": field_key,
                    "field_label": field.get("label") or field_key,
                    "action": entry.action,
                    "entry_id": entry.id,
                    "change_set_id": entry.change_set_id,
                    "recorded_at": entry.change_set.created_at.isoformat(),
                    "valid_from": entry.valid_from.isoformat(),
                }
            )
    return rows


def _field_diff_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts_by_field = Counter(row["field_key"] for row in rows)
    label_by_field = {row["field_key"]: row["field_label"] for row in rows}
    top_fields = sorted(
        counts_by_field,
        key=lambda key: (-counts_by_field[key], str(label_by_field.get(key) or key)),
    )[:8]
    action_counts = {action: 0 for action in CHANGE_ACTIONS}
    for row in rows:
        action_counts[row["action"]] += 1
    return {
        "diff_count": len(rows),
        "affected_entity_count": len({row["entity_id"] for row in rows}),
        "top_fields": [
            {
                "key": key,
                "label": label_by_field.get(key) or key,
                "count": counts_by_field[key],
            }
            for key in top_fields
        ],
        "action_counts": action_counts,
    }


def _sorted_field_diff_descriptors(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (
            str(row["display_code"]),
            str(row["field_label"]),
            str(row["side"]),
            int(row["entry_id"]),
        ),
    )


def _serialize_field_diff_rows(
    descriptors: list[dict[str, Any]],
    schema: DataSchema,
    user: Any = None,
) -> list[dict[str, Any]]:
    serialized_entry_cache: dict[int, dict[str, Any]] = {}
    results: list[dict[str, Any]] = []
    for descriptor in descriptors:
        entry = descriptor["entry"]
        serialized = serialized_entry_cache.get(entry.id)
        if serialized is None:
            serialized = _serialize_entry(entry, schema, user)
            serialized_entry_cache[entry.id] = serialized
        data_before = serialized["data_before"] if isinstance(serialized["data_before"], dict) else {}
        data_after = serialized["data_after"] if isinstance(serialized["data_after"], dict) else {}
        field_key = descriptor["field_key"]
        results.append(
            {
                "id": f"{descriptor['side']}:{descriptor['change_set_id']}:{descriptor['entry_id']}:{field_key}",
                "side": descriptor["side"],
                "entity": {
                    "id": descriptor["entity_id"],
                    "business_code": descriptor["business_code"],
                    "display_code": serialized["display_code"],
                },
                "field": {"key": field_key, "label": descriptor["field_label"]},
                "before": data_before.get(field_key),
                "after": data_after.get(field_key),
                "action": descriptor["action"],
                "entry_id": descriptor["entry_id"],
                "change_set_id": descriptor["change_set_id"],
                "recorded_at": descriptor["recorded_at"],
                "valid_from": descriptor["valid_from"],
            }
        )
    return results


def _canonical_sort_display_code(
    schema: DataSchema,
    entry: ChangeEntry,
    user: Any = None,
) -> str:
    raw_before = entry.data_before if isinstance(entry.data_before, dict) else {}
    raw_after = entry.data_after if isinstance(entry.data_after, dict) else {}
    display_payload = raw_after if raw_after else raw_before
    display_keys = _display_sort_keys(schema)
    projected_payload = {key: display_payload[key] for key in display_keys if key in display_payload}
    rendered_projected_payload = serialize_data_payload(
        schema,
        schema.fields_config,
        projected_payload,
        user,
    )
    return resolve_display_code_or_fallback(
        schema,
        rendered_projected_payload,
        entry.entity.business_code,
    )


def _display_sort_keys(schema: DataSchema) -> set[str]:
    template = schema_identity_display_template(schema)
    if template:
        keys: set[str] = set(DISPLAY_TEMPLATE_RE.findall(template))
    else:
        keys = set(schema_identity_field_keys(schema))
    fields_by_key = {
        field["key"]: field
        for field in schema.fields_config
        if isinstance(field.get("key"), str)
    }
    queue = list(keys)
    while queue:
        key = queue.pop()
        field = fields_by_key.get(key)
        if field is None or field.get("type") != "formula":
            continue
        validators = field.get("validators") if isinstance(field.get("validators"), dict) else {}
        expression = validators.get("expression")
        if not isinstance(expression, str):
            continue
        try:
            dependencies = formula_dependencies(expression)
        except FormulaError:
            continue
        for dependency in dependencies:
            if dependency not in keys:
                keys.add(dependency)
                queue.append(dependency)
    return keys


def _get_changeset_paged_payload(
    change_set: ChangeSet,
    schema: DataSchema,
    entries,
    query_params,
    user: Any = None,
) -> dict[str, Any]:
    page = _parse_positive_int(query_params.get("entries_page"), "entries_page", default=1)
    page_size = _parse_positive_int(
        query_params.get("entries_page_size"),
        "entries_page_size",
        default=DEFAULT_ENTRY_PAGE_SIZE,
        maximum=MAX_ENTRY_PAGE_SIZE,
    )
    total = entries.count()
    start = (page - 1) * page_size
    page_entries = list(entries[start : start + page_size])
    all_entries = list(entries)
    action_counts = _action_counts(all_entries)
    return {
        **_serialize_changeset_summary(change_set, action_counts),
        "field_aggregates": _field_aggregates(schema, all_entries),
        "entries_page": {
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": math.ceil(total / page_size) if total else 0,
            "results": [
                _serialize_paged_entry(entry, schema, user) for entry in page_entries
            ],
        },
    }


def _wants_paged_entries(query_params) -> bool:
    if query_params is None:
        return False
    return "entries_page" in query_params or "entries_page_size" in query_params


def _field_aggregates(schema: DataSchema, entries: list[ChangeEntry]) -> list[dict[str, Any]]:
    fields = _visible_field_map(schema)
    aggregate_map: dict[str, dict[str, Any]] = {}
    for entry in entries:
        for field_key in _changed_fields(entry):
            field = fields.get(field_key)
            if field is None:
                continue
            item = aggregate_map.setdefault(
                field_key,
                {
                    "key": field_key,
                    "label": field.get("label") or field_key,
                    "change_count": 0,
                    "entity_ids": set(),
                    "action_counts": {
                        ChangeEntry.Action.CREATE: 0,
                        ChangeEntry.Action.UPDATE: 0,
                        ChangeEntry.Action.TERMINATE: 0,
                    },
                },
            )
            item["change_count"] += 1
            item["entity_ids"].add(entry.entity_id)
            item["action_counts"][entry.action] += 1
    return [
        {
            "key": item["key"],
            "label": item["label"],
            "change_count": item["change_count"],
            "entity_count": len(item["entity_ids"]),
            "action_counts": item["action_counts"],
        }
        for item in sorted(
            aggregate_map.values(),
            key=lambda field: (
                -field["change_count"],
                -len(field["entity_ids"]),
                str(field["label"]),
            ),
        )
    ]


def _serialize_paged_entry(
    entry: ChangeEntry,
    schema: DataSchema,
    user: Any = None,
) -> dict[str, Any]:
    serialized = _serialize_entry(entry, schema, user)
    visible_keys = set(_visible_field_map(schema))
    serialized["changed_fields"] = [
        field_key for field_key in serialized["changed_fields"] if field_key in visible_keys
    ]
    for payload_key in ("data_before", "data_after"):
        payload = serialized[payload_key]
        if isinstance(payload, dict):
            serialized[payload_key] = {
                key: value for key, value in payload.items() if key in visible_keys
            }
    return serialized


def _visible_field_map(schema: DataSchema) -> dict[str, dict[str, Any]]:
    return {
        field["key"]: field
        for field in schema.fields_config
        if isinstance(field.get("key"), str) and not field_is_system_hidden(field)
    }


def _changed_fields(entry: ChangeEntry) -> list[str]:
    before = entry.data_before or {}
    after = entry.data_after or {}
    keys = sorted(set(before) | set(after))
    return [key for key in keys if before.get(key) != after.get(key)]


def _draft_cell_key(at: dt.date, entity_id: int, field_key: str) -> str:
    return f"{at.isoformat()}:{entity_id}:{field_key}"


def _draft_create_row(
    entry: ChangeEntry,
    serialized_entry: dict[str, Any],
    schema: DataSchema,
) -> dict[str, Any]:
    data_after = serialized_entry["data_after"] or {}
    return {
        "record_id": -(entry.new_record_id or entry.id),
        "entity_id": entry.entity_id,
        "business_code": serialized_entry["business_code"],
        "display_code": serialized_entry["display_code"],
        "data_payload": data_after,
        "row_status": "new",
        "changed_fields": _visible_payload_keys(schema, data_after),
        "valid_from": serialized_entry["valid_from"],
        "valid_to": serialized_entry["valid_to"],
        "schema_version": schema.current_version,
        "change_set_id": entry.change_set_id,
        "recorded_by_id": entry.change_set.created_by_id,
        "recorded_at": entry.change_set.created_at.isoformat(),
    }


def _overlay_field_keys(
    schema: DataSchema,
    entry: ChangeEntry,
    serialized_entry: dict[str, Any],
) -> list[str]:
    data_after = serialized_entry["data_after"] or {}
    raw_fields = (
        _changed_fields(entry)
        if entry.action != ChangeEntry.Action.CREATE
        else list((entry.data_after or {}).keys())
    )
    visible_fields = set(_visible_payload_keys(schema, data_after))
    return [field for field in raw_fields if field in data_after and field in visible_fields]


def _visible_payload_keys(schema: DataSchema, payload: dict[str, Any]) -> list[str]:
    return [
        field["key"]
        for field in schema.fields_config
        if isinstance(field.get("key"), str)
        and field["key"] in payload
        and not field_is_system_hidden(field)
    ]


def _field_key(payload: dict) -> str:
    value = payload.get("field_key")
    if not isinstance(value, str) or not value:
        raise ValidationError({"field_key": "必填"})
    return value


def _editable_field(schema: DataSchema, field_key: str) -> dict[str, Any]:
    if field_key == schema.identity_field_key or field_key in schema_identity_field_keys(schema):
        raise ValidationError({"field_key": "实体标识字段暂不可在表格内编辑"})
    for field in schema.fields_config:
        if (
            field.get("key") == field_key
            and not field.get("deprecated", False)
            and not field_is_system_hidden(field)
        ):
            return field
    raise ValidationError({"field_key": "字段不存在或已废弃"})


def _parse_date(value: str | None) -> dt.date:
    if not value:
        raise ValidationError({"at": "必填"})
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({"at": "日期格式必须是 YYYY-MM-DD"}) from exc


def _parse_positive_int(
    value: str | None,
    field: str,
    *,
    default: int,
    maximum: int | None = None,
) -> int:
    if not value:
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValidationError({field: "必须是正整数"}) from exc
    if parsed < 1:
        raise ValidationError({field: "必须是正整数"})
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def _parse_required_positive_int(value: str | None, field: str) -> int:
    if not value:
        raise ValidationError({field: "必填"})
    return _parse_positive_int(value, field, default=1)


def _parse_date_param(value: str, field: str) -> dt.date:
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({field: "日期格式必须是 YYYY-MM-DD"}) from exc


def _lock_entity(schema: DataSchema, entity_id: int) -> Entity:
    entity = Entity.objects.select_for_update().filter(schema=schema, pk=entity_id).first()
    if entity is None:
        raise NotFound("实体不存在")
    return entity


def _current_record(entity: Entity, at: dt.date) -> TemporalRecord:
    record = (
        TemporalRecord.objects.select_for_update()
        .filter(entity=entity, is_superseded=False, valid_from__lte=at)
        .filter(valid_to__isnull=True)
        .order_by("-valid_from", "-id")
        .first()
    )
    if record is not None:
        return record
    record = (
        TemporalRecord.objects.select_for_update()
        .filter(entity=entity, is_superseded=False, valid_from__lte=at, valid_to__gt=at)
        .order_by("-valid_from", "-id")
        .first()
    )
    if record is None:
        raise ValidationError({"entity_id": "当前时间点没有可编辑记录"})
    return record


def _validate_payload(schema: DataSchema, data_after: dict[str, Any]) -> None:
    try:
        validate_data_payload(schema.fields_config, data_after)
    except FieldValidationError as exc:
        raise ValidationError({"data_payload": validation_issues(exc)}) from exc


def _get_or_create_edit_draft(schema: DataSchema, user: Any) -> ChangeSet:
    draft = (
        ChangeSet.objects.select_for_update()
        .filter(
            schema=schema,
            created_by=user,
            status=ChangeSet.Status.DRAFT,
            source=ChangeSet.Source.MANUAL,
            summary=DRAFT_SUMMARY,
        )
        .order_by("-created_at", "-id")
        .first()
    )
    if draft is not None:
        return draft
    return ChangeSet.objects.create(
        schema=schema,
        summary=DRAFT_SUMMARY,
        status=ChangeSet.Status.DRAFT,
        approval_required=schema.approval_required,
        created_by=user,
        source=ChangeSet.Source.MANUAL,
    )


def _upsert_update_entry(
    draft: ChangeSet,
    entity: Entity,
    current: TemporalRecord,
    data_after: dict[str, Any],
    at: dt.date,
    entry: ChangeEntry | None = None,
) -> ChangeEntry:
    if entry is None:
        return ChangeEntry.objects.create(
            change_set=draft,
            entity=entity,
            action=ChangeEntry.Action.UPDATE,
            data_before=copy.deepcopy(current.data_payload),
            data_after=data_after,
            valid_from=at,
            valid_to=current.valid_to,
        )
    entry.data_after = data_after
    entry.valid_to = current.valid_to
    entry.save(update_fields=["data_after", "valid_to"])
    return entry


def _draft_update_entry(draft: ChangeSet, entity: Entity, at: dt.date) -> ChangeEntry | None:
    return (
        ChangeEntry.objects.select_for_update()
        .filter(
            change_set=draft,
            entity=entity,
            action=ChangeEntry.Action.UPDATE,
            valid_from=at,
        )
        .first()
    )
