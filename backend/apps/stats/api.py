from __future__ import annotations

import datetime as dt
import re
from collections import Counter
from typing import Any
from urllib.parse import urlencode

from django.db.models import Min
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.field_security import field_value_is_masked, ordering_field_is_allowed
from apps.schemas.identity import field_is_system_hidden
from apps.schemas.models import DataSchema
from apps.temporal.api import resolve_current_view
from apps.temporal.filters import current_view_filter_payload, current_view_has_filters
from apps.temporal.models import TemporalRecord
from apps.temporal.queries import (
    aggregate_current_view_field_values,
    count_current_view_by_points,
    count_current_view_records,
    resolve_schema_fields,
)

TREND_UNIT_DEFAULTS = {"day": 7, "week": 12, "month": 12}
TREND_UNIT_MAXIMUMS = {"day": 31, "week": 26, "month": 24}
AUTO_DAY_THRESHOLD = 14
AUTO_WEEK_THRESHOLD = 90
AUTO_SHORT_DAY_RANGE = 7
AUTO_LONG_DAY_RANGE = 14
AUTO_MIN_WEEK_RANGE = 4
AUTO_MAX_WEEK_RANGE = 12
AUTO_MIN_MONTH_RANGE = 12
AUTO_MAX_MONTH_RANGE = 24
FLOW_DIMENSIONS = {"status", "department", "labels"}
FLOW_EMPTY_VALUE = "(无值)"
FLOW_EMPTY_LABEL = "(无标签)"
FLOW_SAMPLE_ENTITY_LIMIT = 5
FLOW_DIMENSION_SPECS = {
    "status": {
        "field_type": "enum",
        "key_aliases": {"status", "state"},
        "label_aliases": {"状态"},
    },
    "department": {
        "field_type": "enum",
        "key_aliases": {"department", "dept", "team", "org"},
        "label_aliases": {"部门", "组织", "团队", "科室"},
    },
    "labels": {
        "field_type": "multi-enum",
        "key_aliases": {"label", "labels", "tag", "tags"},
        "label_aliases": {"标签", "标记"},
    },
}


def build_summary_payload(
    schema: DataSchema, query_params, user: Any = None
) -> dict[str, Any]:
    at, retro, _ = _current_stats_context(schema, query_params, user)
    total = _fast_current_total(schema, at, query_params)
    if total is None:
        view, records, retro = resolve_current_view(schema, query_params, user=user)
        at = view.at
        total = len(records)
    month_start = at.replace(day=1)
    month_end = _add_months(month_start, 1)
    entries = _applied_entries(schema).filter(
        valid_from__gte=month_start,
        valid_from__lte=at,
        valid_from__lt=month_end,
    )
    counts = Counter(entries.values_list("action", flat=True))
    latest = _latest_change_set(schema, at)
    return {
        "schema_id": schema.id,
        "at": at.isoformat(),
        "scope": _current_stats_scope(at, retro, query_params),
        "metrics": {
            "total": total,
            "month_created": counts.get(ChangeEntry.Action.CREATE, 0),
            "month_updated": counts.get(ChangeEntry.Action.UPDATE, 0),
            "month_terminated": counts.get(ChangeEntry.Action.TERMINATE, 0),
        },
        "latest_change_at": _latest_change_at(latest),
        "latest_change_set_id": latest.id if latest else None,
    }


def build_trend_payload(schema: DataSchema, query_params) -> dict[str, Any]:
    at = _parse_date(query_params.get("at"))
    requested_unit = str(query_params.get("unit") or "month")
    if requested_unit == "auto":
        unit, range_size = _auto_trend_window(schema, at)
    else:
        unit = _trend_unit(requested_unit)
        range_size = _positive_int(
            query_params.get("range"),
            "range",
            default=TREND_UNIT_DEFAULTS[unit],
            maximum=TREND_UNIT_MAXIMUMS[unit],
        )
    points = _trend_points(at, unit, range_size)
    return {
        "schema_id": schema.id,
        "unit": unit,
        "range": range_size,
        "points": [
            {"at": point.at.isoformat(), "count": point.count}
            for point in count_current_view_by_points(schema, points)
        ],
    }


def build_distribution_payload(
    schema: DataSchema, query_params, user: Any = None
) -> dict[str, Any]:
    at, retro, fields_config = _current_stats_context(schema, query_params, user)
    field = _distribution_field(schema, fields_config, query_params.get("field"), user)
    counts = _fast_distribution_counts(schema, at, query_params, field)
    if counts is None:
        view, records, retro = resolve_current_view(schema, query_params, user=user)
        at = view.at
        field = _distribution_field(schema, view.fields_config, query_params.get("field"), user)
        counts = _python_distribution_counts(field, records)
    return {
        "schema_id": schema.id,
        "at": at.isoformat(),
        "scope": _current_stats_scope(at, retro, query_params),
        "field": {"key": field["key"], "label": field["label"], "type": field["type"]},
        "buckets": [
            {"value": value, "count": counts[value]}
            for value in _ordered_distribution_values(field, counts)
        ],
    }


def build_flow_payload(schema: DataSchema, query_params, user: Any = None) -> dict[str, Any]:
    request = _parse_flow_request(query_params)
    left_view, left_records, _ = resolve_current_view(
        schema,
        _flow_view_query_params(request, request["left_at"], include_search=False),
        user=user,
    )
    right_view, right_records, _ = resolve_current_view(
        schema,
        _flow_view_query_params(request, request["right_at"], include_search=False),
        user=user,
    )
    dimension = _flow_dimension(
        schema,
        left_view.fields_config,
        right_view.fields_config,
        request["dimension"],
        user,
    )
    entity_scope = _flow_search_entity_ids(schema, request, user)
    graph = _build_flow_graph(
        schema.id,
        request,
        dimension,
        left_records,
        right_records,
        entity_scope=entity_scope,
    )
    return {
        "schema_id": schema.id,
        "dimension": _flow_dimension_payload(dimension),
        "scope": _flow_scope(request),
        "summary": graph["summary"],
        "nodes": graph["nodes"],
        "links": graph["links"],
        "snapshot_diff_to": _flow_snapshot_diff_to(schema.id, request, dimension["kind"]),
        "heat": _build_flow_heat(schema, request, dimension, graph["entity_ids"]),
    }


def _python_distribution_counts(field: dict[str, Any], records) -> Counter:
    counts = Counter()
    for record in records:
        counts.update(_distribution_record_values(field, record.data_payload.get(field["key"])))
    return counts


def _applied_entries(schema: DataSchema):
    return ChangeEntry.objects.filter(
        change_set__schema=schema,
        change_set__status=ChangeSet.Status.APPLIED,
    )


def _latest_change_set(schema: DataSchema, at: dt.date) -> ChangeSet | None:
    return (
        ChangeSet.objects.filter(schema=schema, status=ChangeSet.Status.APPLIED)
        .filter(applied_at__date__lte=at)
        .order_by("-applied_at", "-created_at", "-id")
        .first()
    )


def _latest_change_at(change_set: ChangeSet | None) -> str | None:
    if change_set is None:
        return None
    value = change_set.applied_at or change_set.created_at
    return value.isoformat()


def _current_stats_context(schema: DataSchema, query_params, user: Any):
    at = _parse_date(query_params.get("at"))
    retro = _parse_bool(query_params.get("retro"))
    fields_config = resolve_schema_fields(schema, at, retro=retro).fields_config
    _validate_current_stats_ordering(schema, fields_config, query_params, user)
    return at, retro, fields_config


def _fast_current_total(schema: DataSchema, at: dt.date, query_params) -> int | None:
    if not _can_use_current_stats_fast_path(query_params):
        return None
    return count_current_view_records(schema, at)


def _fast_distribution_counts(
    schema: DataSchema, at: dt.date, query_params, field: dict[str, Any]
) -> Counter | None:
    if not _can_use_current_stats_fast_path(query_params):
        return None
    rows = aggregate_current_view_field_values(
        schema,
        at,
        field_key=field["key"],
        field_type=field["type"],
    )
    return Counter({_coerce_distribution_value(field, value): count for value, count in rows})


def _can_use_current_stats_fast_path(query_params) -> bool:
    return (
        not _normalized_search(query_params.get("search"))
        and not query_params.get("change_set")
        and not current_view_has_filters(query_params)
    )


def _normalized_search(value: object) -> str:
    return str(value or "").strip()


def _validate_current_stats_ordering(schema, fields_config, query_params, user: Any) -> None:
    ordering = str(query_params.get("ordering") or "business_code")
    field_key = ordering[1:] if ordering.startswith("-") else ordering
    field_keys = {field["key"] for field in fields_config if "key" in field}
    if field_key not in _meta_order_fields() and field_key not in field_keys:
        raise ValidationError({"ordering": "不支持的排序字段"})
    if not ordering_field_is_allowed(schema, fields_config, field_key, user):
        raise ValidationError({"ordering": "无权按脱敏字段排序"})


def _meta_order_fields() -> set[str]:
    return {"business_code", "valid_from", "valid_to", "schema_version", "recorded_at"}


def _coerce_distribution_value(field: dict[str, Any], value: Any) -> Any:
    if field.get("type") == "boolean":
        return str(value).lower() == "true"
    return value


def _current_stats_scope(at: dt.date, retro: bool, query_params) -> dict[str, Any]:
    scope = {
        "at": at.isoformat(),
        "retro": retro,
        "search": str(query_params.get("search") or ""),
        "ordering": str(query_params.get("ordering") or "business_code"),
        "change_set": _scope_change_set(query_params.get("change_set")),
    }
    filters = current_view_filter_payload(query_params)
    if filters:
        scope["filters"] = filters
    return scope


def _scope_change_set(value: object) -> int | None:
    if value in (None, ""):
        return None
    return int(value)


def _distribution_field(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    field_key: str | None,
    user: Any,
) -> dict[str, Any]:
    active = [field for field in fields_config if not field.get("deprecated")]
    if field_key:
        for field in active:
            if field.get("key") == field_key:
                if not _distribution_field_is_visible(schema, field, user):
                    raise ValidationError({"field": "field does not exist"})
                if not _field_is_distributable(field):
                    raise ValidationError({"field": "field is not distributable"})
                return field
        raise ValidationError({"field": "field does not exist"})
    for field in active:
        if _field_is_distributable(field) and _distribution_field_is_visible(
            schema, field, user
        ):
            return field
    raise ValidationError({"field": "no distributable field"})


def _field_is_distributable(field: dict[str, Any]) -> bool:
    return field.get("type") in {"enum", "multi-enum", "boolean"}


def _distribution_field_is_visible(schema: DataSchema, field: dict[str, Any], user: Any) -> bool:
    return not field_value_is_masked(user, schema, field)


def _ordered_distribution_values(field: dict[str, Any], counts: Counter) -> list[Any]:
    options = list((field.get("validators") or {}).get("options") or [])
    ordered = [value for value in options if value in counts]
    extras = sorted((value for value in counts if value not in options), key=str)
    return [*ordered, *extras]


def _distribution_record_values(field: dict[str, Any], value: Any) -> list[Any]:
    if value in (None, ""):
        return []
    if field.get("type") != "multi-enum":
        return [value]
    if not isinstance(value, list):
        return [value]
    return [item for item in value if item not in (None, "")]


def _parse_flow_request(query_params) -> dict[str, Any]:
    left_at = _parse_required_date(query_params.get("left_at"), "left_at")
    right_at = _parse_required_date(query_params.get("right_at"), "right_at")
    if right_at < left_at:
        raise ValidationError({"right_at": "must be on or after left_at"})
    dimension = str(query_params.get("dimension") or "")
    if dimension not in FLOW_DIMENSIONS:
        raise ValidationError({"dimension": "must be status, department, or labels"})
    return {
        "left_at": left_at,
        "right_at": right_at,
        "dimension": dimension,
        "retro": _parse_bool(query_params.get("retro")),
        "search": str(query_params.get("search") or ""),
        "ordering": str(query_params.get("ordering") or "business_code"),
    }


def _parse_required_date(value: object, field: str) -> dt.date:
    if value in (None, ""):
        raise ValidationError({field: "required"})
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError({field: "must be YYYY-MM-DD"}) from exc


def _flow_view_query_params(
    request: dict[str, Any],
    at: dt.date,
    *,
    include_search: bool,
) -> dict[str, str]:
    return {
        "at": at.isoformat(),
        "retro": "true" if request["retro"] else "",
        "search": request["search"] if include_search else "",
        "ordering": request["ordering"],
    }


def _flow_search_entity_ids(
    schema: DataSchema,
    request: dict[str, Any],
    user: Any,
) -> set[int] | None:
    if not _normalized_search(request["search"]):
        return None
    left_params = _flow_view_query_params(request, request["left_at"], include_search=True)
    right_params = _flow_view_query_params(request, request["right_at"], include_search=True)
    _, left_records, _ = resolve_current_view(schema, left_params, user=user)
    _, right_records, _ = resolve_current_view(schema, right_params, user=user)
    return {
        record.entity_id
        for record in [*left_records, *right_records]
    }


def _flow_dimension(
    schema: DataSchema,
    left_fields_config: list[dict[str, Any]],
    right_fields_config: list[dict[str, Any]],
    kind: str,
    user: Any,
) -> dict[str, Any]:
    field = _flow_dimension_field(schema, left_fields_config, right_fields_config, kind, user)
    return {
        "kind": kind,
        "field": field,
        "key": field["key"],
        "label": str(field.get("label") or field["key"]),
        "type": str(field.get("type") or ""),
        "multi_value": field.get("type") == "multi-enum",
        "count_mode": "label_assignments" if field.get("type") == "multi-enum" else "entities",
    }


def _flow_dimension_field(
    schema: DataSchema,
    left_fields_config: list[dict[str, Any]],
    right_fields_config: list[dict[str, Any]],
    kind: str,
    user: Any,
) -> dict[str, Any]:
    spec = FLOW_DIMENSION_SPECS[kind]
    ordered_keys, fields_by_key = _flow_field_catalog(left_fields_config, right_fields_config)
    for key in ordered_keys:
        field = _flow_eligible_field(
            schema,
            fields_by_key.get(key, []),
            user,
            field_type=spec["field_type"],
        )
        if field is not None and _flow_field_matches_dimension(field, spec):
            return field
    raise ValidationError({"dimension": "dimension field does not exist"})


def _flow_field_catalog(
    *fields_configs: list[dict[str, Any]],
) -> tuple[list[str], dict[str, list[dict[str, Any]]]]:
    ordered_keys: list[str] = []
    fields_by_key: dict[str, list[dict[str, Any]]] = {}
    seen: set[str] = set()
    for fields_config in fields_configs:
        for field in fields_config:
            key = field.get("key")
            if not isinstance(key, str):
                continue
            fields_by_key.setdefault(key, []).append(field)
            if key not in seen:
                ordered_keys.append(key)
                seen.add(key)
    return ordered_keys, fields_by_key


def _flow_eligible_field(
    schema: DataSchema,
    fields: list[dict[str, Any]],
    user: Any,
    *,
    field_type: str,
) -> dict[str, Any] | None:
    if not fields:
        return None
    if any(not _flow_field_is_usable(schema, field, user, field_type) for field in fields):
        return None
    return fields[0]


def _flow_field_is_usable(
    schema: DataSchema,
    field: dict[str, Any],
    user: Any,
    field_type: str,
) -> bool:
    return (
        field.get("type") == field_type
        and not field.get("deprecated")
        and not field_is_system_hidden(field)
        and not field_value_is_masked(user, schema, field)
    )


def _flow_field_matches_dimension(field: dict[str, Any], spec: dict[str, Any]) -> bool:
    return _flow_normalized_key_alias(field.get("key")) in spec["key_aliases"] or (
        _flow_normalized_label_alias(field.get("label")) in spec["label_aliases"]
    )


def _flow_normalized_key_alias(value: object) -> str:
    normalized = re.sub(r"[\s\-]+", "_", str(value or "").strip().lower())
    return re.sub(r"_+", "_", normalized).strip("_")


def _flow_normalized_label_alias(value: object) -> str:
    return str(value or "").strip()


def _flow_dimension_payload(dimension: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": dimension["kind"],
        "key": dimension["key"],
        "label": dimension["label"],
        "type": dimension["type"],
        "multi_value": dimension["multi_value"],
        "count_mode": dimension["count_mode"],
    }


def _flow_scope(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "left_at": request["left_at"].isoformat(),
        "right_at": request["right_at"].isoformat(),
        "retro": request["retro"],
        "search": request["search"],
        "ordering": request["ordering"],
    }


def _build_flow_graph(
    schema_id: int,
    request: dict[str, Any],
    dimension: dict[str, Any],
    left_records,
    right_records,
    *,
    entity_scope: set[int] | None,
) -> dict[str, Any]:
    field = dimension["field"]
    left_by_entity = {record.entity_id: record for record in left_records}
    right_by_entity = {record.entity_id: record for record in right_records}
    entity_ids = _flow_entity_order(left_records, right_records, entity_scope=entity_scope)
    summary = {
        "left_count": 0,
        "right_count": 0,
        "entity_count": len(entity_ids),
        "changed_entity_count": 0,
    }
    links: dict[tuple[str, str], dict[str, Any]] = {}
    left_nodes: Counter = Counter()
    right_nodes: Counter = Counter()
    left_order: list[str] = []
    right_order: list[str] = []
    for entity_id in entity_ids:
        left_values = _flow_record_values(field, left_by_entity.get(entity_id))
        right_values = _flow_record_values(field, right_by_entity.get(entity_id))
        summary["left_count"] += len(left_values)
        summary["right_count"] += len(right_values)
        if _flow_values_changed(dimension, left_values, right_values):
            summary["changed_entity_count"] += 1
        for source, target in _flow_entity_links(dimension, left_values, right_values):
            _flow_remember_node(left_nodes, left_order, source)
            _flow_remember_node(right_nodes, right_order, target)
            entry = links.setdefault(
                (source, target),
                {
                    "from": source,
                    "to": target,
                    "value": 0,
                    "changed": source != target,
                    "_entity_ids": set(),
                },
            )
            entry["value"] += 1
            entry["_entity_ids"].add(entity_id)
    serialized_links = _flow_links(schema_id, request, dimension, links)
    return {
        "summary": _flow_summary(summary, serialized_links),
        "nodes": _flow_nodes(left_nodes, left_order, right_nodes, right_order),
        "links": serialized_links,
        "entity_ids": set(entity_ids),
    }


def _flow_entity_order(
    left_records,
    right_records,
    *,
    entity_scope: set[int] | None,
) -> list[int]:
    ordered: list[int] = []
    seen: set[int] = set()
    for record in [*left_records, *right_records]:
        if record.entity_id in seen or (entity_scope is not None and record.entity_id not in entity_scope):
            continue
        ordered.append(record.entity_id)
        seen.add(record.entity_id)
    return ordered


def _flow_record_values(field: dict[str, Any], record) -> list[str]:
    payload = record.data_payload if record is not None and isinstance(record.data_payload, dict) else {}
    values = [str(value) for value in _distribution_record_values(field, payload.get(field["key"]))]
    if field.get("type") != "multi-enum":
        return values[:1]
    return list(dict.fromkeys(values))


def _flow_values_changed(
    dimension: dict[str, Any],
    left_values: list[str],
    right_values: list[str],
) -> bool:
    if dimension["multi_value"]:
        return set(left_values) != set(right_values)
    left = left_values[0] if left_values else None
    right = right_values[0] if right_values else None
    return left != right


def _flow_entity_links(
    dimension: dict[str, Any],
    left_values: list[str],
    right_values: list[str],
) -> list[tuple[str, str]]:
    if not dimension["multi_value"]:
        return [(_flow_empty_value(dimension, left_values), _flow_empty_value(dimension, right_values))]
    left_set = set(left_values)
    right_set = set(right_values)
    return [
        *[(value, FLOW_EMPTY_LABEL) for value in left_values if value not in right_set],
        *[(value, value) for value in left_values if value in right_set],
        *[(FLOW_EMPTY_LABEL, value) for value in right_values if value not in left_set],
    ]


def _flow_empty_value(dimension: dict[str, Any], values: list[str]) -> str:
    if values:
        return values[0]
    return FLOW_EMPTY_LABEL if dimension["multi_value"] else FLOW_EMPTY_VALUE


def _flow_remember_node(counts: Counter, order: list[str], value: str) -> None:
    if value not in counts:
        order.append(value)
    counts[value] += 1


def _flow_summary(base: dict[str, int], links: list[dict[str, Any]]) -> dict[str, Any]:
    summary = dict(base)
    summary["entered_count"] = sum(
        item["value"] for item in links if item["from"] != item["to"] and item["from"] in {FLOW_EMPTY_VALUE, FLOW_EMPTY_LABEL}
    )
    summary["exited_count"] = sum(
        item["value"] for item in links if item["from"] != item["to"] and item["to"] in {FLOW_EMPTY_VALUE, FLOW_EMPTY_LABEL}
    )
    summary["unchanged_count"] = sum(item["value"] for item in links if item["from"] == item["to"])
    summary["flow_count"] = len(links)
    top_flow = max(links, key=lambda item: item["value"], default=None)
    summary["top_flow"] = (
        {"from": top_flow["from"], "to": top_flow["to"], "value": top_flow["value"]}
        if top_flow is not None
        else None
    )
    return summary


def _flow_nodes(
    left_nodes: Counter,
    left_order: list[str],
    right_nodes: Counter,
    right_order: list[str],
) -> list[dict[str, Any]]:
    return [
        *[
            {
                "id": f"left:{value}",
                "name": value,
                "side": "left",
                "value": value,
                "count": left_nodes[value],
            }
            for value in left_order
        ],
        *[
            {
                "id": f"right:{value}",
                "name": value,
                "side": "right",
                "value": value,
                "count": right_nodes[value],
            }
            for value in right_order
        ],
    ]


def _flow_links(
    schema_id: int,
    request: dict[str, Any],
    dimension: dict[str, Any],
    links: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for entry in links.values():
        entity_ids = entry.pop("_entity_ids")
        serialized.append(
            {
                "source": f"left:{entry['from']}",
                "target": f"right:{entry['to']}",
                "value": entry["value"],
                "from": entry["from"],
                "to": entry["to"],
                "changed": entry["changed"],
                "sample_entity_ids": sorted(entity_ids)[:FLOW_SAMPLE_ENTITY_LIMIT],
                "snapshot_diff_to": _flow_snapshot_diff_to(
                    schema_id,
                    request,
                    dimension["kind"],
                    flow_from=_flow_query_value(dimension["kind"], entry["from"]),
                    flow_to=_flow_query_value(dimension["kind"], entry["to"]),
                ),
            }
        )
    return serialized


def _flow_query_value(kind: str, value: str) -> str:
    empty = FLOW_EMPTY_LABEL if kind == "labels" else FLOW_EMPTY_VALUE
    return "" if value == empty else value


def _flow_snapshot_diff_to(
    schema_id: int,
    request: dict[str, Any],
    dimension: str,
    *,
    flow_from: str | None = None,
    flow_to: str | None = None,
) -> str:
    query_params: list[tuple[str, Any]] = [
        ("mode", "snapshot"),
        ("left_at", request["left_at"].isoformat()),
        ("right_at", request["right_at"].isoformat()),
        ("retro", str(request["retro"]).lower()),
        ("search", request["search"]),
        ("ordering", request["ordering"]),
        ("flow_dimension", dimension),
    ]
    if flow_from is not None:
        query_params.append(("flow_from", flow_from))
    if flow_to is not None:
        query_params.append(("flow_to", flow_to))
    query_params.append(("page", 1))
    query = urlencode(query_params)
    return f"/schemas/{schema_id}/diff-studio?{query}"


def _build_flow_heat(
    schema: DataSchema,
    request: dict[str, Any],
    dimension: dict[str, Any],
    entity_ids: set[int],
) -> list[dict[str, Any]]:
    if not entity_ids:
        return []
    counts: Counter = Counter()
    entries = _applied_entries(schema).filter(
        entity_id__in=entity_ids,
        valid_from__gt=request["left_at"],
        valid_from__lte=request["right_at"],
    )
    for entry in entries.order_by("valid_from", "id"):
        if _flow_entry_changes(dimension["field"], dimension["multi_value"], entry):
            counts[entry.valid_from] += 1
    return [{"at": at.isoformat(), "count": counts[at]} for at in sorted(counts)]


def _flow_entry_changes(field: dict[str, Any], multi_value: bool, entry: ChangeEntry) -> bool:
    before = entry.data_before if isinstance(entry.data_before, dict) else {}
    after = entry.data_after if isinstance(entry.data_after, dict) else {}
    left_values = [str(value) for value in _distribution_record_values(field, before.get(field["key"]))]
    right_values = [str(value) for value in _distribution_record_values(field, after.get(field["key"]))]
    if multi_value:
        return set(left_values) != set(right_values)
    left = left_values[0] if left_values else None
    right = right_values[0] if right_values else None
    return left != right


def _parse_date(value: object) -> dt.date:
    if value in (None, ""):
        return timezone.localdate()
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError({"at": "must be YYYY-MM-DD"}) from exc


def _parse_bool(value: object, field: str = "retro") -> bool:
    if value in (None, ""):
        return False
    if isinstance(value, bool):
        return value
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValidationError({field: "must be true or false"})


def _positive_int(value: object, field: str, *, default: int, maximum: int) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "must be a positive integer"}) from exc
    if parsed < 1:
        raise ValidationError({field: "must be a positive integer"})
    return min(parsed, maximum)


def _trend_unit(value: str) -> str:
    if value not in TREND_UNIT_DEFAULTS:
        raise ValidationError({"unit": "must be auto, day, week, or month"})
    return value


def _auto_trend_window(schema: DataSchema, at: dt.date) -> tuple[str, int]:
    first_date = _first_record_date(schema, at)
    if first_date is None:
        return "day", AUTO_SHORT_DAY_RANGE

    span_days = max((at - first_date).days + 1, 1)
    if span_days <= AUTO_DAY_THRESHOLD:
        if span_days <= AUTO_SHORT_DAY_RANGE:
            return "day", AUTO_SHORT_DAY_RANGE
        return "day", AUTO_LONG_DAY_RANGE
    if span_days <= AUTO_WEEK_THRESHOLD:
        week_range = _clamp(
            _ceil_div(span_days, 7),
            AUTO_MIN_WEEK_RANGE,
            AUTO_MAX_WEEK_RANGE,
        )
        return "week", week_range

    month_range = _clamp(
        _month_span(first_date, at),
        AUTO_MIN_MONTH_RANGE,
        AUTO_MAX_MONTH_RANGE,
    )
    return "month", month_range


def _first_record_date(schema: DataSchema, at: dt.date) -> dt.date | None:
    result = TemporalRecord.objects.filter(
        entity__schema=schema,
        is_superseded=False,
        valid_from__lte=at,
    ).aggregate(first_date=Min("valid_from"))
    return result["first_date"]


def _trend_points(at: dt.date, unit: str, range_size: int) -> list[dt.date]:
    if unit == "day":
        return [at - dt.timedelta(days=offset) for offset in range(range_size - 1, -1, -1)]
    if unit == "week":
        return [at - dt.timedelta(days=offset * 7) for offset in range(range_size - 1, -1, -1)]

    current_month = at.replace(day=1)
    return [
        _month_bucket_point(_add_months(current_month, offset), at)
        for offset in range(1 - range_size, 1)
    ]


def _month_bucket_point(month_start: dt.date, at: dt.date) -> dt.date:
    if month_start.year == at.year and month_start.month == at.month:
        return at
    return _add_months(month_start, 1) - dt.timedelta(days=1)


def _ceil_div(value: int, divisor: int) -> int:
    return (value + divisor - 1) // divisor


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))


def _month_span(start: dt.date, end: dt.date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month + 1


def _add_months(value: dt.date, months: int) -> dt.date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return dt.date(year, month, 1)
