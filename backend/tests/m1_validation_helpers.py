from apps.schemas.validation import FieldValidationError


def all_type_fields():
    return [
        {
            "key": "employee_no",
            "label": "工号",
            "type": "text",
            "required": True,
            "indexed": True,
            "validators": {"min_length": 2, "max_length": 16, "regex": "email"},
            "introduced_in_version": 1,
        },
        {
            "key": "description",
            "label": "说明",
            "type": "longtext",
            "validators": {"max_length": 200},
            "introduced_in_version": 1,
        },
        {
            "key": "social_base",
            "label": "社保基数",
            "type": "number",
            "required": True,
            "validators": {"min": 0, "max": 30000, "decimals": 2},
            "introduced_in_version": 1,
        },
        {
            "key": "join_date",
            "label": "入职日期",
            "type": "date",
            "validators": {"min_date": "2020-01-01", "max_date": "2030-12-31"},
            "introduced_in_version": 1,
        },
        {
            "key": "updated_at",
            "label": "更新时间",
            "type": "datetime",
            "validators": {"not_future": True},
            "introduced_in_version": 1,
        },
        {"key": "enabled", "label": "启用", "type": "boolean", "introduced_in_version": 1},
        {
            "key": "status",
            "label": "状态",
            "type": "enum",
            "validators": {"options": ["在用", "维修", "报废"]},
            "introduced_in_version": 1,
        },
        {
            "key": "tags",
            "label": "标签",
            "type": "multi-enum",
            "validators": {"options": ["A", "B", "C"], "min_count": 1, "max_count": 2},
            "introduced_in_version": 1,
        },
        {
            "key": "owner_user",
            "label": "负责人",
            "type": "person",
            "validators": {"must_be_active": True},
            "introduced_in_version": 1,
        },
        {
            "key": "owner_dept",
            "label": "所属部门",
            "type": "reference",
            "validators": {"target_schema": "dept_dict"},
            "introduced_in_version": 1,
        },
        {
            "key": "serial_no",
            "label": "流水号",
            "type": "auto-number",
            "validators": {"prefix": "AS-", "padding": 4, "sequence_reset_period": "year"},
            "introduced_in_version": 1,
        },
    ]


def issue_codes(exc: FieldValidationError) -> set[str]:
    return {issue.code for issue in exc.issues}
