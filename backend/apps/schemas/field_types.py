import datetime as dt
import re
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.utils import timezone

from .validation_errors import ValidationIssue, issue

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^1[3-9]\d{9}$")
PRESET_REGEXES = {"email": EMAIL_RE, "phone": PHONE_RE}


def validate_field_value(field: dict, value: object, path: str) -> list[ValidationIssue]:
    field_type = field["type"]
    validators = field.get("validators", {})
    dispatch = {
        "text": _validate_text,
        "longtext": _validate_text,
        "markdown": _validate_text,
        "number": _validate_number,
        "date": _validate_date,
        "datetime": _validate_datetime,
        "boolean": _validate_boolean,
        "enum": _validate_enum,
        "multi-enum": _validate_multi_enum,
        "person": _validate_person,
        "reference": _validate_reference,
        "auto-number": _validate_auto_number,
        "attachment": _validate_asset_refs,
        "image": _validate_asset_refs,
    }
    return dispatch[field_type](value, validators, path)


def _validate_text(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    issues = []
    if not isinstance(value, str):
        return [issue(path, "type", "必须是字符串")]
    min_length = validators.get("min_length")
    max_length = validators.get("max_length")
    regex = validators.get("regex")
    if min_length is not None and len(value) < min_length:
        issues.append(issue(path, "min_length", f"长度不能小于 {min_length}"))
    if max_length is not None and len(value) > max_length:
        issues.append(issue(path, "max_length", f"长度不能大于 {max_length}"))
    if regex and not PRESET_REGEXES[regex].match(value):
        issues.append(issue(path, "regex", f"不符合预设格式 {regex}"))
    return issues


def _validate_number(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    if isinstance(value, bool):
        return [issue(path, "type", "必须是数字")]
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return [issue(path, "type", "必须是数字")]

    issues = []
    min_value = validators.get("min")
    max_value = validators.get("max")
    decimals = validators.get("decimals")
    if validators.get("positive_only") is True and number <= 0:
        issues.append(issue(path, "positive_only", "必须大于 0"))
    if min_value is not None and number < Decimal(str(min_value)):
        issues.append(issue(path, "min", f"不能小于 {min_value}"))
    if max_value is not None and number > Decimal(str(max_value)):
        issues.append(issue(path, "max", f"不能大于 {max_value}"))
    if decimals is not None and _decimal_places(number) > decimals:
        issues.append(issue(path, "decimals", f"小数位不能超过 {decimals}"))
    return issues


def _decimal_places(number: Decimal) -> int:
    exponent = number.as_tuple().exponent
    return abs(exponent) if exponent < 0 else 0


def _validate_date(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    parsed = _parse_date(value)
    if parsed is None:
        return [issue(path, "date", "必须是 ISO 日期")]

    issues = []
    min_date = _parse_date(validators.get("min_date"))
    max_date = _parse_date(validators.get("max_date"))
    today = timezone.localdate()
    if min_date and parsed < min_date:
        issues.append(issue(path, "min_date", f"不能早于 {min_date.isoformat()}"))
    if max_date and parsed > max_date:
        issues.append(issue(path, "max_date", f"不能晚于 {max_date.isoformat()}"))
    if validators.get("not_future") is True and parsed > today:
        issues.append(issue(path, "not_future", "不能是未来日期"))
    if validators.get("not_past") is True and parsed < today:
        issues.append(issue(path, "not_past", "不能是过去日期"))
    return issues


def _parse_date(value: object) -> dt.date | None:
    if value is None or isinstance(value, dt.datetime):
        return None
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _validate_datetime(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    parsed, parse_issue = _parse_datetime(value, path)
    if parse_issue:
        return [parse_issue]

    issues = []
    min_value = _parse_datetime_validator(validators.get("min_date"))
    max_value = _parse_datetime_validator(validators.get("max_date"))
    now = timezone.now()
    if min_value and parsed < min_value:
        issues.append(issue(path, "min_date", f"不能早于 {min_value.isoformat()}"))
    if max_value and parsed > max_value:
        issues.append(issue(path, "max_date", f"不能晚于 {max_value.isoformat()}"))
    if validators.get("not_future") is True and parsed > now:
        issues.append(issue(path, "not_future", "不能是未来时间"))
    if validators.get("not_past") is True and parsed < now:
        issues.append(issue(path, "not_past", "不能是过去时间"))
    return issues


def _parse_datetime(value: object, path: str) -> tuple[dt.datetime | None, ValidationIssue | None]:
    if isinstance(value, str):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None, issue(path, "datetime", "必须是 ISO UTC 时间")
    elif isinstance(value, dt.datetime):
        parsed = value
    else:
        return None, issue(path, "datetime", "必须是 ISO UTC 时间")

    if parsed.tzinfo is None or parsed.utcoffset() != dt.timedelta(0):
        return None, issue(path, "timezone", "必须包含 UTC 时区")
    return parsed, None


def _parse_datetime_validator(value: object) -> dt.datetime | None:
    if value is None:
        return None
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return dt.datetime.combine(value, dt.time.min, tzinfo=dt.UTC)
    if isinstance(value, dt.datetime):
        return value if value.tzinfo else value.replace(tzinfo=dt.UTC)
    if isinstance(value, str):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.UTC)
    return None


def _validate_boolean(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    if not isinstance(value, bool):
        return [issue(path, "type", "必须是布尔值")]
    return []


def _validate_enum(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    options = validators["options"]
    if not isinstance(value, str):
        return [issue(path, "type", "必须是字符串")]
    if value not in options:
        return [issue(path, "option", "不在可选项中")]
    return []


def _validate_multi_enum(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return [issue(path, "type", "必须是字符串数组")]

    issues = []
    options = validators["options"]
    min_count = validators.get("min_count")
    max_count = validators.get("max_count")
    if any(item not in options for item in value):
        issues.append(issue(path, "option", "存在不在可选项中的值"))
    if len(value) != len(set(value)):
        issues.append(issue(path, "duplicate_option", "不允许重复选项"))
    if min_count is not None and len(value) < min_count:
        issues.append(issue(path, "min_count", f"数量不能小于 {min_count}"))
    if max_count is not None and len(value) > max_count:
        issues.append(issue(path, "max_count", f"数量不能大于 {max_count}"))
    return issues


def _validate_person(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    if isinstance(value, bool) or not isinstance(value, int):
        return [issue(path, "type", "必须是用户 ID")]
    user_model = get_user_model()
    user = user_model.objects.filter(pk=value).first()
    if user is None:
        return [issue(path, "user_missing", "用户不存在")]
    profile = getattr(user, "profile", None)
    profile_active = True if profile is None else profile.is_active
    if validators.get("must_be_active") is True and (not user.is_active or not profile_active):
        return [issue(path, "inactive_user", "用户已停用或离职")]
    return []


def _validate_reference(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    if isinstance(value, bool) or not isinstance(value, int):
        return [issue(path, "type", "必须是实体 ID")]

    from apps.temporal.models import Entity

    entity = Entity.objects.select_related("schema").filter(pk=value).first()
    if entity is None:
        return [issue(path, "reference_missing", "引用实体不存在")]
    if entity.schema.schema_code != validators["target_schema"]:
        return [issue(path, "reference_schema", "引用实体不属于目标表")]
    return []


def _validate_auto_number(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    if not isinstance(value, str):
        return [issue(path, "type", "必须是字符串")]

    issues = []
    prefix = validators.get("prefix", "")
    suffix = value[len(prefix) :] if value.startswith(prefix) else value
    if prefix and not value.startswith(prefix):
        issues.append(issue(path, "prefix", f"必须以 {prefix} 开头"))
    sequence_suffix = _auto_number_sequence_suffix(suffix, validators)
    padding = validators.get("padding")
    if padding is not None and (not sequence_suffix.isdigit() or len(sequence_suffix) < padding):
        issues.append(issue(path, "padding", f"数字部分长度不能小于 {padding}"))
    return issues


def _auto_number_sequence_suffix(suffix: str, validators: dict) -> str:
    if validators.get("sequence_reset_period") in {"year", "month", "quarter"}:
        return suffix.rsplit("-", 1)[-1]
    return suffix


def _validate_asset_refs(value: object, validators: dict, path: str) -> list[ValidationIssue]:
    if not isinstance(value, list):
        return [issue(path, "asset_ref", "必须是附件资产 ID 数组")]
    issues = []
    max_files = validators.get("max_files")
    if isinstance(max_files, int) and len(value) > max_files:
        issues.append(issue(path, "max_files", f"附件数量不能超过 {max_files}"))
    for index, item in enumerate(value):
        if isinstance(item, bool):
            issues.append(issue(f"{path}[{index}]", "asset_ref", "附件资产 ID 必须是正整数"))
        elif isinstance(item, int):
            if item < 1:
                issues.append(issue(f"{path}[{index}]", "asset_ref", "附件资产 ID 必须是正整数"))
        elif isinstance(item, dict):
            asset_id = item.get("asset_id")
            if isinstance(asset_id, bool) or not isinstance(asset_id, int) or asset_id < 1:
                issues.append(issue(f"{path}[{index}].asset_id", "asset_ref", "附件资产 ID 必须是正整数"))
        else:
            issues.append(issue(f"{path}[{index}]", "asset_ref", "附件资产 ID 必须是正整数"))
    return issues
