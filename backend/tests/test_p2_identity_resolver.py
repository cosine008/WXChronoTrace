from types import SimpleNamespace

import pytest

from apps.schemas.identity import (
    IDENTITY_CODE_FIELD_KEY,
    IdentityResolutionError,
    apply_identity_display_template,
    ensure_identity_code_field,
    resolve_business_code,
    resolve_display_code,
)


def test_resolve_business_code_normalizes_single_identity_value():
    schema = SimpleNamespace(identity_field_key="asset_no", fields_config=[])
    data_after = {"asset_no": " A-001 "}

    assert resolve_business_code(schema, data_after) == "A-001"
    assert data_after["asset_no"] == "A-001"
    assert resolve_display_code(schema, data_after) == "A-001"


def test_resolve_business_code_supports_system_code_identity_value():
    schema = SimpleNamespace(identity_field_key="system_code", fields_config=[])
    data_after = {"system_code": " asset_list-ROW-000001 "}

    assert resolve_business_code(schema, data_after) == "asset_list-ROW-000001"
    assert data_after["system_code"] == "asset_list-ROW-000001"
    assert resolve_display_code(schema, data_after) == "asset_list-ROW-000001"


def test_resolve_business_code_and_display_code_support_composite_identity():
    fields_config = ensure_identity_code_field(
        [
            {"key": "company_code", "label": "公司编码", "type": "text"},
            {"key": "employee_no", "label": "员工号", "type": "text"},
        ],
        ["company_code", "employee_no"],
    )
    schema = SimpleNamespace(identity_field_key=IDENTITY_CODE_FIELD_KEY, fields_config=fields_config)
    data_after = {"company_code": " C|01 ", "employee_no": r" E\001 "}

    assert resolve_business_code(schema, data_after) == r"C\|01|E\\001"
    assert data_after[IDENTITY_CODE_FIELD_KEY] == r"C\|01|E\\001"
    assert resolve_display_code(schema, data_after) == r"C|01 / E\001"


def test_resolve_display_code_uses_masked_display_values():
    fields_config = ensure_identity_code_field(
        [
            {"key": "company_code", "label": "公司编码", "type": "text"},
            {"key": "employee_no", "label": "员工号", "type": "text", "sensitive": True},
        ],
        ["company_code", "employee_no"],
    )
    schema = SimpleNamespace(identity_field_key=IDENTITY_CODE_FIELD_KEY, fields_config=fields_config)

    assert (
        resolve_display_code(
            schema,
            {
                "company_code": "C01",
                "employee_no": {"kind": "masked", "display": "E***1"},
            },
        )
        == "C01 / E***1"
    )


def test_resolve_display_code_masks_raw_sensitive_identity_values():
    schema = SimpleNamespace(
        identity_field_key="id_no",
        fields_config=[
            {
                "key": "id_no",
                "label": "身份证号",
                "type": "text",
                "sensitive": True,
                "masking": {"mode": "partial"},
            }
        ],
    )

    assert resolve_display_code(schema, {"id_no": "110105199001011234"}) == "110***********1234"


def test_resolve_display_code_supports_identity_display_template():
    fields_config = ensure_identity_code_field(
        [
            {"key": "company_code", "label": "公司编码", "type": "text"},
            {"key": "employee_no", "label": "员工号", "type": "text"},
            {"key": "name", "label": "姓名", "type": "text"},
        ],
        ["company_code", "employee_no"],
    )
    fields_config[-1]["identity_display_template"] = "{employee_no} / {name} / {company_code}"
    schema = SimpleNamespace(identity_field_key=IDENTITY_CODE_FIELD_KEY, fields_config=fields_config)

    assert (
        resolve_display_code(
            schema,
            {"company_code": "C01", "employee_no": "E001", "name": "张伟"},
        )
        == "E001 / 张伟 / C01"
    )


def test_apply_identity_display_template_updates_identity_field_metadata():
    fields_config = [
        {"key": "employee_no", "label": "员工号", "type": "text"},
        {"key": "name", "label": "姓名", "type": "text"},
    ]
    schema = SimpleNamespace(identity_field_key="employee_no", fields_config=fields_config)

    updated = apply_identity_display_template(schema, "{employee_no} / {name}")

    assert updated[0]["identity_display_template"] == "{employee_no} / {name}"
    assert "identity_display_template" not in updated[1]


def test_apply_identity_display_template_rejects_unknown_field_reference():
    schema = SimpleNamespace(
        identity_field_key="employee_no",
        fields_config=[{"key": "employee_no", "label": "员工号", "type": "text"}],
    )

    with pytest.raises(IdentityResolutionError) as exc:
        apply_identity_display_template(schema, "{employee_no} / {name}")

    assert exc.value.field_key == "identity_display_template"
    assert exc.value.code == "unknown_field"


def test_apply_identity_display_template_rejects_system_hidden_field_reference():
    fields_config = ensure_identity_code_field(
        [
            {"key": "company_code", "label": "公司编码", "type": "text"},
            {"key": "employee_no", "label": "员工号", "type": "text"},
        ],
        ["company_code", "employee_no"],
    )
    schema = SimpleNamespace(identity_field_key=IDENTITY_CODE_FIELD_KEY, fields_config=fields_config)

    with pytest.raises(IdentityResolutionError) as exc:
        apply_identity_display_template(schema, "{company_code} / {__identity_code}")

    assert exc.value.field_key == "identity_display_template"
    assert exc.value.code == "system_field"


def test_apply_identity_display_template_clears_existing_template():
    fields_config = [
        {
            "key": "employee_no",
            "label": "员工号",
            "type": "text",
            "identity_display_template": "{employee_no}",
        },
        {"key": "name", "label": "姓名", "type": "text"},
    ]
    schema = SimpleNamespace(identity_field_key="employee_no", fields_config=fields_config)

    updated = apply_identity_display_template(schema, " ")

    assert "identity_display_template" not in updated[0]


def test_resolve_display_code_masks_sensitive_template_fields():
    fields_config = [
        {"key": "employee_no", "label": "员工号", "type": "text"},
        {
            "key": "id_no",
            "label": "身份证号",
            "type": "text",
            "sensitive": True,
            "masking": {"mode": "partial"},
        },
    ]
    fields_config[0]["identity_display_template"] = "{employee_no} / {id_no}"
    schema = SimpleNamespace(identity_field_key="employee_no", fields_config=fields_config)

    assert (
        resolve_display_code(schema, {"employee_no": "E001", "id_no": "110105199001011234"})
        == "E001 / 110***********1234"
    )


def test_resolve_display_code_uses_placeholder_for_missing_template_fields():
    fields_config = [
        {"key": "employee_no", "label": "员工号", "type": "text"},
        {"key": "name", "label": "姓名", "type": "text"},
    ]
    fields_config[0]["identity_display_template"] = "{employee_no} / {name}"
    schema = SimpleNamespace(identity_field_key="employee_no", fields_config=fields_config)

    assert resolve_display_code(schema, {"employee_no": "E001"}) == "E001 / —"


def test_resolve_business_code_rejects_empty_identity_part():
    fields_config = ensure_identity_code_field(
        [
            {"key": "company_code", "label": "公司编码", "type": "text"},
            {"key": "employee_no", "label": "员工号", "type": "text"},
        ],
        ["company_code", "employee_no"],
    )
    schema = SimpleNamespace(identity_field_key=IDENTITY_CODE_FIELD_KEY, fields_config=fields_config)

    with pytest.raises(IdentityResolutionError) as exc:
        resolve_business_code(schema, {"company_code": "C01", "employee_no": ""})

    assert exc.value.field_key == "employee_no"
    assert exc.value.code == "required"
