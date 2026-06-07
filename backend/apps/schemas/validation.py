import datetime as dt
import re
from collections.abc import Mapping

from .field_types import PRESET_REGEXES, validate_field_value
from .formulas import (
    ALLOWED_RESULT_TYPES,
    FormulaError,
    formula_dependencies,
    validate_formula_expression,
)
from .identity import SYSTEM_FIELD_KEYS, field_is_system_hidden
from .models import DataSchema
from .validation_errors import FieldValidationError, ValidationIssue, issue

FIELD_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
SUPPORTED_FIELD_TYPES = {
    "text",
    "longtext",
    "markdown",
    "number",
    "date",
    "datetime",
    "boolean",
    "enum",
    "multi-enum",
    "person",
    "reference",
    "auto-number",
    "attachment",
    "image",
    "formula",
}
ALLOWED_VALIDATORS = {
    "text": {"min_length", "max_length", "regex"},
    "longtext": {"min_length", "max_length"},
    "markdown": {"min_length", "max_length"},
    "number": {"min", "max", "decimals", "positive_only"},
    "date": {"min_date", "max_date", "not_future", "not_past"},
    "datetime": {"min_date", "max_date", "not_future", "not_past"},
    "boolean": set(),
    "enum": {"options"},
    "multi-enum": {"options", "min_count", "max_count"},
    "person": {"must_be_active"},
    "reference": {"target_schema", "filter"},
    "auto-number": {"prefix", "padding", "start_sequence", "sequence_reset_period"},
    "attachment": {"max_files", "max_file_size", "allowed_extensions"},
    "image": {"max_files", "max_file_size", "allowed_extensions"},
    "formula": {"expression", "result_type", "precision"},
}
RESET_PERIODS = {"none", "month", "quarter", "year"}
MASKING_MODES = {"full", "partial", "none"}
MASKING_ROLES = {"admin", "owner", "editor", "viewer"}
EXTENSION_RE = re.compile(r"^[a-z0-9]+$")


def validate_fields_config(fields_config: object) -> list[dict]:
    issues: list[ValidationIssue] = []
    if not isinstance(fields_config, list):
        raise FieldValidationError([issue("fields_config", "type", "必须是字段配置数组")])

    normalized = []
    seen_keys: set[str] = set()
    indexed_count = 0
    for index, raw_field in enumerate(fields_config):
        path = f"fields_config[{index}]"
        if not isinstance(raw_field, Mapping):
            issues.append(issue(path, "type", "字段配置必须是对象"))
            continue

        field = dict(raw_field)
        key = field.get("key")
        field_type = field.get("type")
        validators = field.get("validators", {})
        normalized_field = _normalize_field(field)
        normalized.append(normalized_field)

        issues.extend(_validate_basic_field_shape(path, key, field.get("label"), field_type))
        issues.extend(_validate_common_field_shape(path, field))
        if isinstance(key, str):
            if key in seen_keys:
                issues.append(issue(f"{path}.key", "duplicate_key", "字段 key 不能重复"))
            seen_keys.add(key)
        if field_type not in SUPPORTED_FIELD_TYPES:
            continue
        if not isinstance(validators, Mapping):
            issues.append(issue(f"{path}.validators", "type", "validators 必须是对象"))
            continue
        if normalized_field["indexed"] and not field_is_system_hidden(normalized_field):
            indexed_count += 1
        issues.extend(_validate_validator_config(path, field_type, dict(validators)))

    if indexed_count > 5:
        issues.append(issue("fields_config", "indexed_limit", "单表 indexed 字段不能超过 5 个"))
    issues.extend(_validate_formula_references(normalized))
    if issues:
        raise FieldValidationError(issues)
    return normalized


def validate_data_payload(fields_config: object, data_payload: object) -> dict:
    fields = validate_fields_config(fields_config)
    if not isinstance(data_payload, dict):
        raise FieldValidationError([issue("data_payload", "type", "必须是对象")])

    issues: list[ValidationIssue] = []
    field_by_key = {field["key"]: field for field in fields}
    for key in data_payload:
        if key not in field_by_key:
            issues.append(issue(f"data_payload.{key}", "unknown_field", "字段不在 fields_config 中"))
        elif field_by_key[key]["type"] == "formula":
            issues.append(issue(f"data_payload.{key}", "formula_readonly", "公式字段不能写入"))

    for key, field in field_by_key.items():
        if field["type"] == "formula":
            continue
        value = data_payload.get(key)
        path = f"data_payload.{key}"
        if value is None or (field["required"] and value == ""):
            if field["required"]:
                issues.append(issue(path, "required", "必填字段不能为空"))
            continue
        if key not in data_payload:
            continue
        issues.extend(validate_field_value(field, value, path))

    if issues:
        raise FieldValidationError(issues)
    return data_payload


def _normalize_field(field: dict) -> dict:
    validators = field.get("validators", {})
    if not isinstance(validators, Mapping):
        validators = {}
    return {
        **field,
        "required": field.get("required", False),
        "indexed": field.get("indexed", False),
        "deprecated": field.get("deprecated", False),
        "sensitive": field.get("sensitive", False),
        "masking": dict(field.get("masking", {})) if isinstance(field.get("masking", {}), Mapping) else {},
        "validators": dict(validators),
        "introduced_in_version": field.get("introduced_in_version", 1),
    }


def _validate_basic_field_shape(
    path: str, key: object, label: object, field_type: object
) -> list[ValidationIssue]:
    issues = []
    if not isinstance(key, str) or not _valid_field_key(key):
        issues.append(issue(f"{path}.key", "key_format", "key 必须是小写 snake_case 标识符"))
    if not isinstance(label, str) or not label.strip():
        issues.append(issue(f"{path}.label", "label", "label 必须是非空字符串"))
    if field_type not in SUPPORTED_FIELD_TYPES:
        issues.append(issue(f"{path}.type", "unsupported_type", "不支持的字段类型"))
    return issues


def _validate_common_field_shape(path: str, field: dict) -> list[ValidationIssue]:
    issues = []
    for name in ("required", "indexed", "deprecated"):
        if name in field and not isinstance(field[name], bool):
            issues.append(issue(f"{path}.{name}", name, f"{name} 必须是布尔值"))
    if "sensitive" in field and not isinstance(field["sensitive"], bool):
        issues.append(issue(f"{path}.sensitive", "sensitive", "sensitive 必须是布尔值"))
    issues.extend(_validate_masking_config(path, field.get("masking")))

    introduced = field.get("introduced_in_version", 1)
    deprecated = field.get("deprecated_in_version")
    if not _is_positive_int(introduced):
        issues.append(issue(f"{path}.introduced_in_version", "introduced_in_version", "必须是正整数"))
    if deprecated is not None:
        if not _is_positive_int(deprecated):
            issues.append(issue(f"{path}.deprecated_in_version", "deprecated_in_version", "必须是正整数"))
        elif _is_positive_int(introduced) and deprecated < introduced:
            issues.append(issue(f"{path}.deprecated_in_version", "deprecated_in_version", "不能早于引入版本"))
    if field.get("type") == "formula":
        if field.get("required") is True:
            issues.append(issue(f"{path}.required", "formula_required", "公式字段不能设置为必填"))
        if field.get("indexed") is True:
            issues.append(issue(f"{path}.indexed", "formula_indexed", "公式字段不能设置为索引"))
    return issues


def _validate_validator_config(path: str, field_type: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    allowed = ALLOWED_VALIDATORS[field_type]
    for name in validators:
        if name not in allowed:
            issues.append(issue(f"{path}.validators.{name}", "unknown_validator", "不支持的校验器"))
    issues.extend(_validate_common_flags(path, field_type, validators))
    if field_type in {"text", "longtext", "markdown"}:
        issues.extend(_validate_lengths(path, validators))
    elif field_type == "number":
        issues.extend(_validate_number_config(path, validators))
    elif field_type in {"date", "datetime"}:
        issues.extend(_validate_date_config(path, validators))
    elif field_type in {"enum", "multi-enum"}:
        issues.extend(_validate_options(path, validators))
        if field_type == "multi-enum":
            issues.extend(_validate_counts(path, validators))
    elif field_type == "reference":
        issues.extend(_validate_reference_config(path, validators))
    elif field_type == "auto-number":
        issues.extend(_validate_auto_number_config(path, validators))
    elif field_type in {"attachment", "image"}:
        issues.extend(_validate_file_config(path, validators, image=field_type == "image"))
    elif field_type == "formula":
        issues.extend(_validate_formula_config(path, validators))
    return issues


def _validate_masking_config(path: str, masking: object) -> list[ValidationIssue]:
    if masking in (None, {}):
        return []
    if not isinstance(masking, Mapping):
        return [issue(f"{path}.masking", "masking", "masking 必须是对象")]
    issues = []
    mode = masking.get("mode")
    if mode is not None and mode not in MASKING_MODES:
        issues.append(issue(f"{path}.masking.mode", "masking_mode", "不支持的脱敏模式"))
    roles = masking.get("visible_roles")
    if roles is not None:
        if not isinstance(roles, list) or not roles:
            issues.append(issue(f"{path}.masking.visible_roles", "masking_roles", "visible_roles 必须是非空数组"))
        else:
            for role in roles:
                if role not in MASKING_ROLES:
                    issues.append(issue(f"{path}.masking.visible_roles", "masking_role", "不支持的可见角色"))
    return issues


def _validate_common_flags(path: str, field_type: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    for name in ("not_future", "not_past", "positive_only", "must_be_active"):
        if name in validators and not isinstance(validators[name], bool):
            issues.append(issue(f"{path}.validators.{name}", "type", f"{name} 必须是布尔值"))
    if field_type == "text" and validators.get("regex") not in (None, *PRESET_REGEXES):
        issues.append(issue(f"{path}.validators.regex", "regex", "regex 仅支持 email 或 phone"))
    return issues


def _validate_lengths(path: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    for name in ("min_length", "max_length"):
        if name in validators and not _is_non_negative_int(validators[name]):
            issues.append(issue(f"{path}.validators.{name}", "type", f"{name} 必须是非负整数"))
    min_length = validators.get("min_length")
    max_length = validators.get("max_length")
    if isinstance(min_length, int) and isinstance(max_length, int) and min_length > max_length:
        issues.append(issue(f"{path}.validators.max_length", "range", "max_length 不能小于 min_length"))
    return issues


def _validate_number_config(path: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    for name in ("min", "max"):
        if name in validators and not _is_number(validators[name]):
            issues.append(issue(f"{path}.validators.{name}", "type", f"{name} 必须是数字"))
    decimals = validators.get("decimals")
    if decimals is not None and not _is_non_negative_int(decimals):
        issues.append(issue(f"{path}.validators.decimals", "type", "decimals 必须是非负整数"))
    min_value = validators.get("min")
    max_value = validators.get("max")
    if (
        isinstance(min_value, int | float)
        and isinstance(max_value, int | float)
        and min_value > max_value
    ):
        issues.append(issue(f"{path}.validators.max", "range", "max 不能小于 min"))
    return issues


def _validate_date_config(path: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    for name in ("min_date", "max_date"):
        if name in validators and _parse_config_date(validators[name]) is None:
            issues.append(issue(f"{path}.validators.{name}", "date", f"{name} 必须是 ISO 日期"))
    return issues


def _parse_config_date(value: object) -> dt.date | None:
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _validate_options(path: str, validators: dict) -> list[ValidationIssue]:
    options = validators.get("options")
    if not isinstance(options, list) or not options or not all(isinstance(item, str) for item in options):
        return [issue(f"{path}.validators.options", "options", "options 必须是非空字符串数组")]
    if len(options) != len(set(options)):
        return [issue(f"{path}.validators.options", "duplicate_option", "options 不能重复")]
    return []


def _validate_counts(path: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    for name in ("min_count", "max_count"):
        if name in validators and not _is_non_negative_int(validators[name]):
            issues.append(issue(f"{path}.validators.{name}", "type", f"{name} 必须是非负整数"))
    min_count = validators.get("min_count")
    max_count = validators.get("max_count")
    if isinstance(min_count, int) and isinstance(max_count, int) and min_count > max_count:
        issues.append(issue(f"{path}.validators.max_count", "range", "max_count 不能小于 min_count"))
    return issues


def _validate_reference_config(path: str, validators: dict) -> list[ValidationIssue]:
    target_schema = validators.get("target_schema")
    if not isinstance(target_schema, str) or not target_schema:
        return [issue(f"{path}.validators.target_schema", "target_schema", "target_schema 必填")]
    if not DataSchema.objects.filter(schema_code=target_schema).exists():
        return [issue(f"{path}.validators.target_schema", "reference_target_missing", "目标表不存在")]
    return []


def _validate_auto_number_config(path: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    if "prefix" in validators and not isinstance(validators["prefix"], str):
        issues.append(issue(f"{path}.validators.prefix", "type", "prefix 必须是字符串"))
    if "padding" in validators and not _is_non_negative_int(validators["padding"]):
        issues.append(issue(f"{path}.validators.padding", "type", "padding 必须是非负整数"))
    if "start_sequence" in validators and not _is_positive_int(validators["start_sequence"]):
        issues.append(issue(f"{path}.validators.start_sequence", "type", "start_sequence 必须是正整数"))
    period = validators.get("sequence_reset_period")
    if period is not None and period not in RESET_PERIODS:
        issues.append(issue(f"{path}.validators.sequence_reset_period", "sequence_reset_period", "非法重置周期"))
    return issues


def _validate_file_config(path: str, validators: dict, *, image: bool) -> list[ValidationIssue]:
    issues = []
    max_files = validators.get("max_files")
    if max_files is not None and not _is_positive_int(max_files):
        issues.append(issue(f"{path}.validators.max_files", "max_files", "max_files 必须是正整数"))
    max_file_size = validators.get("max_file_size")
    if max_file_size is not None and not _is_positive_int(max_file_size):
        issues.append(issue(f"{path}.validators.max_file_size", "max_file_size", "max_file_size 必须是正整数"))
    extensions = validators.get("allowed_extensions")
    if extensions is None:
        return issues
    if not isinstance(extensions, list) or not extensions:
        return [*issues, issue(f"{path}.validators.allowed_extensions", "allowed_extensions", "allowed_extensions 必须是非空数组")]
    for extension in extensions:
        if not isinstance(extension, str) or not EXTENSION_RE.fullmatch(extension):
            issues.append(issue(f"{path}.validators.allowed_extensions", "extension_format", "扩展名只能包含小写字母和数字且不能带点"))
    if len(extensions) != len(set(extensions)):
        issues.append(issue(f"{path}.validators.allowed_extensions", "duplicate_extension", "扩展名不能重复"))
    if image and not set(extensions) <= {"jpg", "jpeg", "png", "gif", "webp", "svg"}:
        issues.append(issue(f"{path}.validators.allowed_extensions", "image_extension", "图片字段只允许常见图片扩展名"))
    return issues


def _validate_formula_config(path: str, validators: dict) -> list[ValidationIssue]:
    issues = []
    expression = validators.get("expression")
    if not isinstance(expression, str) or not expression.strip():
        issues.append(issue(f"{path}.validators.expression", "formula_expression", "公式表达式必填"))
    else:
        try:
            validate_formula_expression(expression)
        except FormulaError:
            issues.append(issue(f"{path}.validators.expression", "formula_syntax", "公式表达式不合法"))
    result_type = validators.get("result_type", "text")
    if result_type not in ALLOWED_RESULT_TYPES:
        issues.append(issue(f"{path}.validators.result_type", "formula_result_type", "不支持的公式结果类型"))
    precision = validators.get("precision")
    if precision is not None and not _is_non_negative_int(precision):
        issues.append(issue(f"{path}.validators.precision", "formula_precision", "precision 必须是非负整数"))
    return issues


def _validate_formula_references(fields: list[dict]) -> list[ValidationIssue]:
    field_types = {field.get("key"): field.get("type") for field in fields}
    issues = []
    for index, field in enumerate(fields):
        if field.get("type") != "formula":
            continue
        expression = (field.get("validators") or {}).get("expression")
        if not isinstance(expression, str):
            continue
        try:
            dependencies = formula_dependencies(expression)
        except FormulaError:
            continue
        for dependency in sorted(dependencies):
            if dependency not in field_types or field_types[dependency] == "formula":
                issues.append(
                    issue(
                        f"fields_config[{index}].validators.expression",
                        "formula_reference",
                        "公式只能引用非公式字段",
                    )
                )
    return issues


def _is_non_negative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _valid_field_key(key: str) -> bool:
    return bool(FIELD_KEY_RE.fullmatch(key) or key in SYSTEM_FIELD_KEYS)
