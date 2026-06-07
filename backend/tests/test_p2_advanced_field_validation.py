import pytest
from rest_framework.exceptions import ValidationError

from apps.imports.coercion import coerce_value
from apps.imports.template import _example_value, _field_comment
from apps.schemas.validation import (
    FieldValidationError,
    validate_data_payload,
    validate_fields_config,
)


def issue_codes(error: FieldValidationError) -> set[str]:
    return {item.code for item in error.issues}


def test_validate_fields_config_accepts_advanced_types_and_masking():
    fields = validate_fields_config(
        [
            {
                "key": "quantity",
                "label": "Quantity",
                "type": "number",
            },
            {
                "key": "unit_price",
                "label": "Unit Price",
                "type": "number",
            },
            {
                "key": "contract_files",
                "label": "Contract Files",
                "type": "attachment",
                "validators": {
                    "max_files": 3,
                    "max_file_size": 1024,
                    "allowed_extensions": ["pdf", "docx"],
                },
            },
            {
                "key": "site_photos",
                "label": "Site Photos",
                "type": "image",
                "validators": {"max_files": 5, "allowed_extensions": ["jpg", "png"]},
            },
            {
                "key": "maintenance_note",
                "label": "Maintenance Note",
                "type": "markdown",
                "validators": {"max_length": 10000},
            },
            {
                "key": "total_cost",
                "label": "Total Cost",
                "type": "formula",
                "validators": {"expression": "quantity * unit_price", "result_type": "number"},
            },
            {
                "key": "id_card",
                "label": "ID Card",
                "type": "text",
                "sensitive": True,
                "masking": {"mode": "partial", "visible_roles": ["admin", "owner"]},
            },
        ]
    )

    assert [field["type"] for field in fields] == [
        "number",
        "number",
        "attachment",
        "image",
        "markdown",
        "formula",
        "text",
    ]
    assert fields[6]["sensitive"] is True
    assert fields[6]["masking"]["mode"] == "partial"
    assert fields[6]["masking"]["visible_roles"] == ["admin", "owner"]


def test_validate_fields_config_rejects_invalid_formula_and_file_config():
    fields = [
        {
            "key": "bad_files",
            "label": "Bad Files",
            "type": "attachment",
            "validators": {"max_files": 0, "allowed_extensions": ["pdf", ".exe"]},
        },
        {
            "key": "bad_formula",
            "label": "Bad Formula",
            "type": "formula",
            "required": True,
            "indexed": True,
            "validators": {"expression": "missing_field + 1", "result_type": "number"},
        },
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_fields_config(fields)

    assert {
        "max_files",
        "extension_format",
        "formula_required",
        "formula_indexed",
        "formula_reference",
    } <= issue_codes(exc.value)


def test_validate_fields_config_rejects_bad_masking_metadata():
    fields = [
        {
            "key": "secret",
            "label": "Secret",
            "type": "text",
            "sensitive": "yes",
            "masking": {"mode": "blur", "visible_roles": ["owner", "stranger"]},
        }
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_fields_config(fields)

    assert {"sensitive", "masking_mode", "masking_role"} <= issue_codes(exc.value)


def test_validate_data_payload_accepts_file_refs_and_rejects_formula_writes():
    fields = [
        {"key": "asset_no", "label": "Asset No", "type": "text", "required": True},
        {"key": "contract_files", "label": "Contract Files", "type": "attachment"},
        {
            "key": "maintenance_note",
            "label": "Maintenance Note",
            "type": "markdown",
            "validators": {"max_length": 80},
        },
        {
            "key": "total_cost",
            "label": "Total Cost",
            "type": "formula",
            "validators": {"expression": "1 + 2", "result_type": "number"},
        },
    ]

    assert validate_data_payload(
        fields,
        {
            "asset_no": "A-001",
            "contract_files": [1, {"asset_id": 2}],
            "maintenance_note": "## Check\n\n- replace filter",
        },
    )
    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload(fields, {"asset_no": "A-001", "total_cost": 3})
    assert "formula_readonly" in issue_codes(exc.value)


def test_validate_data_payload_rejects_markdown_over_max_length():
    fields = [
        {
            "key": "maintenance_note",
            "label": "Maintenance Note",
            "type": "markdown",
            "validators": {"max_length": 8},
        }
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload(fields, {"maintenance_note": "## too long"})

    assert "max_length" in issue_codes(exc.value)


def test_validate_data_payload_rejects_bad_file_ref_shapes():
    fields = [{"key": "contract_files", "label": "Contract Files", "type": "attachment"}]

    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload(fields, {"contract_files": [{"id": 1}, "bad"]})

    assert "asset_ref" in issue_codes(exc.value)


def test_import_coercion_rejects_formula_and_keeps_file_asset_ids():
    formula_field = {
        "key": "total_cost",
        "label": "Total Cost",
        "type": "formula",
        "validators": {"expression": "1 + 2", "result_type": "number"},
    }
    attachment_field = {"key": "contract_files", "label": "Contract Files", "type": "attachment"}
    markdown_field = {"key": "maintenance_note", "label": "Maintenance Note", "type": "markdown"}

    with pytest.raises(ValidationError):
        coerce_value(formula_field, "3")
    assert coerce_value(attachment_field, "1, 2") == [1, 2]
    assert coerce_value(markdown_field, "## Check\n\n- replace filter") == "## Check\n\n- replace filter"


def test_template_mentions_asset_ids_for_advanced_fields():
    attachment = {"key": "contract_files", "label": "Contract Files", "type": "attachment"}
    image = {"key": "site_photos", "label": "Site Photos", "type": "image"}
    markdown = {"key": "maintenance_note", "label": "Maintenance Note", "type": "markdown"}
    formula = {
        "key": "total_cost",
        "label": "Total Cost",
        "type": "formula",
        "validators": {"expression": "1 + 2", "result_type": "number"},
    }

    assert "asset id" in _field_comment(attachment, "asset_no").lower()
    assert "asset id" in _field_comment(image, "asset_no").lower()
    assert "computed" in _field_comment(formula, "asset_no").lower()
    assert _example_value(attachment) == "1,2"
    assert _example_value(image) == "1,2"
    assert _example_value(markdown).startswith("##")
    assert _example_value(formula) == ""
