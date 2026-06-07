from __future__ import annotations

import datetime as dt
import json
import math
import re
from collections import Counter
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.changesets.models import ChangeEntry
from apps.schemas.field_security import ordering_field_is_allowed, serialize_data_payload
from apps.schemas.formulas import FormulaError, formula_dependencies
from apps.schemas.identity import (
    DISPLAY_TEMPLATE_RE,
    field_is_system_hidden,
    resolve_display_code_or_fallback,
    schema_identity_display_template,
    schema_identity_field_keys,
)
from apps.schemas.models import DataSchema

from .filters import apply_current_view_filters, current_view_has_filters
from .models import Entity, FieldFileAsset
from .queries import (
    CurrentViewRecord,
    TimelineRecord,
    current_view_ordering_can_push_down,
    get_current_record_location,
    get_current_view,
    get_current_view_page,
    get_entity_timeline,
)

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
ATTACHMENT_SEARCH_TEXT_MAX_CHARS = 20_000
SEARCH_SNIPPET_RADIUS = 32
MARKDOWN_LINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]+\)")
MARKDOWN_AUTOLINK_RE = re.compile(r"<(?:https?://|mailto:)[^>]+>", re.IGNORECASE)
MARKDOWN_HTML_RE = re.compile(r"<[^>]+>")
MARKDOWN_FENCE_RE = re.compile(r"```[a-zA-Z0-9_-]*|```")
MARKDOWN_PREFIX_RE = re.compile(r"^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)", re.MULTILINE)
SNAPSHOT_MISSING = object()


@dataclass(frozen=True)
class CurrentViewRequest:
    at: dt.date
    retro: bool
    keyword: str
    include_attachment_text: bool
    page: int
    page_size: int
    ordering: str


@dataclass(frozen=True)
class SnapshotDiffRequest:
    left_at: dt.date
    right_at: dt.date
    retro: bool
    keyword: str
    page: int
    page_size: int
    ordering: str
    mode: str


def build_current_view_payload(schema: DataSchema, query_params, user: Any = None) -> dict[str, Any]:
    request = _parse_current_view_request(query_params)
    view, page_records, total = _resolve_current_view_page(schema, query_params, request, user)
    record_meta = _record_meta_by_id([record.record_id for record in page_records])
    search_matches = _current_view_search_matches(
        page_records, request, schema, view.fields_config, user
    )

    return {
        "schema_id": view.schema_id,
        "at": view.at.isoformat(),
        "retro": request.retro,
        "schema_version": view.schema_version,
        "fields_config": view.fields_config,
        "count": total,
        "page": request.page,
        "page_size": request.page_size,
        "total_pages": math.ceil(total / request.page_size) if total else 0,
        "results": [
            _serialize_record(
                record,
                record_meta.get(record.record_id),
                schema,
                view.fields_config,
                user,
                search_matches=search_matches.get(record.record_id),
            )
            for record in page_records
        ],
    }


def build_current_view_location_payload(
    schema: DataSchema, query_params, user: Any = None
) -> dict[str, Any]:
    request = _parse_current_view_request(query_params)
    entity_id = _parse_required_positive_int(query_params.get("entity_id"), "entity_id")
    base = {
        "schema_id": schema.id,
        "at": request.at.isoformat(),
        "retro": request.retro,
        "entity_id": entity_id,
        "ordering": request.ordering,
        "page_size": request.page_size,
    }
    unsupported_reason = _current_view_locate_unsupported_reason(query_params, request)
    if unsupported_reason:
        return {**base, "supported": False, "reason": unsupported_reason}

    location = get_current_record_location(
        schema,
        request.at,
        ordering=request.ordering,
        entity_id=entity_id,
    )
    if location.record_id is None or location.position is None:
        return {
            **base,
            "supported": True,
            "found": False,
            "reason": "entity_not_in_current_view",
            "count": location.count,
        }

    offset = location.position - 1
    return {
        **base,
        "record_id": location.record_id,
        "supported": True,
        "found": True,
        "page": offset // request.page_size + 1,
        "offset": offset,
        "position": location.position,
        "count": location.count,
    }


def build_snapshot_diff_payload(
    schema: DataSchema, query_params, user: Any = None
) -> dict[str, Any]:
    request = _parse_snapshot_diff_request(query_params)
    left_view, left_records, _ = resolve_current_view(
        schema,
        _snapshot_query_params(query_params, request.left_at, request.ordering),
        user=user,
    )
    right_view, right_records, _ = resolve_current_view(
        schema,
        _snapshot_query_params(query_params, request.right_at, request.ordering),
        user=user,
    )
    rows = _build_snapshot_diff_rows(
        schema,
        left_view.fields_config,
        left_records,
        right_view.fields_config,
        right_records,
        request.ordering,
        user,
    )
    rows = _sort_snapshot_diff_rows(rows, request.ordering)
    total = len(rows)
    start = (request.page - 1) * request.page_size
    page_rows = rows[start : start + request.page_size]
    return {
        "diff_mode": "snapshot",
        "scope": {
            "left_at": request.left_at.isoformat(),
            "right_at": request.right_at.isoformat(),
            "retro": request.retro,
            "search": query_params.get("search", ""),
            "ordering": request.ordering,
            "mode": request.mode,
        },
        "summary": _snapshot_diff_summary(rows, len(left_records), len(right_records)),
        "count": total,
        "page": request.page,
        "page_size": request.page_size,
        "total_pages": math.ceil(total / request.page_size) if total else 0,
        "results": [
            _serialize_snapshot_diff_row(
                schema,
                row,
                left_view.fields_config,
                right_view.fields_config,
                user,
            )
            for row in page_rows
        ],
    }


def _parse_current_view_request(query_params) -> CurrentViewRequest:
    return CurrentViewRequest(
        at=_parse_date(query_params.get("at")),
        retro=_parse_bool(query_params.get("retro")),
        keyword=_normalized_keyword(query_params.get("search", "")),
        include_attachment_text=_parse_bool(
            query_params.get("include_attachment_text"),
            "include_attachment_text",
        ),
        page=_parse_positive_int(query_params.get("page"), "page", default=1),
        page_size=_parse_positive_int(
            query_params.get("page_size"),
            "page_size",
            default=DEFAULT_PAGE_SIZE,
            maximum=MAX_PAGE_SIZE,
        ),
        ordering=query_params.get("ordering", "business_code"),
    )


def _parse_snapshot_diff_request(query_params) -> SnapshotDiffRequest:
    dates = _parse_snapshot_diff_dates(query_params)
    mode = query_params.get("mode", "summary")
    if mode not in {"summary", "entities", "fields"}:
        raise ValidationError({"mode": "unsupported mode"})
    return SnapshotDiffRequest(
        left_at=dates["left_at"],
        right_at=dates["right_at"],
        retro=_parse_bool(query_params.get("retro")),
        keyword=_normalized_keyword(query_params.get("search", "")),
        page=_parse_positive_int(query_params.get("page"), "page", default=1),
        page_size=_parse_positive_int(
            query_params.get("page_size"),
            "page_size",
            default=DEFAULT_PAGE_SIZE,
            maximum=MAX_PAGE_SIZE,
        ),
        ordering=query_params.get("ordering", "business_code"),
        mode=mode,
    )


def _parse_snapshot_diff_dates(query_params) -> dict[str, dt.date]:
    parsed: dict[str, dt.date] = {}
    errors: dict[str, str] = {}
    for field in ("left_at", "right_at"):
        value = query_params.get(field)
        if not value:
            errors[field] = "required"
            continue
        try:
            parsed[field] = dt.date.fromisoformat(value)
        except ValueError:
            errors[field] = "must be YYYY-MM-DD"
    if errors:
        raise ValidationError(errors)
    return parsed


def _snapshot_query_params(query_params, at: dt.date, ordering: str):
    params = query_params.copy() if hasattr(query_params, "copy") else dict(query_params)
    params["at"] = at.isoformat()
    params["ordering"] = _snapshot_current_view_ordering(ordering)
    return params


def _snapshot_current_view_ordering(ordering: str) -> str:
    descending = ordering.startswith("-")
    field = ordering[1:] if descending else ordering
    if field == "display_code":
        return "-business_code" if descending else "business_code"
    return ordering


def _build_snapshot_diff_rows(
    schema: DataSchema,
    left_fields_config: list[dict[str, Any]],
    left_records: list[CurrentViewRecord],
    right_fields_config: list[dict[str, Any]],
    right_records: list[CurrentViewRecord],
    ordering: str,
    user: Any,
) -> list[dict[str, Any]]:
    fields = _snapshot_visible_field_map(left_fields_config, right_fields_config)
    left_by_entity = {record.entity_id: record for record in left_records}
    right_by_entity = {record.entity_id: record for record in right_records}
    left_raw_payloads, left_ranks = _snapshot_record_maps(left_records)
    right_raw_payloads, right_ranks = _snapshot_record_maps(right_records)
    ordering_field = _snapshot_ordering_field(ordering)
    display_payload_keys = (
        _snapshot_display_payload_keys(schema) if ordering_field == "display_code" else set()
    )

    rows: list[dict[str, Any]] = []
    for entity_id in sorted(set(left_by_entity) | set(right_by_entity)):
        left_record = left_by_entity.get(entity_id)
        right_record = right_by_entity.get(entity_id)
        business_code = (
            right_record.business_code
            if right_record is not None
            else left_record.business_code
            if left_record is not None
            else None
        )
        sort_rank = right_ranks.get(entity_id)
        if sort_rank is None:
            sort_rank = left_ranks.get(entity_id, len(left_ranks) + len(right_ranks))
        left_raw_payload = (
            left_raw_payloads.get(entity_id, {}) if left_record is not None else None
        )
        right_raw_payload = (
            right_raw_payloads.get(entity_id, {}) if right_record is not None else None
        )
        sort_display_code = business_code or ""
        if ordering_field == "display_code":
            sort_display_code = _snapshot_sort_display_code(
                schema,
                left_fields_config,
                left_raw_payload,
                right_fields_config,
                right_raw_payload,
                display_payload_keys,
                business_code or "",
                user,
            )
        for field_key, field in fields.items():
            raw_before_value = (
                left_raw_payload.get(field_key, SNAPSHOT_MISSING)
                if left_record is not None
                else SNAPSHOT_MISSING
            )
            raw_after_value = (
                right_raw_payload.get(field_key, SNAPSHOT_MISSING)
                if right_record is not None
                else SNAPSHOT_MISSING
            )
            action = _snapshot_field_action(
                raw_before_value,
                raw_after_value,
            )
            if action is None:
                continue
            rows.append(
                {
                    "entity_id": entity_id,
                    "business_code": business_code or "",
                    "field_key": field_key,
                    "field_label": str(field.get("label") or field_key),
                    "action": action,
                    "left_record_id": left_record.record_id if left_record is not None else None,
                    "right_record_id": right_record.record_id if right_record is not None else None,
                    "left_change_set_id": (
                        left_record.change_set_id if left_record is not None else None
                    ),
                    "right_change_set_id": (
                        right_record.change_set_id if right_record is not None else None
                    ),
                    "recorded_at": (
                        right_record.recorded_at.isoformat()
                        if right_record is not None
                        else left_record.recorded_at.isoformat()
                        if left_record is not None
                        else None
                    ),
                    "sort_rank": sort_rank,
                    "sort_display_code": sort_display_code,
                    "left_raw_payload": left_raw_payload,
                    "right_raw_payload": right_raw_payload,
                }
            )
    return rows


def _snapshot_visible_field_map(
    *fields_configs: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    visible: dict[str, dict[str, Any]] = {}
    for fields_config in fields_configs:
        for field in fields_config:
            key = field.get("key")
            if isinstance(key, str) and not field_is_system_hidden(field):
                visible[key] = field
    return visible


def _snapshot_record_maps(
    records: list[CurrentViewRecord],
) -> tuple[dict[int, dict[str, Any]], dict[int, int]]:
    raw_payloads: dict[int, dict[str, Any]] = {}
    ranks: dict[int, int] = {}
    for index, record in enumerate(records):
        raw_payloads[record.entity_id] = (
            record.data_payload if isinstance(record.data_payload, dict) else {}
        )
        ranks[record.entity_id] = index
    return raw_payloads, ranks


def _snapshot_field_action(
    before_value: Any,
    after_value: Any,
) -> str | None:
    if before_value is SNAPSHOT_MISSING and after_value is not SNAPSHOT_MISSING:
        return ChangeEntry.Action.CREATE
    if before_value is not SNAPSHOT_MISSING and after_value is SNAPSHOT_MISSING:
        return ChangeEntry.Action.TERMINATE
    if before_value != after_value:
        return ChangeEntry.Action.UPDATE
    return None


def _sort_snapshot_diff_rows(
    rows: list[dict[str, Any]],
    ordering: str,
) -> list[dict[str, Any]]:
    rows = sorted(rows, key=lambda row: f"snapshot:{row['entity_id']}:{row['field_key']}")
    rows = sorted(rows, key=lambda row: str(row["action"]))
    rows = sorted(rows, key=lambda row: str(row["field_label"]))
    rows = sorted(rows, key=lambda row: str(row["sort_display_code"]))
    rows = sorted(rows, key=lambda row: str(row["business_code"]))

    descending = ordering.startswith("-")
    field = _snapshot_ordering_field(ordering)
    if field == "display_code":
        return sorted(rows, key=lambda row: str(row["sort_display_code"]), reverse=descending)
    if field == "business_code":
        return sorted(rows, key=lambda row: str(row["business_code"]), reverse=descending)
    return sorted(rows, key=lambda row: int(row["sort_rank"]))


def _snapshot_diff_summary(
    rows: list[dict[str, Any]],
    left_count: int,
    right_count: int,
) -> dict[str, Any]:
    counts_by_field = Counter(row["field_key"] for row in rows)
    label_by_field = {row["field_key"]: row["field_label"] for row in rows}
    top_fields = sorted(
        counts_by_field,
        key=lambda key: (-counts_by_field[key], str(label_by_field.get(key) or key)),
    )[:8]
    action_counts = {action: 0 for action in _snapshot_diff_actions()}
    for row in rows:
        action_counts[row["action"]] += 1
    return {
        "diff_count": len(rows),
        "affected_entity_count": len({row["entity_id"] for row in rows}),
        "left_count": left_count,
        "right_count": right_count,
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


def _snapshot_diff_actions() -> tuple[str, str, str]:
    return (
        ChangeEntry.Action.CREATE,
        ChangeEntry.Action.UPDATE,
        ChangeEntry.Action.TERMINATE,
    )


def _snapshot_ordering_field(ordering: str) -> str:
    return ordering[1:] if ordering.startswith("-") else ordering


def _snapshot_display_payload_keys(schema: DataSchema) -> set[str]:
    template = schema_identity_display_template(schema)
    keys = (
        set(DISPLAY_TEMPLATE_RE.findall(template))
        if template
        else set(schema_identity_field_keys(schema))
    )
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


def _snapshot_sort_display_code(
    schema: DataSchema,
    left_fields_config: list[dict[str, Any]],
    left_raw_payload: dict[str, Any] | None,
    right_fields_config: list[dict[str, Any]],
    right_raw_payload: dict[str, Any] | None,
    display_payload_keys: set[str],
    business_code: str,
    user: Any,
) -> str:
    if right_raw_payload is not None:
        return _snapshot_display_code(
            schema,
            right_fields_config,
            right_raw_payload,
            display_payload_keys,
            business_code,
            user,
        )
    if left_raw_payload is not None:
        return _snapshot_display_code(
            schema,
            left_fields_config,
            left_raw_payload,
            display_payload_keys,
            business_code,
            user,
        )
    return business_code


def _snapshot_display_code(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    raw_payload: dict[str, Any],
    display_payload_keys: set[str],
    business_code: str,
    user: Any,
) -> str:
    projected_payload = {
        key: raw_payload[key]
        for key in display_payload_keys
        if key in raw_payload
    }
    display_payload = serialize_data_payload(schema, fields_config, projected_payload, user)
    return resolve_display_code_or_fallback(schema, display_payload, business_code)


def _snapshot_serialized_payload(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    raw_payload: dict[str, Any] | None,
    record_id: int | None,
    user: Any,
) -> dict[str, Any] | None:
    if record_id is None or raw_payload is None:
        return None
    return serialize_data_payload(schema, fields_config, raw_payload, user)


def _serialize_snapshot_diff_row(
    schema: DataSchema,
    row: dict[str, Any],
    left_fields_config: list[dict[str, Any]],
    right_fields_config: list[dict[str, Any]],
    user: Any,
) -> dict[str, Any]:
    left_payload = _snapshot_serialized_payload(
        schema,
        left_fields_config,
        row["left_raw_payload"],
        row["left_record_id"],
        user,
    )
    right_payload = _snapshot_serialized_payload(
        schema,
        right_fields_config,
        row["right_raw_payload"],
        row["right_record_id"],
        user,
    )
    display_payload = (
        right_payload
        if row["right_record_id"] is not None
        else left_payload
        if row["left_record_id"] is not None
        else {}
    )
    return {
        "id": f"snapshot:{row['entity_id']}:{row['field_key']}",
        "entity": {
            "id": row["entity_id"],
            "business_code": row["business_code"],
            "display_code": resolve_display_code_or_fallback(
                schema,
                display_payload or {},
                row["business_code"],
            ),
        },
        "field": {
            "key": row["field_key"],
            "label": row["field_label"],
        },
        "before": (
            left_payload.get(row["field_key"])
            if left_payload is not None
            else None
        ),
        "after": (
            right_payload.get(row["field_key"])
            if right_payload is not None
            else None
        ),
        "action": row["action"],
        "left_record_id": row["left_record_id"],
        "right_record_id": row["right_record_id"],
        "left_change_set_id": row["left_change_set_id"],
        "right_change_set_id": row["right_change_set_id"],
        "recorded_at": row["recorded_at"],
    }


def _resolve_current_view_page(
    schema: DataSchema,
    query_params,
    request: CurrentViewRequest,
    user: Any,
) -> tuple[Any, list[CurrentViewRecord], int]:
    if _can_push_down_current_view_page(query_params, request.ordering, request.keyword):
        view = get_current_view_page(
            schema,
            request.at,
            retro=request.retro,
            ordering=request.ordering,
            limit=request.page_size,
            offset=(request.page - 1) * request.page_size,
        )
        return view, view.records, view.count
    view, records, _ = resolve_current_view(schema, query_params, user=user)
    return view, _paginate(records, request.page, request.page_size), len(records)


def _current_view_search_matches(
    records: list[CurrentViewRecord],
    request: CurrentViewRequest,
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
) -> dict[int, list[dict[str, Any]]]:
    if not request.keyword:
        return {}
    return _search_matches_by_record_id(
        records,
        request.keyword,
        schema,
        fields_config,
        user,
        request.include_attachment_text,
    )


def _can_push_down_current_view_page(query_params, ordering: str, keyword: str) -> bool:
    return (
        not keyword
        and not query_params.get("change_set")
        and not current_view_has_filters(query_params)
        and current_view_ordering_can_push_down(ordering)
    )


def _current_view_locate_unsupported_reason(
    query_params,
    request: CurrentViewRequest,
) -> str | None:
    if request.keyword:
        return "search_scope_not_supported"
    if query_params.get("change_set"):
        return "change_set_scope_not_supported"
    if current_view_has_filters(query_params):
        return "filters_scope_not_supported"
    if not current_view_ordering_can_push_down(request.ordering):
        return "ordering_not_supported"
    return None


def resolve_current_view(
    schema: DataSchema,
    query_params,
    user: Any = None,
    *,
    fields_config: list[dict[str, Any]] | None = None,
    schema_version: int | None = None,
) -> tuple[Any, list[CurrentViewRecord], bool]:
    at = _parse_date(query_params.get("at"))
    retro = _parse_bool(query_params.get("retro"))
    include_attachment_text = _parse_bool(
        query_params.get("include_attachment_text"),
        "include_attachment_text",
    )
    view = get_current_view(schema, at, retro=retro)
    if fields_config is not None:
        view = replace(
            view,
            fields_config=fields_config,
            schema_version=schema_version or view.schema_version,
        )
    records = _filter_records(
        view.records,
        query_params.get("search", ""),
        schema,
        view.fields_config,
        user,
        include_attachment_text=include_attachment_text,
    )
    records = apply_current_view_filters(records, schema, view.fields_config, user, query_params)
    records = _filter_records_by_change_set(records, schema, query_params.get("change_set"))
    records = _sort_records(
        records, query_params.get("ordering", "business_code"), view.fields_config, schema, user
    )
    return view, records, retro


def build_entity_timeline_payload(entity: Entity, user: Any = None) -> dict[str, Any]:
    records = get_entity_timeline(entity)
    schema = entity.schema
    serialized_records = [_serialize_timeline_record(record, schema, user) for record in records]
    display_payload = serialized_records[-1]["data_payload"] if serialized_records else {}
    display_code = resolve_display_code_or_fallback(schema, display_payload, entity.business_code)
    return {
        "entity": {
            "id": entity.id,
            "schema_id": entity.schema_id,
            "business_code": entity.business_code,
            "display_code": display_code,
            "created_at": entity.created_at.isoformat(),
            "created_by_id": entity.created_by_id,
        },
        "records": serialized_records,
    }


def _parse_date(value: str | None) -> dt.date:
    if not value:
        return timezone.localdate()
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({"at": "日期格式必须是 YYYY-MM-DD"}) from exc


def _parse_bool(value: str | None, field: str = "retro") -> bool:
    if value is None or value == "":
        return False
    normalized = value.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValidationError({field: "布尔值必须是 true 或 false"})


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


def _filter_records(
    records: list[CurrentViewRecord],
    search: str,
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
    *,
    include_attachment_text: bool = False,
) -> list[CurrentViewRecord]:
    keyword = _normalized_keyword(search)
    if not keyword:
        return records
    return [
        record
        for record in records
        if _matches_keyword(
            record,
            keyword,
            schema,
            fields_config,
            user,
            include_attachment_text=include_attachment_text,
        )
    ]


def _filter_records_by_change_set(
    records: list[CurrentViewRecord],
    schema: DataSchema,
    change_set_id: str | None,
) -> list[CurrentViewRecord]:
    if not change_set_id:
        return records
    parsed_id = _parse_positive_int(change_set_id, "change_set", default=1)
    entity_ids = set(
        ChangeEntry.objects.filter(change_set_id=parsed_id, change_set__schema=schema).values_list(
            "entity_id", flat=True
        )
    )
    if not entity_ids:
        return []
    return [record for record in records if record.entity_id in entity_ids]


def _sort_records(
    records: list[CurrentViewRecord],
    ordering: str,
    fields_config: list[dict[str, Any]],
    schema: DataSchema,
    user: Any,
) -> list[CurrentViewRecord]:
    descending = ordering.startswith("-")
    field = ordering[1:] if descending else ordering
    field_by_key = {item["key"]: item for item in fields_config if "key" in item}
    field_keys = set(field_by_key)
    if field not in _meta_order_fields() and field not in field_keys:
        raise ValidationError({"ordering": "不支持的排序字段"})
    if not ordering_field_is_allowed(schema, fields_config, field, user):
        raise ValidationError({"ordering": "无权按脱敏字段排序"})
    return sorted(
        records,
        key=lambda record: _sort_value(record, field, field_by_key.get(field)),
        reverse=descending,
    )


def _meta_order_fields() -> set[str]:
    return {"business_code", "valid_from", "valid_to", "schema_version", "recorded_at"}


def _sort_value(
    record: CurrentViewRecord, field: str, field_config: dict[str, Any] | None
) -> tuple[bool, int, object]:
    if field == "business_code":
        value = record.business_code
    elif field in _meta_order_fields():
        value = getattr(record, field)
    else:
        value = record.data_payload.get(field)
    if value is None:
        return True, 0, ""
    if field_config and field_config.get("type") == "number":
        try:
            return False, 0, Decimal(str(value))
        except (InvalidOperation, ValueError):
            return False, 1, str(value)
    return False, 0, str(value)


def _paginate(
    records: list[CurrentViewRecord],
    page: int,
    page_size: int,
) -> list[CurrentViewRecord]:
    start = (page - 1) * page_size
    return records[start : start + page_size]


def _matches_keyword(
    record: CurrentViewRecord,
    keyword: str,
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
    *,
    include_attachment_text: bool = False,
) -> bool:
    return bool(
        _record_search_matches(
            record,
            keyword,
            schema,
            fields_config,
            user,
            include_attachment_text,
        )
    )


def _search_matches_by_record_id(
    records: list[CurrentViewRecord],
    keyword: str,
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
    include_attachment_text: bool,
) -> dict[int, list[dict[str, Any]]]:
    return {
        record.record_id: _record_search_matches(
            record,
            keyword,
            schema,
            fields_config,
            user,
            include_attachment_text,
        )
        for record in records
    }


def _record_search_matches(
    record: CurrentViewRecord,
    keyword: str,
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
    include_attachment_text: bool,
) -> list[dict[str, Any]]:
    payload = serialize_data_payload(schema, fields_config, record.data_payload, user)
    display_code = resolve_display_code_or_fallback(schema, payload, record.business_code)
    matches: list[dict[str, Any]] = []
    if _value_matches(display_code, keyword):
        matches.append({"source": "field_value", "field_key": "__display_code__"})
    matches.extend(_payload_search_matches(fields_config, payload, keyword))
    if include_attachment_text:
        matches.extend(_attachment_text_matches(schema, fields_config, payload, keyword))
    return matches


def _payload_search_matches(
    fields_config: list[dict[str, Any]],
    payload: dict[str, Any],
    keyword: str,
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    seen: set[str] = set()
    for field in fields_config:
        key = str(field.get("key") or "")
        if not key or key not in payload:
            continue
        seen.add(key)
        if field.get("type") in {"attachment", "image"}:
            matches.extend(_attachment_filename_matches(key, payload[key], keyword))
        elif _value_matches(_searchable_field_value(field, payload[key]), keyword):
            matches.append({"source": "field_value", "field_key": key})
    for key, value in payload.items():
        if key not in seen and _value_matches(_searchable_unknown_value(value), keyword):
            matches.append({"source": "field_value", "field_key": str(key)})
    return matches


def _searchable_field_value(field: dict[str, Any], value: Any) -> Any:
    if field.get("type") == "markdown" and isinstance(value, str):
        return _markdown_plain_text(value)
    return value


def _searchable_unknown_value(value: Any) -> Any:
    if isinstance(value, str) and _looks_like_markdown(value):
        return _markdown_plain_text(value)
    return value


def _attachment_filename_matches(
    field_key: str,
    value: Any,
    keyword: str,
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    matches: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        filename = str(item.get("name") or "")
        if keyword not in filename.lower():
            continue
        match = {"source": "attachment_filename", "field_key": field_key, "filename": filename}
        asset_id = item.get("id")
        if isinstance(asset_id, int) and not isinstance(asset_id, bool):
            match["asset_id"] = asset_id
        matches.append(match)
    return matches


def _attachment_text_matches(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    payload: dict[str, Any],
    keyword: str,
) -> list[dict[str, Any]]:
    refs = _visible_attachment_refs(fields_config, payload)
    if not refs:
        return []
    assets = FieldFileAsset.objects.filter(
        schema=schema,
        pk__in=refs,
        extraction_status=FieldFileAsset.ExtractionStatus.READY,
    ).only("id", "original_name", "content_type", "extracted_text")
    matches: list[dict[str, Any]] = []
    for asset in assets:
        if not _is_docx_search_asset(asset):
            continue
        text = asset.extracted_text[:ATTACHMENT_SEARCH_TEXT_MAX_CHARS]
        if keyword not in text.lower():
            continue
        ref = refs[asset.id]
        matches.append(
            {
                "source": "attachment_text",
                "field_key": ref["field_key"],
                "asset_id": asset.id,
                "filename": ref["filename"],
                "snippet": _search_snippet(text, keyword),
            }
        )
    return matches


def _visible_attachment_refs(
    fields_config: list[dict[str, Any]],
    payload: dict[str, Any],
) -> dict[int, dict[str, str]]:
    refs: dict[int, dict[str, str]] = {}
    for field in fields_config:
        if field.get("type") != "attachment":
            continue
        key = str(field.get("key") or "")
        value = payload.get(key)
        if not key or not isinstance(value, list):
            continue
        refs.update(_attachment_refs_for_field(key, value))
    return refs


def _attachment_refs_for_field(field_key: str, value: list[Any]) -> dict[int, dict[str, str]]:
    refs: dict[int, dict[str, str]] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        asset_id = item.get("id")
        if isinstance(asset_id, int) and not isinstance(asset_id, bool):
            refs[asset_id] = {"field_key": field_key, "filename": str(item.get("name") or "")}
    return refs


def _is_docx_search_asset(asset: FieldFileAsset) -> bool:
    content_type = asset.content_type.lower()
    return asset.original_name.lower().endswith(".docx") or content_type.endswith(
        "wordprocessingml.document"
    )


def _search_snippet(text: str, keyword: str) -> str:
    position = text.lower().find(keyword)
    if position < 0:
        return ""
    start = max(position - SEARCH_SNIPPET_RADIUS, 0)
    end = min(position + len(keyword) + SEARCH_SNIPPET_RADIUS, len(text))
    snippet = text[start:end].strip()
    if start > 0:
        snippet = f"...{snippet}"
    if end < len(text):
        snippet = f"{snippet}..."
    return snippet


def _value_matches(value: Any, keyword: str) -> bool:
    return keyword in _stringify(value).lower()


def _normalized_keyword(value: str | None) -> str:
    return (value or "").strip().lower()


def _looks_like_markdown(value: str) -> bool:
    return bool(
        MARKDOWN_LINK_RE.search(value)
        or MARKDOWN_AUTOLINK_RE.search(value)
        or MARKDOWN_HTML_RE.search(value)
        or MARKDOWN_FENCE_RE.search(value)
        or MARKDOWN_PREFIX_RE.search(value)
    )


def _markdown_plain_text(value: str) -> str:
    text = MARKDOWN_LINK_RE.sub(lambda match: match.group(1), value)
    text = MARKDOWN_AUTOLINK_RE.sub(" ", text)
    text = MARKDOWN_HTML_RE.sub(" ", text)
    text = MARKDOWN_FENCE_RE.sub(" ", text)
    text = MARKDOWN_PREFIX_RE.sub("", text)
    text = text.replace("`", "").replace("*", "").replace("_", "").replace("~", "")
    return " ".join(text.split())


def _serialize_record(
    record: CurrentViewRecord,
    meta: dict[str, Any] | None = None,
    schema: DataSchema | None = None,
    fields_config: list[dict[str, Any]] | None = None,
    user: Any = None,
    search_matches: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    meta = meta or {"row_status": "unchanged", "changed_fields": []}
    data_payload = record.data_payload
    if schema is not None and fields_config is not None:
        data_payload = serialize_data_payload(schema, fields_config, record.data_payload, user)
    display_code = (
        resolve_display_code_or_fallback(schema, data_payload, record.business_code)
        if schema is not None
        else record.business_code
    )
    payload = {
        "record_id": record.record_id,
        "entity_id": record.entity_id,
        "business_code": record.business_code,
        "display_code": display_code,
        "data_payload": data_payload,
        "row_status": meta["row_status"],
        "changed_fields": meta["changed_fields"],
        "valid_from": record.valid_from.isoformat(),
        "valid_to": record.valid_to.isoformat() if record.valid_to else None,
        "schema_version": record.schema_version,
        "change_set_id": record.change_set_id,
        "recorded_by_id": record.recorded_by_id,
        "recorded_at": record.recorded_at.isoformat(),
    }
    if search_matches is not None:
        payload["search_matches"] = search_matches
    return payload


def _serialize_timeline_record(
    record: TimelineRecord,
    schema: DataSchema,
    user: Any = None,
) -> dict[str, Any]:
    serialized_payload = serialize_data_payload(schema, schema.fields_config, record.data_payload, user)
    hidden_system_keys = {
        key
        for field in schema.fields_config
        if isinstance((key := field.get("key")), str) and field_is_system_hidden(field)
    }
    if hidden_system_keys:
        serialized_payload = {
            key: value for key, value in serialized_payload.items() if key not in hidden_system_keys
        }
    return {
        "record_id": record.record_id,
        "schema_version": record.schema_version,
        "data_payload": serialized_payload,
        "valid_from": record.valid_from.isoformat(),
        "valid_to": record.valid_to.isoformat() if record.valid_to else None,
        "change_set_id": record.change_set_id,
        "change_summary": record.change_summary,
        "recorded_by_id": record.recorded_by_id,
        "recorded_at": record.recorded_at.isoformat(),
    }


def _record_meta_by_id(record_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not record_ids:
        return {}
    entries = ChangeEntry.objects.filter(new_record_id__in=record_ids).values(
        "new_record_id",
        "action",
        "data_before",
        "data_after",
    )
    return {
        entry["new_record_id"]: {
            "row_status": _row_status(entry["action"]),
            "changed_fields": _changed_fields(entry["data_before"], entry["data_after"]),
        }
        for entry in entries
    }


def _row_status(action: str) -> str:
    if action == ChangeEntry.Action.CREATE:
        return "new"
    if action == ChangeEntry.Action.UPDATE:
        return "modified"
    if action == ChangeEntry.Action.TERMINATE:
        return "terminated"
    return "unchanged"


def _changed_fields(before: dict | None, after: dict | None) -> list[str]:
    before = before or {}
    after = after or {}
    keys = sorted(set(before) | set(after))
    return [key for key in keys if before.get(key) != after.get(key)]


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)
