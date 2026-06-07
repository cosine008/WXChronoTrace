from __future__ import annotations

import datetime as dt
import re
from collections import Counter
from typing import Any

from apps.schemas.identity import IDENTITY_CODE_FIELD_KEY
from apps.schemas.validation import FIELD_KEY_RE

SUPPORTED_INFER_TYPES = {"text", "longtext", "number", "date", "boolean", "enum"}
STABLE_IDENTITY_KEYWORDS = (
    "编号",
    "编码",
    "工号",
    "员工号",
    "单号",
    "证件号",
    "身份证",
    "社保",
    "资产号",
    "合同号",
    "asset_no",
    "employee_no",
)
NAME_IDENTITY_KEYWORDS = ("姓名", "名称", "name")
GROUP_IDENTITY_KEYWORDS = ("部门", "岗位", "职位", "dept", "department", "role")
STATE_IDENTITY_KEYWORDS = ("状态", "类型", "性别", "status", "type")
KEYWORD_KEYS = [
    ("资产编号", "asset_no"),
    ("资产号", "asset_no"),
    ("购买时间", "purchase_time"),
    ("负责人", "owner"),
    ("数量", "quantity"),
    ("金额", "amount"),
    ("价格", "amount"),
    ("状态", "status"),
    ("姓名", "name"),
    ("名称", "name"),
    ("工号", "employee_no"),
    ("单号", "order_no"),
    ("合同号", "contract_no"),
    ("编号", "code"),
    ("编码", "code"),
]
BOOLEAN_STRINGS = {"true", "false", "yes", "no", "1", "0", "是", "否", "启用", "停用"}


def infer_fields(headers: list[str], data_rows: list[dict]) -> list[dict]:
    fields = []
    used_keys: set[str] = set()
    for index, header in enumerate(headers, start=1):
        label = str(header).strip()
        if not label:
            continue
        values = [row["values"][index - 1] if index <= len(row["values"]) else None for row in data_rows]
        key = unique_key(key_from_label(label, index), used_keys)
        used_keys.add(key)
        fields.append(_field_draft(label, key, index, values))
    return mark_identity_candidates(fields)


def key_from_label(label: str, index: int = 1) -> str:
    for keyword, key in KEYWORD_KEYS:
        if keyword in label:
            return key
    ascii_key = _ascii_snake_case(label)
    if FIELD_KEY_RE.fullmatch(ascii_key):
        return ascii_key
    return f"field_{index}"


def unique_key(base: str, used_keys: set[str]) -> str:
    key = base if FIELD_KEY_RE.fullmatch(base) else "field"
    candidate = key
    suffix = 2
    while candidate in used_keys:
        candidate = f"{key}_{suffix}"
        suffix += 1
    return candidate


def recommend_identity_key(fields: list[dict]) -> str:
    candidates = sorted(fields, key=_identity_score, reverse=True)
    if candidates and _identity_score(candidates[0]) > 0:
        return candidates[0]["key"]
    return fields[0]["key"] if fields else ""


def mark_identity_candidates(fields: list[dict]) -> list[dict]:
    recommended = recommend_identity_key(fields)
    return [
        {
            **field,
            "identity_candidate": field["key"] == recommended,
            "identity_quality": identity_quality(field),
        }
        for field in fields
    ]


def schema_draft_from_payload(payload: dict, sheet_name: str, fields_config: list[dict]) -> dict:
    raw = payload.get("schema") if isinstance(payload.get("schema"), dict) else {}
    identity_mode = raw.get("identity_mode") or payload.get("identity_mode") or "single"
    identity_keys = _identity_field_keys(raw.get("identity_field_keys") or payload.get("identity_field_keys"))
    identity_key = _identity_field_key(payload, raw, fields_config, identity_mode)
    if identity_key and not _client_provided_fields(payload) and not _field_exists(identity_key, fields_config):
        identity_key = ""
    return {
        "schema_code": raw.get("schema_code") or key_from_label(sheet_name, 1),
        "name": raw.get("name") or sheet_name,
        "description": raw.get("description", ""),
        "icon": raw.get("icon", "table"),
        "temporal_mode": raw.get("temporal_mode", "continuous"),
        "period_unit": raw.get("period_unit"),
        "identity_mode": identity_mode,
        "identity_field_key": identity_key or recommend_identity_key(fields_config),
        "identity_field_keys": identity_keys,
        "visibility": raw.get("visibility", "private"),
        "approval_required": raw.get("approval_required", False),
        "fields_config": fields_config,
    }


def _identity_field_key(payload: dict, raw: dict, fields_config: list[dict], mode: str) -> str:
    if mode == "composite":
        return IDENTITY_CODE_FIELD_KEY
    identity_key = raw.get("identity_field_key") or payload.get("identity_field_key")
    return identity_key or recommend_identity_key(fields_config)


def _identity_field_keys(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str) and item]


def _client_provided_fields(payload: dict) -> bool:
    return isinstance(payload.get("fields_config") or payload.get("fields"), list)


def _field_exists(field_key: str, fields_config: list[dict]) -> bool:
    return any(field.get("key") == field_key for field in fields_config)


def _field_draft(label: str, key: str, source_index: int, values: list[Any]) -> dict:
    non_empty = [value for value in values if value not in (None, "")]
    total = len(values)
    unique_values = {str(value).strip() for value in non_empty}
    empty_rate = 0 if total == 0 else round((total - len(non_empty)) / total, 4)
    unique_rate = 0 if not non_empty else round(len(unique_values) / len(non_empty), 4)
    field_type = _infer_type(label, non_empty)
    return {
        "source_column": label,
        "source_index": source_index,
        "key": key,
        "label": label,
        "type": field_type,
        "required": total > 0 and empty_rate == 0,
        "indexed": False,
        "import": True,
        "empty_rate": empty_rate,
        "unique_rate": unique_rate,
        "samples": [str(value) for value in non_empty[:5]],
        "warnings": [],
        "validators": _validators_for(field_type, unique_values),
    }


def _infer_type(label: str, values: list[Any]) -> str:
    if not values:
        return "text"
    if _all_boolean(values):
        return "boolean"
    if _all_numbers(values):
        return "number"
    if _all_dates(values):
        return "date"
    if _is_long_text(values):
        return "longtext"
    if _is_enum(label, values):
        return "enum"
    return "text"


def _validators_for(field_type: str, values: set[str]) -> dict:
    if field_type == "enum":
        return {"options": sorted(values)}
    return {}


def _identity_score(field: dict) -> float:
    keyword_score = 1.5 if _is_stable_identity_field(field) else 0
    discouraged_penalty = 2 if _discouraged_identity_reason(field) else 0
    unique_score = float(field.get("unique_rate", 0))
    non_empty_score = 1 - float(field.get("empty_rate", 1))
    length_penalty = 0.5 if field.get("type") == "longtext" else 0
    return keyword_score + unique_score + non_empty_score - length_penalty - discouraged_penalty


def identity_quality(field: dict) -> dict:
    reasons = _identity_quality_reasons(field)
    discouraged = _discouraged_identity_reason(field)
    risky = _has_identity_quality_risk(field)
    stable = _is_stable_identity_field(field)
    if discouraged:
        level = "discouraged"
    elif risky:
        level = "risk"
    elif stable:
        level = "recommended"
    else:
        level = "neutral"
    if not reasons:
        reasons = ["需通过预览验证唯一性"]
    return {
        "level": level,
        "label": _identity_quality_label(level),
        "score": round(_identity_score(field), 4),
        "reasons": reasons,
    }


def _identity_quality_reasons(field: dict) -> list[str]:
    reasons = []
    discouraged = _discouraged_identity_reason(field)
    if discouraged:
        reasons.append(discouraged)
    if _is_stable_identity_field(field):
        reasons.append("稳定编号字段")
    if float(field.get("empty_rate", 0)) > 0:
        reasons.append("存在空值")
    if float(field.get("unique_rate", 0)) < 0.95:
        reasons.append("唯一率偏低")
    if field.get("type") in {"enum", "boolean"}:
        reasons.append("枚举/布尔字段重复概率高")
    if field.get("type") == "longtext":
        reasons.append("长文本不适合作为匹配码")
    return reasons


def _has_identity_quality_risk(field: dict) -> bool:
    return (
        float(field.get("empty_rate", 0)) > 0
        or float(field.get("unique_rate", 0)) < 0.95
        or field.get("type") in {"enum", "boolean", "longtext"}
    )


def _identity_quality_label(level: str) -> str:
    return {
        "recommended": "推荐",
        "neutral": "需确认",
        "risk": "风险",
        "discouraged": "不推荐",
    }[level]


def _is_stable_identity_field(field: dict) -> bool:
    return _contains_identity_keyword(field, STABLE_IDENTITY_KEYWORDS)


def _discouraged_identity_reason(field: dict) -> str:
    if _contains_identity_keyword(field, NAME_IDENTITY_KEYWORDS):
        return "姓名/名称容易重复"
    if _contains_identity_keyword(field, GROUP_IDENTITY_KEYWORDS):
        return "部门/岗位不适合作为实体标识"
    if _contains_identity_keyword(field, STATE_IDENTITY_KEYWORDS):
        return "状态/类型不适合作为实体标识"
    return ""


def _contains_identity_keyword(field: dict, keywords: tuple[str, ...]) -> bool:
    label = str(field.get("label") or field.get("source_column") or "")
    key = str(field.get("key") or "").lower()
    return any(keyword in label or keyword.lower() in key for keyword in keywords)


def _ascii_snake_case(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    text = re.sub(r"^[^a-z]+", "", text)
    return text


def _all_numbers(values: list[Any]) -> bool:
    return all(isinstance(value, int | float) and not isinstance(value, bool) for value in values)


def _all_boolean(values: list[Any]) -> bool:
    return all(isinstance(value, bool) or str(value).strip().lower() in BOOLEAN_STRINGS for value in values)


def _all_dates(values: list[Any]) -> bool:
    return all(_parse_date(value) is not None for value in values)


def _parse_date(value: Any) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
            try:
                return dt.datetime.strptime(value[:10], fmt).date()
            except ValueError:
                continue
    return None


def _is_long_text(values: list[Any]) -> bool:
    return any(len(str(value)) > 120 or "\n" in str(value) for value in values)


def _is_enum(label: str, values: list[Any]) -> bool:
    unique_count = len(Counter(str(value).strip() for value in values))
    if "状态" in label or "类型" in label:
        return 1 < unique_count <= 20
    return 1 < unique_count <= 12 and unique_count / len(values) <= 0.5
