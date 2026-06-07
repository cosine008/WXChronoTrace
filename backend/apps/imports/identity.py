from __future__ import annotations

from apps.schemas.identity import (
    identity_display_label,
    identity_field_keys_from_fields,
    identity_field_label,
    identity_mode_from_fields,
)


def build_identity_diagnostics(field_key: str, fields_config: list[dict], rows: list[dict]) -> dict:
    mode = identity_mode_from_fields(field_key, fields_config)
    field_label = identity_display_label(field_key, fields_config)
    duplicate_values = duplicate_identity_values(rows)
    diagnostics = {
        "mode": mode,
        "status": "error" if duplicate_values else "ok",
        "identity_field_key": field_key,
        "identity_field_label": field_label,
        "message": identity_duplicate_message(field_label, mode) if duplicate_values else "",
        "duplicate_values": duplicate_values,
    }
    if mode == "composite":
        field_keys = identity_field_keys_from_fields(field_key, fields_config)
        diagnostics["identity_field_keys"] = field_keys
        diagnostics["identity_field_labels"] = [
            identity_field_label(fields_config, item) for item in field_keys
        ]
    return diagnostics

def duplicate_identity_value_set(identity_diagnostics: dict) -> set[str]:
    return {item["value"] for item in identity_diagnostics["duplicate_values"]}


def duplicate_identity_values(rows: list[dict]) -> list[dict]:
    row_numbers_by_value: dict[str, list[int]] = {}
    for row in rows:
        value = row["business_code"]
        if not value:
            continue
        row_numbers_by_value.setdefault(value, []).append(row["row_number"])
    return [
        {"value": value, "count": len(row_numbers), "row_numbers": row_numbers}
        for value, row_numbers in row_numbers_by_value.items()
        if len(row_numbers) > 1
    ]


def identity_duplicate_message(field_label: str, mode: str) -> str:
    if mode == "composite":
        return f"当前组合实体标识“{field_label}”存在重复值，组合后的实体标识必须唯一。请修正源数据或选择更稳定的组合字段。"
    return f"当前实体标识字段“{field_label}”存在重复值，{field_label}不适合作为实体标识。请选择员工号、证件号派生码、社保账号，或创建组合标识字段。"
