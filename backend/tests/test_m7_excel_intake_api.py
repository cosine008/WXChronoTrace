from __future__ import annotations

from io import BytesIO

import pytest
from django.contrib.auth.models import User
from openpyxl import Workbook
from rest_framework.test import APIClient

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion
from apps.temporal.models import TemporalRecord


@pytest.fixture
def user(db):
    return User.objects.create_user(username="owner", password="pass")


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_excel_intake_scan_returns_token_sheet_summaries_and_header_guess(client, user):
    response = auth(client, user).post(
        "/api/v1/excel-intake/scan",
        {"file": make_workbook()},
        format="multipart",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filename"] == "assets.xlsx"
    assert payload["upload_token"]
    assert [sheet["name"] for sheet in payload["sheets"]] == ["资产", "人员"]
    assert payload["sheets"][0]["row_count"] == 3
    assert payload["sheets"][0]["column_count"] == 3
    assert payload["sheets"][0]["recommended_header_row"] == 1
    assert payload["sheets"][0]["recommended_data_start_row"] == 2
    assert payload["sheets"][0]["preview_rows"][0] == ["资产编号", "状态", "数量"]
    assert DataSchema.objects.count() == 0


@pytest.mark.django_db
def test_excel_intake_preview_infers_fields_and_only_reads_selected_sheet(client, user):
    token = scan_token(client, user, make_workbook())

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "资产",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "excel_assets",
                "name": "Excel 资产",
                "identity_field_key": "asset_no",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_draft"]["schema_code"] == "excel_assets"
    assert payload["schema_draft"]["identity_field_key"] == "asset_no"
    assert [field["key"] for field in payload["fields"]] == ["asset_no", "status", "quantity"]
    assert payload["fields"][0]["identity_candidate"] is True
    assert payload["fields"][2]["type"] == "number"
    assert payload["summary"] == {
        "create": 2,
        "update": 0,
        "missing": 0,
        "invalid": 0,
        "unchanged": 0,
    }
    assert [row["business_code"] for row in payload["rows"]] == ["A-001", "A-002"]
    assert [row["display_code"] for row in payload["rows"]] == ["A-001", "A-002"]
    assert "P-001" not in response.content.decode()


@pytest.mark.django_db
def test_excel_intake_preview_allows_header_only_sheet_to_create_empty_table(client, user):
    token = scan_token(
        client,
        user,
        workbook_from_sheets({"资产": [["资产编号", "状态", "数量"]]}),
    )

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "资产",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "empty_assets",
                "name": "空资产表",
                "identity_field_key": "asset_no",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert [field["key"] for field in payload["fields"]] == ["asset_no", "status", "quantity"]
    assert [field["type"] for field in payload["fields"]] == ["text", "text", "text"]
    assert [field["required"] for field in payload["fields"]] == [False, False, False]
    assert payload["schema_draft"]["schema_code"] == "empty_assets"
    assert payload["schema_draft"]["identity_field_key"] == "asset_no"
    assert payload["summary"] == {
        "create": 0,
        "update": 0,
        "missing": 0,
        "invalid": 0,
        "unchanged": 0,
    }
    assert payload["identity_diagnostics"]["status"] == "ok"
    assert payload["rows"] == []
    assert payload["errors"] == []


@pytest.mark.django_db
def test_excel_intake_preview_rejects_empty_selection_when_sheet_has_data(client, user):
    token = scan_token(client, user, make_workbook())

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "资产",
            "header_row": 1,
            "data_start_row": 10,
            "schema": {
                "schema_code": "excel_assets",
                "name": "Excel 资产",
                "identity_field_key": "asset_no",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"data_start_row": "没有有效数据行"}


@pytest.mark.django_db
def test_excel_intake_preview_reports_duplicate_identity_diagnostics(client, user):
    token = scan_token(client, user, make_duplicate_people_workbook())

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "社保",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "social_base",
                "name": "社保基数",
                "identity_field_key": "name",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {
        "create": 1,
        "update": 0,
        "missing": 0,
        "invalid": 5,
        "unchanged": 0,
    }
    assert payload["identity_diagnostics"] == {
        "mode": "single",
        "status": "error",
        "identity_field_key": "name",
        "identity_field_label": "姓名",
        "message": "当前实体标识字段“姓名”存在重复值，姓名不适合作为实体标识。请选择员工号、证件号派生码、社保账号，或创建组合标识字段。",
        "duplicate_values": [
            {"value": "张伟", "count": 2, "row_numbers": [2, 3]},
            {"value": "李娜", "count": 3, "row_numbers": [4, 5, 6]},
        ],
    }
    duplicate_rows = [row for row in payload["rows"] if row["business_code"] in {"张伟", "李娜"}]
    assert len(duplicate_rows) == 5
    assert all(row["action"] == "invalid" for row in duplicate_rows)
    assert all(
        any(error["code"] == "duplicate_identity" for error in row["errors"])
        for row in duplicate_rows
    )


@pytest.mark.django_db
def test_excel_intake_preview_recommends_identity_when_stale_schema_identity_is_missing(
    client, user
):
    token = scan_token(
        client,
        user,
        workbook_from_sheets(
            {
                "Sheet1": [
                    ["row_no", "department", "model"],
                    [1, "book", "hp"],
                    [2, "store", "lenovo"],
                ]
            }
        ),
    )

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "Sheet1",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "excel_assets",
                "name": "Excel assets",
                "identity_field_key": "asset_no",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    field_keys = {field["key"] for field in payload["fields"]}
    assert payload["schema_draft"]["identity_field_key"] in field_keys
    assert payload["schema_draft"]["identity_field_key"] != "asset_no"


@pytest.mark.django_db
def test_excel_intake_preview_returns_identity_quality_hints(client, user):
    token = scan_token(
        client,
        user,
        workbook_from_sheets(
            {
                "人员": [
                    ["姓名", "部门", "员工号", "状态"],
                    ["张三", "研发部", "E-001", "在职"],
                    ["张三", "研发部", "E-002", "在职"],
                    ["李四", "销售部", "E-003", "离职"],
                    ["王五", "", "E-004", "在职"],
                ]
            }
        ),
    )

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "人员",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "employee_base",
                "name": "人员台账",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200
    fields = {field["key"]: field for field in response.json()["fields"]}
    assert response.json()["schema_draft"]["identity_field_key"] == "employee_no"
    assert fields["employee_no"]["identity_quality"]["level"] == "recommended"
    assert "稳定编号字段" in fields["employee_no"]["identity_quality"]["reasons"]
    assert fields["name"]["identity_quality"]["level"] == "discouraged"
    assert "姓名/名称容易重复" in fields["name"]["identity_quality"]["reasons"]
    assert fields["status"]["identity_quality"]["level"] == "discouraged"
    assert "状态/类型不适合作为实体标识" in fields["status"]["identity_quality"]["reasons"]
    assert fields["field_2"]["identity_quality"]["level"] == "discouraged"
    assert "部门/岗位不适合作为实体标识" in fields["field_2"]["identity_quality"]["reasons"]
    assert "存在空值" in fields["field_2"]["identity_quality"]["reasons"]


@pytest.mark.django_db
def test_excel_intake_preview_generates_stable_person_code_identity(client, user):
    token = scan_token(
        client,
        user,
        workbook_from_sheets(
            {
                "人员": [
                    ["姓名", "部门"],
                    ["张三", "研发部"],
                    ["李四", "销售部"],
                ]
            }
        ),
    )

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "人员",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "employee_base",
                "name": "人员台账",
                "identity_field_key": "person_code",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_draft"]["identity_field_key"] == "person_code"
    assert payload["schema_draft"]["fields_config"][0]["key"] == "person_code"
    assert [row["business_code"] for row in payload["rows"]] == [
        "P-2026-000001",
        "P-2026-000002",
    ]
    assert [row["display_code"] for row in payload["rows"]] == [
        "P-2026-000001",
        "P-2026-000002",
    ]
    assert payload["rows"][0]["data_after"]["person_code"] == "P-2026-000001"
    assert payload["identity_warnings"][0]["code"] == "person_code_generated"


@pytest.mark.django_db
def test_excel_intake_preview_generates_entity_code_identity(client, user):
    token = scan_token(client, user, make_workbook())

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "资产",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "excel_assets",
                "name": "Excel 资产",
                "identity_field_key": "entity_code",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["schema_draft"]["identity_field_key"] == "entity_code"
    assert payload["schema_draft"]["fields_config"][0]["key"] == "entity_code"
    assert payload["schema_draft"]["fields_config"][0]["type"] == "auto-number"
    assert [row["business_code"] for row in payload["rows"]] == [
        "EXCEL_ASSETS-000001",
        "EXCEL_ASSETS-000002",
    ]
    assert payload["rows"][0]["data_after"]["entity_code"] == "EXCEL_ASSETS-000001"
    assert payload["identity_warnings"][0]["code"] == "entity_code_generated"


@pytest.mark.django_db
def test_excel_intake_preview_uses_custom_entity_code_generation_rules(client, user):
    token = scan_token(
        client,
        user,
        workbook_from_sheets(
            {
                "Assets": [
                    ["asset_name", "status"],
                    ["Asset A", "active"],
                    ["Asset B", "repair"],
                ]
            }
        ),
    )

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "Assets",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "excel_assets",
                "name": "Excel Assets",
                "identity_field_key": "entity_code",
                "entity_code_config": {
                    "prefix": "CUS-",
                    "padding": 3,
                    "start_sequence": 7,
                    "sequence_reset_period": "month",
                },
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    identity_field = payload["schema_draft"]["fields_config"][0]
    assert identity_field["key"] == "entity_code"
    assert identity_field["validators"] == {
        "prefix": "CUS-",
        "padding": 3,
        "start_sequence": 7,
        "sequence_reset_period": "month",
    }
    assert [row["business_code"] for row in payload["rows"]] == [
        "CUS-2026-05-007",
        "CUS-2026-05-008",
    ]
    assert payload["rows"][0]["data_after"]["entity_code"] == "CUS-2026-05-007"


@pytest.mark.django_db
def test_excel_intake_preview_rejects_periodic_system_code_identity(client, user):
    token = scan_token(
        client,
        user,
        workbook_from_sheets(
            {
                "人员": [
                    ["姓名", "部门"],
                    ["张三", "研发部"],
                    ["李四", "销售部"],
                ]
            }
        ),
    )

    response = client.post(
        "/api/v1/excel-intake/preview",
        {
            "upload_token": token,
            "sheet_name": "人员",
            "header_row": 1,
            "data_start_row": 2,
            "schema": {
                "schema_code": "employee_base",
                "name": "人员台账",
                "temporal_mode": "periodic",
                "period_unit": "month",
                "identity_field_key": "system_code",
            },
            "valid_from": "2026-05-15",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "行号型 system_code 只适合一次性新表导入" in response.content.decode()


@pytest.mark.django_db
def test_excel_intake_scan_preview_rows_include_wide_small_sheet(client, user):
    token_response = auth(client, user).post(
        "/api/v1/excel-intake/scan",
        {
            "file": workbook_from_sheets(
                {
                    "Sheet1": [
                        [f"col_{column}" for column in range(1, 11)],
                        *[[row, "dept", "model", "config", "type", "ip", "loc", "date", "use", "note"] for row in range(1, 11)],
                    ]
                }
            )
        },
        format="multipart",
    )

    assert token_response.status_code == 200
    sheet = token_response.json()["sheets"][0]
    assert sheet["row_count"] == 11
    assert sheet["column_count"] == 10
    assert len(sheet["preview_rows"]) == 11
    assert len(sheet["preview_rows"][0]) == 10
    assert sheet["preview_rows"][0][-1] == "col_10"


@pytest.mark.django_db
def test_excel_intake_commit_creates_schema_version_and_excel_draft(client, user):
    token = scan_token(client, user, make_workbook())

    response = client.post(
        "/api/v1/excel-intake/commit",
        commit_payload(token),
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    schema = DataSchema.objects.get(schema_code="excel_assets")
    change_set = ChangeSet.objects.get(schema=schema)

    assert schema.owner == user
    assert schema.identity_field_key == "asset_no"
    assert [field["key"] for field in schema.fields_config] == [
        "asset_no",
        "status",
        "quantity",
        "source_file",
        "source_sheet",
        "source_row_no",
    ]
    assert SchemaVersion.objects.filter(schema=schema, version=1).exists()
    assert change_set.status == ChangeSet.Status.DRAFT
    assert change_set.source == ChangeSet.Source.EXCEL
    assert change_set.summary == "从 Excel 创建资产草稿"
    assert ChangeEntry.objects.filter(change_set=change_set).count() == 2
    assert TemporalRecord.objects.count() == 0
    assert payload["schema"]["id"] == schema.id
    assert payload["change_set"]["id"] == change_set.id
    assert payload["import_summary"]["create"] == 2
    assert payload["rows"][0]["data_after"]["source_sheet"] == "资产"
    assert "P-001" not in response.content.decode()


@pytest.mark.django_db
def test_excel_intake_commit_header_only_creates_schema_without_entries(client, user):
    token = scan_token(
        client,
        user,
        workbook_from_sheets({"资产": [["资产编号", "状态", "数量"]]}),
    )

    response = client.post(
        "/api/v1/excel-intake/commit",
        {
            "upload_token": token,
            "sheet_name": "资产",
            "header_row": 1,
            "data_start_row": 2,
            "valid_from": "2026-05-15",
            "missing_policy": "keep",
            "source_tracking": True,
            "summary": "从 Excel 表头创建空资产表",
            "schema": {
                "schema_code": "empty_assets",
                "name": "空资产表",
                "description": "",
                "icon": "table",
                "temporal_mode": "continuous",
                "period_unit": None,
                "identity_field_key": "asset_no",
                "visibility": "private",
                "approval_required": False,
            },
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    payload = response.json()
    schema = DataSchema.objects.get(schema_code="empty_assets")
    change_set = ChangeSet.objects.get(schema=schema)

    assert schema.owner == user
    assert schema.identity_field_key == "asset_no"
    assert [field["key"] for field in schema.fields_config] == [
        "asset_no",
        "status",
        "quantity",
        "source_file",
        "source_sheet",
        "source_row_no",
    ]
    assert SchemaVersion.objects.filter(schema=schema, version=1).exists()
    assert change_set.status == ChangeSet.Status.DRAFT
    assert change_set.source == ChangeSet.Source.EXCEL
    assert change_set.summary == "从 Excel 表头创建空资产表"
    assert ChangeEntry.objects.filter(change_set=change_set).count() == 0
    assert TemporalRecord.objects.count() == 0
    assert payload["schema"]["id"] == schema.id
    assert payload["change_set"]["id"] == change_set.id
    assert payload["import_summary"] == {
        "create": 0,
        "update": 0,
        "missing": 0,
        "invalid": 0,
        "unchanged": 0,
    }
    assert payload["rows"] == []


@pytest.mark.django_db
def test_excel_intake_commit_rejects_duplicate_identity_and_rolls_back(client, user):
    token = scan_token(client, user, make_duplicate_workbook())

    response = client.post(
        "/api/v1/excel-intake/commit",
        commit_payload(token),
        format="json",
    )

    assert response.status_code == 400
    assert "duplicate_identity" in response.content.decode()
    assert not DataSchema.objects.filter(schema_code="excel_assets").exists()
    assert ChangeSet.objects.count() == 0
    assert ChangeEntry.objects.count() == 0


def scan_token(client, user, workbook: BytesIO) -> str:
    response = auth(client, user).post(
        "/api/v1/excel-intake/scan",
        {"file": workbook},
        format="multipart",
    )
    assert response.status_code == 200
    return response.json()["upload_token"]


def commit_payload(token: str) -> dict:
    return {
        "upload_token": token,
        "sheet_name": "资产",
        "header_row": 1,
        "data_start_row": 2,
        "valid_from": "2026-05-15",
        "missing_policy": "keep",
        "source_tracking": True,
        "summary": "从 Excel 创建资产草稿",
        "schema": {
            "schema_code": "excel_assets",
            "name": "Excel 资产",
            "description": "",
            "icon": "table",
            "temporal_mode": "continuous",
            "period_unit": None,
            "identity_field_key": "asset_no",
            "visibility": "private",
            "approval_required": False,
        },
        "fields_config": [
            {
                "source_index": 1,
                "source_column": "资产编号",
                "key": "asset_no",
                "label": "资产编号",
                "type": "text",
                "required": True,
                "indexed": True,
                "import": True,
                "validators": {"max_length": 32},
            },
            {
                "source_index": 2,
                "source_column": "状态",
                "key": "status",
                "label": "状态",
                "type": "enum",
                "required": False,
                "indexed": False,
                "import": True,
                "validators": {"options": ["在用", "维修"]},
            },
            {
                "source_index": 3,
                "source_column": "数量",
                "key": "quantity",
                "label": "数量",
                "type": "number",
                "required": False,
                "indexed": False,
                "import": True,
                "validators": {},
            },
        ],
    }


def make_workbook() -> BytesIO:
    return workbook_from_sheets(
        {
            "资产": [
                ["资产编号", "状态", "数量"],
                ["A-001", "在用", 3],
                ["A-002", "维修", 5],
            ],
            "人员": [
                ["工号", "姓名"],
                ["P-001", "张三"],
            ],
        }
    )


def make_duplicate_workbook() -> BytesIO:
    return workbook_from_sheets(
        {
            "资产": [
                ["资产编号", "状态", "数量"],
                ["A-001", "在用", 3],
                ["A-001", "维修", 5],
            ]
        }
    )


def make_duplicate_people_workbook() -> BytesIO:
    return workbook_from_sheets(
        {
            "社保": [
                ["姓名", "部门", "社保基数"],
                ["张伟", "研发部", 10000],
                ["张伟", "销售部", 12000],
                ["李娜", "一部", 9000],
                ["李娜", "二部", 9500],
                ["李娜", "三部", 9800],
                ["王强", "运营部", 8800],
            ]
        }
    )


def workbook_from_sheets(sheets: dict[str, list[list[object]]]) -> BytesIO:
    workbook = Workbook()
    default = workbook.active
    workbook.remove(default)
    for name, rows in sheets.items():
        sheet = workbook.create_sheet(name)
        for row in rows:
            sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    buffer.name = "assets.xlsx"
    return buffer
