from __future__ import annotations

import copy
from decimal import Decimal
from pathlib import Path
from typing import Any

from .formulas import FormulaError, evaluate_formula, formula_dependencies
from .models import DataSchema
from .permissions import get_schema_role

MaskedPayload = dict[str, str]


def can_view_field_value(user: Any, schema: DataSchema, field: dict[str, Any]) -> bool:
    if not field.get("sensitive", False):
        return True
    role = get_schema_role(user, schema)
    masking = field.get("masking") if isinstance(field.get("masking"), dict) else {}
    visible_roles = masking.get("visible_roles") or ["admin", "owner"]
    return role in visible_roles


def field_value_is_masked(user: Any, schema: DataSchema, field: dict[str, Any]) -> bool:
    return not can_view_field_value(user, schema, field)


def serialize_data_payload(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    data_payload: dict[str, Any] | None,
    user: Any,
) -> dict[str, Any]:
    raw_payload = copy.deepcopy(data_payload or {})
    rendered = _with_formula_values(schema, fields_config, raw_payload, user)
    rendered = _with_file_asset_values(schema, fields_config, rendered)
    for field in fields_config:
        key = field.get("key")
        if not isinstance(key, str) or key not in rendered:
            continue
        if field_value_is_masked(user, schema, field) or _formula_depends_on_masked_field(
            schema, fields_config, field, user
        ):
            rendered[key] = masked_value(rendered.get(key), field)
    return rendered


def _with_file_asset_values(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    payload: dict[str, Any],
) -> dict[str, Any]:
    rendered = copy.deepcopy(payload)
    file_fields = [
        field for field in fields_config if field.get("type") in {"attachment", "image"}
    ]
    if not file_fields:
        return rendered
    asset_ids = []
    for field in file_fields:
        value = rendered.get(field.get("key"))
        if not isinstance(value, list):
            continue
        asset_ids.extend(_asset_id(item) for item in value)
    asset_ids = [item for item in asset_ids if item is not None]
    if not asset_ids:
        return rendered

    from apps.temporal.models import FieldFileAsset

    assets = {
        asset.id: asset
        for asset in FieldFileAsset.objects.filter(schema=schema, pk__in=asset_ids)
    }
    for field in file_fields:
        key = field.get("key")
        value = rendered.get(key)
        if not isinstance(key, str) or not isinstance(value, list):
            continue
        rendered[key] = [
            _serialize_file_asset(assets[asset_id])
            for asset_id in (_asset_id(item) for item in value)
            if asset_id in assets
        ]
    return rendered


def _serialize_file_asset(asset: Any) -> dict[str, Any]:
    download_url = f"/api/v1/files/{asset.id}/download"
    preview_url = download_url if _is_image_asset(asset) else None
    return {
        "id": asset.id,
        "schema_id": asset.schema_id,
        "field_key": asset.field_key,
        "name": asset.original_name,
        "content_type": asset.content_type,
        "size": asset.size,
        "download_url": download_url,
        "preview_url": preview_url,
        "uploaded_by_id": asset.uploaded_by_id,
    }


def _asset_id(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, dict):
        asset_id = value.get("asset_id") or value.get("id")
        return asset_id if isinstance(asset_id, int) and not isinstance(asset_id, bool) else None
    return None


def _is_image_asset(asset: Any) -> bool:
    extension = Path(asset.original_name).suffix.lower().lstrip(".")
    return asset.content_type.startswith("image/") or extension in {"jpg", "jpeg", "png", "gif", "webp", "svg"}


def ordering_field_is_allowed(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    field_key: str,
    user: Any,
) -> bool:
    field = _field_by_key(fields_config).get(field_key)
    if field is None:
        return True
    if field_value_is_masked(user, schema, field):
        return False
    return not _formula_depends_on_masked_field(schema, fields_config, field, user)


def masked_value(value: Any, field: dict[str, Any]) -> MaskedPayload:
    masking = field.get("masking") if isinstance(field.get("masking"), dict) else {}
    mode = masking.get("mode", "full")
    if mode == "partial" and isinstance(value, str) and value:
        return {"kind": "masked", "display": _partial_mask(value)}
    return {"kind": "masked", "display": "***"}


def _with_formula_values(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    payload: dict[str, Any],
    user: Any,
) -> dict[str, Any]:
    rendered = copy.deepcopy(payload)
    for field in fields_config:
        if field.get("type") != "formula":
            continue
        key = field.get("key")
        if not isinstance(key, str):
            continue
        if _formula_depends_on_masked_field(schema, fields_config, field, user):
            rendered[key] = None
            continue
        validators = field.get("validators") if isinstance(field.get("validators"), dict) else {}
        value = evaluate_formula(str(validators.get("expression", "")), rendered)
        rendered[key] = _format_formula_value(value, validators)
    return rendered


def _format_formula_value(value: Any, validators: dict[str, Any]) -> Any:
    if value is None:
        return None
    if validators.get("result_type") == "number":
        precision = validators.get("precision")
        if isinstance(precision, int):
            return float(round(Decimal(str(value)), precision))
        if isinstance(value, Decimal):
            return int(value) if value == value.to_integral_value() else float(value)
    return value


def _formula_depends_on_masked_field(
    schema: DataSchema,
    fields_config: list[dict[str, Any]],
    formula_field: dict[str, Any],
    user: Any,
) -> bool:
    if formula_field.get("type") != "formula":
        return False
    validators = formula_field.get("validators") if isinstance(formula_field.get("validators"), dict) else {}
    expression = validators.get("expression")
    if not isinstance(expression, str):
        return False
    fields = _field_by_key(fields_config)
    try:
        dependencies = formula_dependencies(expression)
    except FormulaError:
        return False
    return any(
        dependency in fields and field_value_is_masked(user, schema, fields[dependency])
        for dependency in dependencies
    )


def _field_by_key(fields_config: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        field["key"]: field
        for field in fields_config
        if isinstance(field.get("key"), str)
    }


def _partial_mask(value: str) -> str:
    if len(value) <= 4:
        return "*" * len(value)
    prefix = value[:3]
    suffix = value[-4:] if len(value) > 7 else value[-1:]
    return f"{prefix}{'*' * max(3, len(value) - len(prefix) - len(suffix))}{suffix}"
