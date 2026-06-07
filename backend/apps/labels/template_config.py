from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from rest_framework.exceptions import ValidationError

from apps.schemas.identity import field_is_system_hidden

SUPPORTED_LABEL_TEMPLATE_CODES = ("asset_standard", "small", "document_cover")

DEFAULT_TEMPLATE_LABELS = {
    "asset_standard": "固定资产",
    "small": "小标签",
    "document_cover": "档案封面",
}

FIELD_LIMITS = {
    "asset_standard": 4,
    "small": 1,
    "document_cover": 8,
}

DEFAULT_TEMPLATE_SETTINGS = {
    "enabled": True,
    "field_keys": [],
    "show_display_code": True,
    "show_label_code": True,
    "show_qr": True,
    "show_barcode": True,
    "show_scan_url": True,
    "show_brand": True,
    "show_hint": True,
}


class LabelPrintConfigError(ValueError):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


@dataclass(frozen=True)
class ResolvedLabelTemplate:
    code: str
    label: str
    field_keys: tuple[str, ...]
    field_keys_configured: bool
    show_display_code: bool
    show_label_code: bool
    show_qr: bool
    show_barcode: bool
    show_scan_url: bool
    show_brand: bool
    show_hint: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "label": self.label,
            "field_keys": list(self.field_keys),
            "show_display_code": self.show_display_code,
            "show_label_code": self.show_label_code,
            "show_qr": self.show_qr,
            "show_barcode": self.show_barcode,
            "show_scan_url": self.show_scan_url,
            "show_brand": self.show_brand,
            "show_hint": self.show_hint,
        }


@dataclass(frozen=True)
class ResolvedLabelPrintConfig:
    default_template_code: str
    templates: dict[str, ResolvedLabelTemplate]

    @property
    def enabled_templates(self) -> list[ResolvedLabelTemplate]:
        return [self.templates[code] for code in SUPPORTED_LABEL_TEMPLATE_CODES if code in self.templates]

    def to_dict(self) -> dict[str, Any]:
        return {
            "default_template_code": self.default_template_code,
            "templates": {code: template.to_dict() for code, template in self.templates.items()},
        }


def resolve_label_print_config(schema, config: dict[str, Any] | None = None) -> ResolvedLabelPrintConfig:
    raw_config = config if config is not None else getattr(schema, "label_print_config", None)
    if not isinstance(raw_config, dict):
        raw_config = {}
    raw_templates = raw_config.get("templates")
    if not isinstance(raw_templates, dict):
        raw_templates = {}

    templates = {}
    for code in SUPPORTED_LABEL_TEMPLATE_CODES:
        template = _resolve_template(schema, code, raw_templates.get(code))
        if template is not None:
            templates[code] = template

    default_code = str(raw_config.get("default_template_code") or "asset_standard")
    if default_code not in SUPPORTED_LABEL_TEMPLATE_CODES:
        raise LabelPrintConfigError("default_template_code", "默认标签模板不存在")
    if default_code not in templates:
        raise LabelPrintConfigError("default_template_code", "默认标签模板必须启用")
    return ResolvedLabelPrintConfig(default_template_code=default_code, templates=templates)


def resolve_label_template(
    schema,
    template_code: str | None = None,
    config: dict[str, Any] | None = None,
) -> ResolvedLabelTemplate:
    resolved = resolve_label_print_config(schema, config)
    code = template_code or resolved.default_template_code
    if code == "a4_grid":
        code = resolved.default_template_code
    if code not in resolved.templates:
        raise LabelPrintConfigError("template_code", "标签模板未启用")
    return resolved.templates[code]


def normalized_label_print_config(schema, config: dict[str, Any]) -> dict[str, Any]:
    return resolve_label_print_config(schema, config).to_dict()


def label_print_config_hash(config: dict[str, Any]) -> str:
    encoded = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def label_print_config_validation_error(exc: LabelPrintConfigError) -> ValidationError:
    return ValidationError({exc.field: exc.message})


def _resolve_template(schema, code: str, raw_template: object) -> ResolvedLabelTemplate | None:
    if raw_template is None:
        raw_template = {}
    if not isinstance(raw_template, dict):
        raise LabelPrintConfigError("templates", "标签模板配置必须是对象")
    enabled = bool(raw_template.get("enabled", DEFAULT_TEMPLATE_SETTINGS["enabled"]))
    if not enabled:
        return None

    field_keys_configured = "field_keys" in raw_template
    field_keys = _field_keys(schema, code, raw_template.get("field_keys", []))
    return ResolvedLabelTemplate(
        code=code,
        label=str(raw_template.get("label") or DEFAULT_TEMPLATE_LABELS[code]),
        field_keys=tuple(field_keys),
        field_keys_configured=field_keys_configured,
        show_display_code=_bool_setting(raw_template, "show_display_code"),
        show_label_code=_bool_setting(raw_template, "show_label_code"),
        show_qr=_bool_setting(raw_template, "show_qr"),
        show_barcode=_bool_setting(raw_template, "show_barcode"),
        show_scan_url=_bool_setting(raw_template, "show_scan_url"),
        show_brand=_bool_setting(raw_template, "show_brand"),
        show_hint=_bool_setting(raw_template, "show_hint"),
    )


def _field_keys(schema, template_code: str, raw_field_keys: object) -> list[str]:
    if not isinstance(raw_field_keys, list):
        raise LabelPrintConfigError("field_keys", "打印字段必须是数组")
    fields_by_key = {
        field.get("key"): field
        for field in getattr(schema, "fields_config", [])
        if isinstance(field, dict) and isinstance(field.get("key"), str)
    }
    field_keys = []
    for field_key in raw_field_keys:
        if not isinstance(field_key, str) or field_key not in fields_by_key:
            raise LabelPrintConfigError("field_keys", "打印字段不存在")
        if field_is_system_hidden(fields_by_key[field_key]):
            raise LabelPrintConfigError("field_keys", "系统隐藏字段不可打印到物理标签")
        if fields_by_key[field_key].get("sensitive"):
            raise LabelPrintConfigError("field_keys", "敏感字段不可打印到物理标签")
        field_keys.append(field_key)
    if len(field_keys) > FIELD_LIMITS[template_code]:
        raise LabelPrintConfigError("field_keys", "打印字段数量超过模板上限")
    return field_keys


def _bool_setting(raw_template: dict[str, Any], key: str) -> bool:
    return bool(raw_template.get(key, DEFAULT_TEMPLATE_SETTINGS[key]))
