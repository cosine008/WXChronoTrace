from __future__ import annotations

import datetime as dt

from rest_framework.exceptions import ValidationError


def parse_date(value: object, *, field: str) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value[:10])
        except ValueError as exc:
            raise ValidationError({field: "日期格式必须是 YYYY-MM-DD"}) from exc
    raise ValidationError({field: "日期格式必须是 YYYY-MM-DD"})


def coerce_value(field: dict, value: object) -> object:
    field_type = field["type"]
    if field_type == "formula":
        raise ValidationError({field["key"]: "公式字段不能通过导入写入"})
    if field_type in {"attachment", "image"}:
        return _coerce_asset_ids(field, value)
    if value in (None, ""):
        return ""
    if field_type == "number":
        return float(value) if isinstance(value, str) and "." in value else value
    if field_type == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"true", "1", "yes", "on", "是"}
    if field_type == "multi-enum":
        return [item.strip() for item in str(value).replace("、", ",").split(",") if item.strip()]
    if field_type == "date" and isinstance(value, dt.date):
        return value.isoformat()
    if field_type == "datetime" and isinstance(value, dt.datetime):
        return value.isoformat()
    if field_type in {"person", "reference"}:
        try:
            return int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError({field["key"]: "必须是整数 ID"}) from exc
    return str(value).strip()


def _coerce_asset_ids(field: dict, value: object) -> list[int]:
    if value in (None, ""):
        return []
    if isinstance(value, list):
        raw_items = value
    else:
        raw_items = str(value).replace("、", ",").split(",")
    asset_ids = []
    for item in raw_items:
        if isinstance(item, dict):
            item = item.get("asset_id")
        try:
            parsed = int(str(item).strip())
        except (TypeError, ValueError) as exc:
            raise ValidationError({field["key"]: "附件字段必须填写已上传 asset id"}) from exc
        if parsed < 1:
            raise ValidationError({field["key"]: "附件字段必须填写已上传 asset id"})
        asset_ids.append(parsed)
    return asset_ids
