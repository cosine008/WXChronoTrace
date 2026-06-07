from __future__ import annotations

import datetime as dt
import re
from typing import Any

IDENTITY_CODE_FIELD_KEY = "__identity_code"
IDENTITY_CODE_FIELD_LABEL = "实体标识"
IDENTITY_CODE_MAX_LENGTH = 128
GENERATED_ENTITY_CODE_FIELD_KEY = "entity_code"
GENERATED_ENTITY_CODE_FIELD_LABEL = "实体编码"
AUTO_NUMBER_DEFAULT_PADDING = 6
AUTO_NUMBER_DEFAULT_START_SEQUENCE = 1
AUTO_NUMBER_VALIDATOR_KEYS = {"prefix", "padding", "start_sequence", "sequence_reset_period"}
DISPLAY_TEMPLATE_MAX_LENGTH = 256
DISPLAY_TEMPLATE_MISSING_VALUE = "—"
IDENTITY_MODES = {"single", "composite"}
SYSTEM_FIELD_KEYS = {IDENTITY_CODE_FIELD_KEY}
DISPLAY_TEMPLATE_RE = re.compile(r"\{([a-z_][a-z0-9_]*)\}")


class IdentityResolutionError(ValueError):
    def __init__(self, field_key: str, code: str, message: str) -> None:
        super().__init__(message)
        self.field_key = field_key
        self.code = code
        self.message = message


def build_composite_identity_code(values: list[object]) -> str:
    return "|".join(_escape_identity_part(str(value).strip()) for value in values)


def fill_composite_identity_code(data_after: dict[str, Any], field_keys: list[str]) -> str:
    parts = []
    for field_key in field_keys:
        value = data_after.get(field_key)
        text = "" if value is None else str(value).strip()
        if not text:
            raise IdentityResolutionError(field_key, "required", "组合实体标识字段必填")
        parts.append(text)
    code = build_composite_identity_code(parts)
    if len(code) > IDENTITY_CODE_MAX_LENGTH:
        raise IdentityResolutionError(
            IDENTITY_CODE_FIELD_KEY,
            "max_length",
            f"组合实体标识不能超过 {IDENTITY_CODE_MAX_LENGTH} 个字符",
        )
    data_after[IDENTITY_CODE_FIELD_KEY] = code
    return code


def resolve_business_code(schema: Any, data_after: dict[str, Any]) -> str:
    if schema_identity_mode(schema) == "composite":
        return fill_composite_identity_code(data_after, schema_identity_field_keys(schema))
    field_key = _schema_identity_field_key(schema)
    value = _required_identity_text(field_key, data_after.get(field_key), "实体标识必填")
    data_after[field_key] = value
    return value


def resolve_display_code(schema: Any, data_after: dict[str, Any]) -> str:
    template = schema_identity_display_template(schema)
    if template:
        return _render_display_template(schema, data_after, template)
    if schema_identity_mode(schema) != "composite":
        field_key = _schema_identity_field_key(schema)
        return _display_text(schema, field_key, data_after.get(field_key), "实体标识必填")
    parts = [
        _display_text(schema, field_key, data_after.get(field_key), "组合实体标识字段必填")
        for field_key in schema_identity_field_keys(schema)
    ]
    return " / ".join(parts)


def resolve_display_code_or_fallback(schema: Any, data_after: dict[str, Any], fallback: str) -> str:
    try:
        return resolve_display_code(schema, data_after)
    except IdentityResolutionError:
        return fallback


def apply_identity_display_template(schema: Any, template: str) -> list[dict]:
    normalized_template = validate_identity_display_template(schema, template)
    identity_key = _schema_identity_field_key(schema)
    fields = []
    identity_found = False
    for field in _schema_fields_config(schema):
        next_field = dict(field)
        if next_field.get("key") == identity_key:
            identity_found = True
            if normalized_template:
                next_field["identity_display_template"] = normalized_template
            else:
                next_field.pop("identity_display_template", None)
        fields.append(next_field)
    if not identity_found:
        raise IdentityResolutionError(
            "identity_display_template",
            "identity_field_missing",
            "实体标识字段必须存在",
        )
    return fields


def validate_identity_display_template(schema: Any, template: str) -> str:
    text = template.strip()
    if not text:
        return ""
    if len(text) > DISPLAY_TEMPLATE_MAX_LENGTH:
        raise IdentityResolutionError(
            "identity_display_template",
            "max_length",
            f"实体展示模板不能超过 {DISPLAY_TEMPLATE_MAX_LENGTH} 个字符",
        )

    field_keys = DISPLAY_TEMPLATE_RE.findall(text)
    if "{" in DISPLAY_TEMPLATE_RE.sub("", text) or "}" in DISPLAY_TEMPLATE_RE.sub("", text):
        raise IdentityResolutionError(
            "identity_display_template",
            "invalid_placeholder",
            "实体展示模板仅支持 {field_key} 格式的字段占位符",
        )
    if not field_keys:
        raise IdentityResolutionError(
            "identity_display_template",
            "field_required",
            "实体展示模板至少需要引用一个字段",
        )

    field_by_key = {
        str(field.get("key")): field
        for field in _schema_fields_config(schema)
        if isinstance(field.get("key"), str)
    }
    for field_key in field_keys:
        field = field_by_key.get(field_key)
        if field is None:
            raise IdentityResolutionError(
                "identity_display_template",
                "unknown_field",
                f"展示模板引用的字段不存在：{field_key}",
            )
        if field_is_system_hidden(field):
            raise IdentityResolutionError(
                "identity_display_template",
                "system_field",
                "展示模板不能引用系统隐藏字段",
            )
    return text


def ensure_identity_code_field(fields_config: list[dict], identity_field_keys: list[str]) -> list[dict]:
    fields = [field for field in fields_config if field.get("key") != IDENTITY_CODE_FIELD_KEY]
    return [
        *fields,
        {
            "key": IDENTITY_CODE_FIELD_KEY,
            "label": IDENTITY_CODE_FIELD_LABEL,
            "type": "text",
            "required": True,
            "indexed": True,
            "validators": {"max_length": IDENTITY_CODE_MAX_LENGTH},
            "hidden": True,
            "system": True,
            "identity_mode": "composite",
            "identity_field_keys": list(identity_field_keys),
        },
    ]


def generated_entity_code_field(schema_code: str, validators: dict | None = None) -> dict:
    return {
        "key": GENERATED_ENTITY_CODE_FIELD_KEY,
        "label": GENERATED_ENTITY_CODE_FIELD_LABEL,
        "type": "auto-number",
        "required": True,
        "indexed": True,
        "validators": auto_number_validators(schema_code, validators),
    }


def ensure_generated_entity_code_field(fields_config: list[dict], schema_code: str) -> list[dict]:
    existing = next(
        (field for field in fields_config if field.get("key") == GENERATED_ENTITY_CODE_FIELD_KEY),
        None,
    )
    validators = existing.get("validators") if isinstance(existing, dict) else None
    fields = [field for field in fields_config if field.get("key") != GENERATED_ENTITY_CODE_FIELD_KEY]
    return [generated_entity_code_field(schema_code, validators), *fields]


def identity_auto_number_field(schema: Any) -> dict | None:
    identity_key = _schema_identity_field_key(schema)
    for field in _schema_fields_config(schema):
        if field.get("key") == identity_key and field.get("type") == "auto-number":
            return field
    return None


def auto_number_validators(schema_code: str, validators: dict | None = None) -> dict:
    merged = {
        "prefix": default_auto_number_prefix(schema_code),
        "padding": AUTO_NUMBER_DEFAULT_PADDING,
        "start_sequence": AUTO_NUMBER_DEFAULT_START_SEQUENCE,
        "sequence_reset_period": "none",
    }
    if isinstance(validators, dict):
        merged.update({key: validators[key] for key in AUTO_NUMBER_VALIDATOR_KEYS if key in validators})
    return merged


def auto_number_start_sequence(field: dict) -> int:
    validators = field.get("validators") if isinstance(field.get("validators"), dict) else {}
    sequence = validators.get("start_sequence", AUTO_NUMBER_DEFAULT_START_SEQUENCE)
    return sequence if isinstance(sequence, int) and sequence > 0 else AUTO_NUMBER_DEFAULT_START_SEQUENCE


def auto_number_sequence_prefix(schema_code: str, field: dict, valid_from: object = None) -> str:
    validators = field.get("validators") if isinstance(field.get("validators"), dict) else {}
    prefix = validators.get("prefix")
    prefix = prefix if isinstance(prefix, str) else default_auto_number_prefix(schema_code)
    token = auto_number_period_token(valid_from, str(validators.get("sequence_reset_period") or "none"))
    return f"{prefix}{token}-" if token else prefix


def format_auto_number_value(
    schema_code: str, field: dict, sequence: int, valid_from: object = None
) -> str:
    validators = field.get("validators") if isinstance(field.get("validators"), dict) else {}
    prefix = auto_number_sequence_prefix(schema_code, field, valid_from)
    padding = validators.get("padding", AUTO_NUMBER_DEFAULT_PADDING)
    width = padding if isinstance(padding, int) and padding > 0 else 0
    suffix = str(sequence).zfill(width) if width else str(sequence)
    return f"{prefix}{suffix}"


def auto_number_period_token(valid_from: object, reset_period: str) -> str:
    if reset_period == "none":
        return ""
    date_value = _auto_number_date(valid_from)
    if reset_period == "year":
        return f"{date_value.year:04d}"
    if reset_period == "month":
        return f"{date_value.year:04d}-{date_value.month:02d}"
    if reset_period == "quarter":
        quarter = (date_value.month - 1) // 3 + 1
        return f"{date_value.year:04d}-Q{quarter}"
    return ""


def default_auto_number_prefix(schema_code: str) -> str:
    value = str(schema_code or "entity").strip().upper()
    return f"{value}-" if value else "ENTITY-"


def _auto_number_date(valid_from: object) -> dt.date:
    if isinstance(valid_from, dt.datetime):
        return valid_from.date()
    if isinstance(valid_from, dt.date):
        return valid_from
    if isinstance(valid_from, str):
        try:
            return dt.date.fromisoformat(valid_from[:10])
        except ValueError:
            pass
    return dt.date.today()


def validate_composite_identity_keys(fields_config: list[dict], field_keys: list[str]) -> None:
    if len(field_keys) < 2:
        raise IdentityResolutionError("identity_field_keys", "min_length", "组合实体标识至少需要两个字段")
    if len(field_keys) != len(set(field_keys)):
        raise IdentityResolutionError("identity_field_keys", "duplicate", "组合实体标识字段不能重复")
    field_key_set = {
        field["key"]
        for field in fields_config
        if isinstance(field.get("key"), str) and field.get("key") != IDENTITY_CODE_FIELD_KEY
    }
    missing = [field_key for field_key in field_keys if field_key not in field_key_set]
    if missing:
        raise IdentityResolutionError(missing[0], "missing", "组合实体标识字段必须存在")


def schema_identity_mode(schema: Any) -> str:
    return identity_mode_from_fields(_schema_identity_field_key(schema), _schema_fields_config(schema))


def schema_identity_field_keys(schema: Any) -> list[str]:
    return identity_field_keys_from_fields(_schema_identity_field_key(schema), _schema_fields_config(schema))


def schema_identity_display_template(schema: Any) -> str:
    direct = _schema_identity_display_template(schema)
    if direct:
        return direct
    identity_key = _schema_identity_field_key(schema)
    for field in _schema_fields_config(schema):
        if field.get("key") == identity_key:
            value = field.get("identity_display_template")
            return str(value).strip() if isinstance(value, str) and value.strip() else ""
    return ""


def identity_mode_from_fields(identity_field_key: str, fields_config: list[dict]) -> str:
    metadata = identity_code_field(fields_config)
    if (
        identity_field_key == IDENTITY_CODE_FIELD_KEY
        and metadata is not None
        and metadata.get("identity_mode") == "composite"
    ):
        return "composite"
    return "single"


def identity_field_keys_from_fields(identity_field_key: str, fields_config: list[dict]) -> list[str]:
    if identity_mode_from_fields(identity_field_key, fields_config) == "composite":
        metadata = identity_code_field(fields_config) or {}
        values = metadata.get("identity_field_keys")
        return [str(item) for item in values] if isinstance(values, list) else []
    return [identity_field_key] if identity_field_key else []


def identity_display_label(identity_field_key: str, fields_config: list[dict]) -> str:
    keys = identity_field_keys_from_fields(identity_field_key, fields_config)
    if identity_mode_from_fields(identity_field_key, fields_config) == "composite":
        return " + ".join(identity_field_label(fields_config, field_key) for field_key in keys)
    return identity_field_label(fields_config, identity_field_key)


def identity_field_label(fields_config: list[dict], field_key: str) -> str:
    for field in fields_config:
        if field.get("key") == field_key:
            return str(field.get("label") or field_key)
    return field_key


def identity_code_field(fields_config: list[dict]) -> dict | None:
    for field in fields_config:
        if field.get("key") == IDENTITY_CODE_FIELD_KEY:
            return field
    return None


def field_is_system_hidden(field: dict[str, Any]) -> bool:
    return bool(field.get("hidden") or field.get("system") or field.get("key") in SYSTEM_FIELD_KEYS)


def _schema_identity_field_key(schema: Any) -> str:
    if isinstance(schema, dict):
        return str(schema.get("identity_field_key") or "")
    return str(getattr(schema, "identity_field_key", "") or "")


def _schema_fields_config(schema: Any) -> list[dict]:
    if isinstance(schema, dict):
        fields = schema.get("fields_config")
    else:
        fields = getattr(schema, "fields_config", None)
    return fields if isinstance(fields, list) else []


def _schema_identity_display_template(schema: Any) -> str:
    if isinstance(schema, dict):
        value = schema.get("identity_display_template")
    else:
        value = getattr(schema, "identity_display_template", "")
    return str(value).strip() if isinstance(value, str) and value.strip() else ""


def _required_identity_text(field_key: str, value: Any, message: str) -> str:
    text = "" if value is None else str(value).strip()
    if not text:
        raise IdentityResolutionError(field_key, "required", message)
    return text


def _display_text(schema: Any, field_key: str, value: Any, message: str) -> str:
    has_display_value = isinstance(value, dict) and "display" in value
    if isinstance(value, dict) and "display" in value:
        value = value.get("display")
    text = _required_identity_text(field_key, value, message)
    field = _field_config(schema, field_key)
    if field.get("sensitive") and not has_display_value:
        return _masked_display_text(text, field)
    return text


def _render_display_template(schema: Any, data_after: dict[str, Any], template: str) -> str:
    def replacement(match: re.Match[str]) -> str:
        field_key = match.group(1)
        return _display_template_text(schema, field_key, data_after.get(field_key))

    rendered = DISPLAY_TEMPLATE_RE.sub(replacement, template).strip()
    if not rendered:
        raise IdentityResolutionError(_schema_identity_field_key(schema), "required", "实体展示码必填")
    return rendered


def _display_template_text(schema: Any, field_key: str, value: Any) -> str:
    has_display_value = isinstance(value, dict) and "display" in value
    if isinstance(value, dict) and "display" in value:
        value = value.get("display")
    text = "" if value is None else str(value).strip()
    if not text:
        return DISPLAY_TEMPLATE_MISSING_VALUE
    field = _field_config(schema, field_key)
    if field.get("sensitive") and not has_display_value:
        return _masked_display_text(text, field)
    return text


def _field_config(schema: Any, field_key: str) -> dict:
    for field in _schema_fields_config(schema):
        if field.get("key") == field_key:
            return field
    return {}


def _masked_display_text(value: str, field: dict[str, Any]) -> str:
    masking = field.get("masking") if isinstance(field.get("masking"), dict) else {}
    if masking.get("mode") == "partial" and value:
        return _partial_mask(value)
    return "***"


def _partial_mask(value: str) -> str:
    if len(value) <= 4:
        return "*" * len(value)
    prefix = value[:3]
    suffix = value[-4:] if len(value) > 7 else value[-1:]
    return f"{prefix}{'*' * max(3, len(value) - len(prefix) - len(suffix))}{suffix}"


def _escape_identity_part(value: str) -> str:
    return value.replace("\\", "\\\\").replace("|", "\\|")
