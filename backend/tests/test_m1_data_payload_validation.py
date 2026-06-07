import pytest
from django.contrib.auth.models import User
from m1_validation_helpers import all_type_fields, issue_codes

from apps.schemas.models import DataSchema
from apps.schemas.validation import FieldValidationError, validate_data_payload
from apps.temporal.models import Entity


@pytest.fixture
def user(db):
    return User.objects.create_user(username="active_user", password="pass")


@pytest.fixture
def inactive_user(db):
    return User.objects.create_user(username="inactive_user", password="pass", is_active=False)


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


@pytest.fixture
def referenced_entity(dept_schema, owner):
    return Entity.objects.create(schema=dept_schema, business_code="D001", created_by=owner)


@pytest.mark.django_db
def test_validate_data_payload_accepts_all_supported_values(user, referenced_entity):
    payload = {
        "employee_no": "u@example.com",
        "description": "正常说明",
        "social_base": "12345.67",
        "join_date": "2026-05-01",
        "updated_at": "2026-05-01T08:30:00Z",
        "enabled": True,
        "status": "在用",
        "tags": ["A", "B"],
        "owner_user": user.id,
        "owner_dept": referenced_entity.id,
        "serial_no": "AS-0001",
    }

    assert validate_data_payload(all_type_fields(), payload) == payload


def test_required_and_unknown_payload_keys_are_rejected():
    fields = [{"key": "name", "label": "姓名", "type": "text", "required": True}]

    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload(fields, {"extra": "x"})

    assert {"required", "unknown_field"} <= issue_codes(exc.value)


@pytest.mark.parametrize(
    ("value", "expected_code"),
    [
        ("a", "min_length"),
        ("too-long@example.com", "max_length"),
        ("not-email", "regex"),
        (123, "type"),
    ],
)
def test_text_validator_rejects_length_regex_and_type(value, expected_code):
    fields = [
        {
            "key": "email",
            "label": "邮箱",
            "type": "text",
            "validators": {"min_length": 2, "max_length": 12, "regex": "email"},
        }
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload(fields, {"email": value})

    assert expected_code in issue_codes(exc.value)


def test_number_validator_rejects_range_decimals_and_bool():
    fields = [
        {
            "key": "amount",
            "label": "金额",
            "type": "number",
            "validators": {"min": 0, "max": 100, "decimals": 2, "positive_only": True},
        }
    ]

    for value, code in [(-1, "positive_only"), (101, "max"), ("1.234", "decimals"), (True, "type")]:
        with pytest.raises(FieldValidationError) as exc:
            validate_data_payload(fields, {"amount": value})
        assert code in issue_codes(exc.value)


def test_date_validator_rejects_invalid_range_and_future():
    fields = [
        {
            "key": "start_on",
            "label": "开始日期",
            "type": "date",
            "validators": {"min_date": "2020-01-01", "max_date": "2030-12-31", "not_future": True},
        }
    ]

    for value, code in [("2019-12-31", "min_date"), ("2031-01-01", "max_date"), ("2999-01-01", "not_future")]:
        with pytest.raises(FieldValidationError) as exc:
            validate_data_payload(fields, {"start_on": value})
        assert code in issue_codes(exc.value)


def test_datetime_validator_requires_iso_utc_and_honors_not_past():
    fields = [
        {
            "key": "expires_at",
            "label": "过期时间",
            "type": "datetime",
            "validators": {"not_past": True},
        }
    ]

    for value, code in [("2026-05-01T08:30:00", "timezone"), ("2000-01-01T00:00:00Z", "not_past")]:
        with pytest.raises(FieldValidationError) as exc:
            validate_data_payload(fields, {"expires_at": value})
        assert code in issue_codes(exc.value)


def test_boolean_validator_rejects_non_bool():
    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload([{"key": "enabled", "label": "启用", "type": "boolean"}], {"enabled": "true"})

    assert "type" in issue_codes(exc.value)


def test_enum_and_multi_enum_validators_reject_invalid_options_and_counts():
    fields = [
        {"key": "status", "label": "状态", "type": "enum", "validators": {"options": ["A", "B"]}},
        {
            "key": "tags",
            "label": "标签",
            "type": "multi-enum",
            "validators": {"options": ["X", "Y"], "min_count": 1, "max_count": 2},
        },
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload(fields, {"status": "C", "tags": ["X", "Z", "Y"]})

    assert {"option", "max_count"} <= issue_codes(exc.value)


@pytest.mark.django_db
def test_person_validator_rejects_inactive_and_missing_users(inactive_user):
    fields = [
        {
            "key": "owner_user",
            "label": "负责人",
            "type": "person",
            "validators": {"must_be_active": True},
        }
    ]

    for value, code in [(inactive_user.id, "inactive_user"), (999999, "user_missing")]:
        with pytest.raises(FieldValidationError) as exc:
            validate_data_payload(fields, {"owner_user": value})
        assert code in issue_codes(exc.value)


@pytest.mark.django_db
def test_reference_validator_rejects_missing_entity_and_wrong_schema(owner, dept_schema):
    other_schema = DataSchema.objects.create(
        schema_code="other_dict",
        name="其他字典",
        temporal_mode="continuous",
        identity_field_key="code",
        fields_config=[],
        owner=owner,
        visibility="public",
        created_by=owner,
    )
    wrong_entity = Entity.objects.create(schema=other_schema, business_code="O001", created_by=owner)
    fields = [
        {
            "key": "owner_dept",
            "label": "所属部门",
            "type": "reference",
            "validators": {"target_schema": "dept_dict"},
        }
    ]

    for value, code in [(wrong_entity.id, "reference_schema"), (999999, "reference_missing")]:
        with pytest.raises(FieldValidationError) as exc:
            validate_data_payload(fields, {"owner_dept": value})
        assert code in issue_codes(exc.value)


def test_auto_number_payload_rejects_bad_prefix_and_padding():
    fields = [
        {
            "key": "serial_no",
            "label": "流水号",
            "type": "auto-number",
            "validators": {"prefix": "AS-", "padding": 4, "sequence_reset_period": "year"},
        }
    ]

    with pytest.raises(FieldValidationError) as exc:
        validate_data_payload(fields, {"serial_no": "XX-1"})

    assert {"prefix", "padding"} <= issue_codes(exc.value)
