import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.changesets.models import ChangeSet
from apps.labels.models import EntityLabel
from apps.labels.template_config import resolve_label_print_config
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="label-template-owner", password="pass"),
        "viewer": User.objects.create_user(username="label-template-viewer", password="pass"),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def schema(users):
    schema = DataSchema.objects.create(
        schema_code="label_template_assets",
        name="标签模板资产表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "required": True},
            {"key": "location", "label": "位置", "type": "text"},
            {"key": "owner", "label": "责任人", "type": "text"},
            {"key": "department", "label": "部门", "type": "text"},
            {"key": "serial_no", "label": "序列号", "type": "text", "sensitive": True},
            {"key": "internal_note", "label": "内部备注", "type": "text", "hidden": True},
        ],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["owner"],
    )
    return schema


@pytest.fixture
def label(users, schema):
    entity = Entity.objects.create(schema=schema, business_code="ASSET-TPL-001", created_by=users["owner"])
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="初始化模板配置资产",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={
            "asset_no": "模板资产-001",
            "location": "二号库",
            "owner": "王工",
            "department": "工程部",
            "serial_no": "SECRET-TEMPLATE-001",
        },
        valid_from=dt.date(2026, 1, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    return EntityLabel.objects.create(
        label_code="CT-L-TPL2-TEST-KLMN-PQRS",
        entity=entity,
        schema=schema,
        issued_by=users["owner"],
    )


@pytest.mark.django_db
def test_empty_label_print_config_resolves_to_defaults(schema):
    config = resolve_label_print_config(schema)

    assert config.default_template_code == "asset_standard"
    assert [item.code for item in config.enabled_templates] == [
        "asset_standard",
        "small",
        "document_cover",
    ]


@pytest.mark.django_db
def test_owner_can_patch_label_print_config_and_audit(client, users, schema):
    response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/label-print-config/",
        {
            "label_print_config": {
                "default_template_code": "small",
                "templates": {
                    "asset_standard": {"enabled": True, "field_keys": ["location"]},
                    "small": {
                        "enabled": True,
                        "field_keys": ["location"],
                        "show_barcode": False,
                    },
                    "document_cover": {"enabled": False, "field_keys": []},
                },
            }
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()["label_print_config"]
    assert payload["default_template_code"] == "small"
    assert payload["templates"]["small"]["show_barcode"] is False
    assert "document_cover" not in payload["templates"]

    schema.refresh_from_db()
    assert schema.current_version == 2
    assert schema.label_print_config == payload
    assert AuditLog.objects.filter(
        action="schema.label_print_config.update",
        target_id=schema.id,
    ).exists()


@pytest.mark.django_db
def test_viewer_cannot_patch_label_print_config(client, users, schema):
    response = auth(client, users["viewer"]).patch(
        f"/api/v1/schemas/{schema.id}/label-print-config/",
        {"label_print_config": {"default_template_code": "small", "templates": {}}},
        format="json",
    )

    assert response.status_code == 403
    schema.refresh_from_db()
    assert schema.label_print_config == {}


@pytest.mark.django_db
def test_patch_label_print_config_rejects_sensitive_fields(client, users, schema):
    response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/label-print-config/",
        {
            "label_print_config": {
                "default_template_code": "asset_standard",
                "templates": {
                    "asset_standard": {"enabled": True, "field_keys": ["serial_no"]},
                    "small": {"enabled": True, "field_keys": []},
                    "document_cover": {"enabled": True, "field_keys": []},
                },
            }
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["field_keys"] == "敏感字段不可打印到物理标签"
    schema.refresh_from_db()
    assert schema.label_print_config == {}


@pytest.mark.django_db
def test_patch_label_print_config_rejects_hidden_fields(client, users, schema):
    response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/label-print-config/",
        {
            "label_print_config": {
                "default_template_code": "asset_standard",
                "templates": {
                    "asset_standard": {"enabled": True, "field_keys": ["internal_note"]},
                    "small": {"enabled": True, "field_keys": []},
                    "document_cover": {"enabled": True, "field_keys": []},
                },
            }
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["field_keys"] == "系统隐藏字段不可打印到物理标签"
    schema.refresh_from_db()
    assert schema.label_print_config == {}


@pytest.mark.django_db
def test_label_print_uses_configured_field_whitelist(client, users, schema, label):
    schema.label_print_config = {
        "default_template_code": "asset_standard",
        "templates": {
            "asset_standard": {
                "enabled": True,
                "field_keys": ["owner"],
                "show_scan_url": False,
            },
            "small": {"enabled": True, "field_keys": []},
            "document_cover": {"enabled": True, "field_keys": []},
        },
    }
    schema.save(update_fields=["label_print_config"])

    response = auth(client, users["owner"]).post(
        f"/api/v1/labels/{label.id}/print/",
        {"format": "svg", "template_code": "asset_standard"},
        format="json",
    )

    assert response.status_code == 200
    svg = response.content.decode("utf-8")
    assert "王工" in svg
    assert "二号库" not in svg
    assert "SECRET-TEMPLATE-001" not in svg

    label.refresh_from_db()
    assert label.print_snapshot["fields"] == [{"key": "owner", "label": "责任人", "value": "王工"}]
    assert label.print_snapshot["resolved_config"]["field_keys"] == ["owner"]
    assert "label_print_config_hash" in label.print_snapshot


@pytest.mark.django_db
def test_bulk_create_uses_schema_default_template_when_omitted(client, users, schema):
    schema.label_print_config = {
        "default_template_code": "small",
        "templates": {
            "asset_standard": {"enabled": True, "field_keys": []},
            "small": {"enabled": True, "field_keys": ["location"]},
            "document_cover": {"enabled": True, "field_keys": []},
        },
    }
    schema.save(update_fields=["label_print_config"])
    entity = Entity.objects.create(
        schema=schema,
        business_code="ASSET-TPL-002",
        created_by=users["owner"],
    )

    response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/labels/bulk-create/",
        {"entity_ids": [entity.id]},
        format="json",
    )

    assert response.status_code == 201
    label_payload = response.json()["created"][0]
    assert label_payload["template_code"] == "small"
    assert EntityLabel.objects.get(pk=label_payload["id"]).template_code == "small"


@pytest.mark.django_db
def test_label_print_visibility_flags_hide_scan_graphics(client, users, schema, label):
    schema.label_print_config = {
        "default_template_code": "asset_standard",
        "templates": {
            "asset_standard": {
                "enabled": True,
                "field_keys": ["owner"],
                "show_qr": False,
                "show_barcode": False,
                "show_scan_url": False,
            },
            "small": {"enabled": True, "field_keys": []},
            "document_cover": {"enabled": True, "field_keys": []},
        },
    }
    schema.save(update_fields=["label_print_config"])

    response = auth(client, users["owner"]).post(
        f"/api/v1/labels/{label.id}/print/",
        {"format": "svg", "template_code": "asset_standard"},
        format="json",
    )

    assert response.status_code == 200
    svg = response.content.decode("utf-8")
    assert 'data-kind="qr"' not in svg
    assert 'data-kind="code128"' not in svg
    assert f"/scan/{label.label_code}" not in svg


@pytest.mark.django_db
def test_label_preview_is_side_effect_free(client, users, label):
    response = auth(client, users["owner"]).post(
        f"/api/v1/labels/{label.id}/preview/",
        {
            "format": "svg",
            "template_code": "asset_standard",
            "label_print_config": {
                "default_template_code": "asset_standard",
                "templates": {
                    "asset_standard": {"enabled": True, "field_keys": ["owner"]},
                    "small": {"enabled": True, "field_keys": []},
                    "document_cover": {"enabled": True, "field_keys": []},
                },
            },
        },
        format="json",
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("image/svg+xml")
    svg = response.content.decode("utf-8")
    assert "王工" in svg
    assert "二号库" not in svg

    label.refresh_from_db()
    assert label.printed_at is None
    assert label.print_snapshot == {}
    assert not AuditLog.objects.filter(action="label.print", target_id=label.id).exists()
