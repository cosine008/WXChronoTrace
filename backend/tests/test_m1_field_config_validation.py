import pytest
from django.contrib.auth.models import User
from m1_validation_helpers import all_type_fields, issue_codes

from apps.schemas.models import DataSchema
from apps.schemas.validation import FieldValidationError, validate_fields_config


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="schema_owner", password="pass")


@pytest.fixture
def dept_schema(owner):
    return DataSchema.objects.create(
        schema_code="dept_dict",
        name="部门字典",
        temporal_mode="continuous",
        identity_field_key="dept_code",
        fields_config=[],
        owner=owner,
        visibility="public",
        created_by=owner,
    )


@pytest.mark.django_db
def test_validate_fields_config_accepts_all_supported_types(dept_schema):
    normalized = validate_fields_config(all_type_fields())

    assert [field["type"] for field in normalized] == [
        "text",
        "longtext",
        "number",
        "date",
        "datetime",
        "boolean",
        "enum",
        "multi-enum",
        "person",
        "reference",
        "auto-number",
    ]
    assert normalized[0]["deprecated"] is False
    assert normalized[0]["validators"]["regex"] == "email"


@pytest.mark.django_db
def test_validate_fields_config_rejects_duplicate_unknown_and_bad_reference():
    fields = [
        {"key": "code", "label": "编码", "type": "text", "introduced_in_version": 1},
        {"key": "code", "label": "重复", "type": "text", "introduced_in_version": 1},
        {"key": "bad", "label": "坏字段", "type": "money", "introduced_in_version": 1},
        {
            "key": "dept",
            "label": "部门",
            "type": "reference",
            "validators": {"target_schema": "missing_schema"},
            "introduced_in_version": 1,
        },
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_fields_config(fields)

    assert {"duplicate_key", "unsupported_type", "reference_target_missing"} <= issue_codes(
        exc.value
    )


def test_validate_fields_config_rejects_bad_common_flags_and_versions():
    fields = [
        {
            "key": "bad_flags",
            "label": "坏标志",
            "type": "text",
            "required": "yes",
            "indexed": "no",
            "deprecated": "false",
            "introduced_in_version": 0,
            "deprecated_in_version": 0,
        }
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_fields_config(fields)

    assert {
        "required",
        "indexed",
        "deprecated",
        "introduced_in_version",
        "deprecated_in_version",
    } <= issue_codes(exc.value)


def test_auto_number_config_rejects_bad_reset_period():
    fields = [
        {
            "key": "serial_no",
            "label": "流水号",
            "type": "auto-number",
            "validators": {"prefix": "AS-", "padding": 4, "sequence_reset_period": "week"},
        }
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_fields_config(fields)

    assert "sequence_reset_period" in issue_codes(exc.value)
