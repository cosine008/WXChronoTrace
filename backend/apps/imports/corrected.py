from __future__ import annotations

import json

from rest_framework.exceptions import ValidationError

from apps.schemas.identity import IdentityResolutionError, resolve_business_code
from apps.schemas.models import DataSchema
from apps.schemas.serializers import validation_issues
from apps.schemas.validation import FieldValidationError, validate_data_payload

from .coercion import parse_date


def preview_from_corrected_payload(schema: DataSchema, payload: dict) -> dict:
    rows = _json_rows(payload.get("rows_json"), "rows_json")
    missing = _json_rows(payload.get("missing_json", "[]"), "missing_json")
    rows = [_normalize_corrected_row(schema, row) for row in rows]
    missing = [_normalize_corrected_row(schema, row) for row in missing]
    return {
        "schema_id": schema.id,
        "at": "",
        "missing_policy": "custom",
        "mappings": [],
        "summary": _summary(rows, missing),
        "rows": rows,
        "missing": missing,
    }


def _json_rows(raw: object, field: str) -> list[dict]:
    if raw in (None, ""):
        return []
    try:
        rows = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError as exc:
        raise ValidationError({field: "必须是 JSON 数组"}) from exc
    if not isinstance(rows, list):
        raise ValidationError({field: "必须是 JSON 数组"})
    if not all(isinstance(row, dict) for row in rows):
        raise ValidationError({field: "数组元素必须是对象"})
    return rows


def _normalize_corrected_row(schema: DataSchema, row: dict) -> dict:
    action = row.get("action")
    if action not in {"create", "update", "terminate", "unchanged", "keep"}:
        raise ValidationError({"rows_json": "action 必须是 create/update/terminate/unchanged/keep"})
    if action in {"unchanged", "keep"}:
        return {**row, "errors": []}
    valid_from = parse_date(row.get("valid_from"), field="valid_from").isoformat()
    normalized = {**row, "valid_from": valid_from, "errors": []}
    if action in {"create", "update"}:
        data_after = row.get("data_after")
        if not isinstance(data_after, dict):
            raise ValidationError({"rows_json": "data_after 必须是对象"})
        try:
            normalized["business_code"] = resolve_business_code(schema, data_after)
        except IdentityResolutionError as exc:
            raise ValidationError({"rows_json": {exc.field_key: exc.message}}) from exc
        try:
            validate_data_payload(schema.fields_config, data_after)
        except FieldValidationError as exc:
            raise ValidationError({"rows_json": validation_issues(exc)}) from exc
        normalized["data_after"] = data_after
    return normalized


def _summary(rows: list[dict], missing: list[dict]) -> dict[str, int]:
    counts = {action: 0 for action in ("create", "update", "invalid", "unchanged")}
    for row in rows:
        counts[row["action"]] = counts.get(row["action"], 0) + 1
    return {
        "create": counts.get("create", 0),
        "update": counts.get("update", 0),
        "missing": len(missing),
        "invalid": counts.get("invalid", 0),
        "unchanged": counts.get("unchanged", 0),
    }
