from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from rest_framework.exceptions import ValidationError

from apps.schemas.field_security import ordering_field_is_allowed, serialize_data_payload
from apps.schemas.identity import field_is_system_hidden
from apps.schemas.models import DataSchema

from .queries import CurrentViewRecord

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
EMPTY_OPERATORS = {"is_empty", "is_not_empty"}
VALUE_OPERATORS = SUPPORTED_FILTER_OPERATORS - EMPTY_OPERATORS
COMPARISON_OPERATORS = {
    "greater_than",
    "greater_than_or_equal",
    "less_than",
    "less_than_or_equal",
    "between",
}
TEXT_OPERATORS = {
    "equals",
    "not_equals",
    "contains",
    "starts_with",
    "is_empty",
    "is_not_empty",
    "in",
    "not_in",
}
SCALAR_OPERATORS = {
    "equals",
    "not_equals",
    "is_empty",
    "is_not_empty",
    "in",
    "not_in",
    *COMPARISON_OPERATORS,
}
BOOLEAN_OPERATORS = {"equals", "not_equals", "is_empty", "is_not_empty"}
ENUM_OPERATORS = {"equals", "not_equals", "is_empty", "is_not_empty", "in", "not_in"}
TEXT_FIELD_TYPES = {"text", "longtext", "markdown", "person", "reference", "auto-number"}


@dataclass(frozen=True)
class ResolvedFilter:
    field: dict[str, Any]
    field_key: str
    field_kind: str
    operator: str
    value: Any = None


def current_view_filter_payload(query_params) -> list[dict[str, Any]]:
    raw_filters = _param(query_params, "filters")
    if raw_filters in (None, ""):
        return []
    if isinstance(raw_filters, str):
        try:
            raw_filters = json.loads(raw_filters)
        except json.JSONDecodeError as exc:
            raise ValidationError({"filters": "must be a JSON list"}) from exc
    if not isinstance(raw_filters, list):
        raise ValidationError({"filters": "must be a list"})
    return [_normalize_filter(item) for item in raw_filters]


def current_view_has_filters(query_params) -> bool:
    return bool(current_view_filter_payload(query_params))


def apply_current_view_filters(
    records: list[CurrentViewRecord],
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
    query_params,
) -> list[CurrentViewRecord]:
    filters = resolve_current_view_filters(schema, fields_config, user, query_params)
    if not filters:
        return records
    return [
        record
        for record in records
        if _record_matches_filters(record, schema, fields_config, user, filters)
    ]


def resolve_current_view_filters(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
    query_params,
) -> list[ResolvedFilter]:
    filters = current_view_filter_payload(query_params)
    if not filters:
        return []
    fields = {
        field["key"]: field
        for field in fields_config
        if isinstance(field.get("key"), str)
    }
    return [
        _resolve_filter(schema, fields_config, fields, user, item)
        for item in filters
    ]


def _normalize_filter(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise ValidationError({"filters": "each filter must be an object"})
    field = item.get("field")
    operator = str(item.get("operator") or "")
    if not isinstance(field, str) or not field:
        raise ValidationError({"filters.field": "field is required"})
    if operator not in SUPPORTED_FILTER_OPERATORS:
        raise ValidationError({"filters.operator": "unsupported operator"})
    normalized = {"field": field, "operator": operator}
    if "value" in item:
        normalized["value"] = item["value"]
    return normalized


def _resolve_filter(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    fields: dict[str, dict[str, Any]],
    user: Any,
    item: dict[str, Any],
) -> ResolvedFilter:
    field_key = item["field"]
    field = fields.get(field_key)
    if field is None or not _field_is_filterable(schema, fields_config, field, user):
        raise ValidationError({"filters.field": "field does not exist"})
    kind = _field_filter_kind(field)
    operator = item["operator"]
    if operator not in _operators_for_kind(kind):
        raise ValidationError({"filters.operator": "unsupported operator for field"})
    value = None
    if operator in VALUE_OPERATORS:
        if "value" not in item:
            raise ValidationError({"filters.value": "value is required"})
        value = _coerce_filter_value(kind, operator, item["value"])
    return ResolvedFilter(
        field=field,
        field_key=field_key,
        field_kind=kind,
        operator=operator,
        value=value,
    )


def _field_is_filterable(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    field: dict[str, Any],
    user: Any,
) -> bool:
    return (
        not field.get("deprecated")
        and not field_is_system_hidden(field)
        and ordering_field_is_allowed(schema, fields_config, str(field.get("key")), user)
        and field.get("type") not in {"attachment", "image"}
    )


def _field_filter_kind(field: dict[str, Any]) -> str:
    field_type = str(field.get("type") or "")
    if field_type == "formula":
        validators = field.get("validators") if isinstance(field.get("validators"), dict) else {}
        result_type = str(validators.get("result_type") or "")
        if result_type in {"number", "date", "datetime", "boolean"}:
            return result_type
        return "text"
    if field_type in TEXT_FIELD_TYPES:
        return "text"
    if field_type in {"number", "date", "datetime", "boolean", "enum", "multi-enum"}:
        return field_type
    return "text"


def _operators_for_kind(kind: str) -> set[str]:
    if kind == "text":
        return TEXT_OPERATORS
    if kind in {"number", "date", "datetime"}:
        return SCALAR_OPERATORS
    if kind == "boolean":
        return BOOLEAN_OPERATORS
    if kind in {"enum", "multi-enum"}:
        return ENUM_OPERATORS
    return TEXT_OPERATORS


def _coerce_filter_value(kind: str, operator: str, value: Any) -> Any:
    if operator == "between":
        if not isinstance(value, list) or len(value) != 2:
            raise ValidationError({"filters.value": "between value must contain two values"})
        return (
            _coerce_scalar_value(kind, value[0]),
            _coerce_scalar_value(kind, value[1]),
        )
    if operator in {"in", "not_in"}:
        if not isinstance(value, list):
            raise ValidationError({"filters.value": "value must be a list"})
        return [_coerce_scalar_value(kind, item) for item in value]
    return _coerce_scalar_value(kind, value)


def _coerce_scalar_value(kind: str, value: Any) -> Any:
    if kind == "number":
        return _parse_decimal(value)
    if kind == "date":
        return _parse_date(value)
    if kind == "datetime":
        return _parse_datetime(value)
    if kind == "boolean":
        return _parse_bool(value)
    if value is None:
        raise ValidationError({"filters.value": "value is required"})
    return str(value)


def _record_matches_filters(
    record: CurrentViewRecord,
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    user: Any,
    filters: list[ResolvedFilter],
) -> bool:
    payload = serialize_data_payload(schema, fields_config, record.data_payload, user)
    return all(_matches_filter(payload.get(item.field_key), item) for item in filters)


def _matches_filter(value: Any, item: ResolvedFilter) -> bool:
    operator = item.operator
    if operator == "is_empty":
        return _is_empty_value(value)
    if operator == "is_not_empty":
        return not _is_empty_value(value)
    if item.field_kind == "multi-enum":
        return _matches_multi_value(value, operator, item.value)
    if item.field_kind == "text":
        return _matches_text_value(value, operator, item.value)
    if item.field_kind == "enum":
        return _matches_enum_value(value, operator, item.value)
    if item.field_kind == "number":
        return _matches_ordered_value(_parse_optional_decimal(value), operator, item.value)
    if item.field_kind == "date":
        return _matches_ordered_value(_parse_optional_date(value), operator, item.value)
    if item.field_kind == "datetime":
        return _matches_ordered_value(_parse_optional_datetime(value), operator, item.value)
    if item.field_kind == "boolean":
        return _matches_boolean_value(value, operator, item.value)
    return _matches_text_value(value, operator, item.value)


def _matches_text_value(value: Any, operator: str, expected: Any) -> bool:
    text = _string_value(value)
    expected_text = str(expected)
    if operator == "equals":
        return text.casefold() == expected_text.casefold()
    if operator == "not_equals":
        return text.casefold() != expected_text.casefold()
    if operator == "contains":
        return expected_text.casefold() in text.casefold()
    if operator == "starts_with":
        return text.casefold().startswith(expected_text.casefold())
    if operator == "in":
        return text.casefold() in {str(item).casefold() for item in expected}
    if operator == "not_in":
        return text.casefold() not in {str(item).casefold() for item in expected}
    return False


def _matches_enum_value(value: Any, operator: str, expected: Any) -> bool:
    current = _string_value(value)
    if operator == "equals":
        return current == str(expected)
    if operator == "not_equals":
        return current != str(expected)
    if operator == "in":
        return current in {str(item) for item in expected}
    if operator == "not_in":
        return current not in {str(item) for item in expected}
    return False


def _matches_multi_value(value: Any, operator: str, expected: Any) -> bool:
    values = {_string_value(item) for item in _list_value(value)}
    if operator == "equals":
        return str(expected) in values
    if operator == "not_equals":
        return str(expected) not in values
    expected_values = {str(item) for item in expected}
    if operator == "in":
        return bool(values & expected_values)
    if operator == "not_in":
        return not bool(values & expected_values)
    return False


def _matches_ordered_value(value: Any, operator: str, expected: Any) -> bool:
    if value is None:
        return operator == "not_equals"
    if operator == "equals":
        return value == expected
    if operator == "not_equals":
        return value != expected
    if operator == "greater_than":
        return value > expected
    if operator == "greater_than_or_equal":
        return value >= expected
    if operator == "less_than":
        return value < expected
    if operator == "less_than_or_equal":
        return value <= expected
    if operator == "between":
        start, end = expected
        return start <= value <= end
    if operator == "in":
        return value in expected
    if operator == "not_in":
        return value not in expected
    return False


def _matches_boolean_value(value: Any, operator: str, expected: bool) -> bool:
    parsed = _parse_optional_bool(value)
    if parsed is None:
        return operator == "not_equals"
    if operator == "equals":
        return parsed is expected
    if operator == "not_equals":
        return parsed is not expected
    return False


def _is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, list | tuple | set | dict):
        return len(value) == 0
    return False


def _list_value(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, ""):
        return []
    return [value]


def _string_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _parse_decimal(value: Any) -> Decimal:
    if value in (None, "") or isinstance(value, bool):
        raise ValidationError({"filters.value": "must be a number"})
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError({"filters.value": "must be a number"}) from exc


def _parse_optional_decimal(value: Any) -> Decimal | None:
    if _is_empty_value(value) or isinstance(value, bool):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _parse_date(value: Any) -> dt.date:
    if value in (None, ""):
        raise ValidationError({"filters.value": "must be YYYY-MM-DD"})
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError({"filters.value": "must be YYYY-MM-DD"}) from exc


def _parse_optional_date(value: Any) -> dt.date | None:
    if _is_empty_value(value):
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError:
        return None


def _parse_datetime(value: Any) -> dt.datetime:
    if value in (None, ""):
        raise ValidationError({"filters.value": "must be an ISO datetime"})
    if isinstance(value, dt.datetime):
        return value
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError({"filters.value": "must be an ISO datetime"}) from exc


def _parse_optional_datetime(value: Any) -> dt.datetime | None:
    if _is_empty_value(value):
        return None
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min)
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_bool(value: Any) -> bool:
    parsed = _parse_optional_bool(value)
    if parsed is None:
        raise ValidationError({"filters.value": "must be true or false"})
    return parsed


def _parse_optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return None
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _param(query_params, key: str) -> Any:
    value = query_params.get(key) if hasattr(query_params, "get") else None
    if isinstance(value, list):
        return value[-1] if value else None
    return value
