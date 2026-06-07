import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "editor": User.objects.create_user(username="editor", password="pass"),
        "viewer": User.objects.create_user(username="viewer", password="pass"),
        "outsider": User.objects.create_user(username="outsider", password="pass"),
        "new_owner": User.objects.create_user(username="new_owner", password="pass"),
        "admin": User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="pass",
        ),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def make_schema(schema_code, owner, visibility="shared", is_archived=False):
    return DataSchema.objects.create(
        schema_code=schema_code,
        name=schema_code.replace("_", " ").title(),
        description="内部资产台账",
        icon="box",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {
                "key": "asset_no",
                "label": "资产编号",
                "type": "text",
                "required": True,
                "indexed": True,
                "validators": {"max_length": 32},
                "introduced_in_version": 1,
            }
        ],
        owner=owner,
        visibility=visibility,
        created_by=owner,
        is_archived=is_archived,
    )


def page_results(response):
    payload = response.json()
    return payload["results"] if isinstance(payload, dict) and "results" in payload else payload


def set_schema_times(schema, value):
    DataSchema.objects.filter(pk=schema.pk).update(created_at=value, config_migrated_at=value)
    schema.refresh_from_db()


def make_applied_change(schema, user, applied_at):
    return ChangeSet.objects.create(
        schema=schema,
        summary=f"{schema.schema_code} applied change",
        status=ChangeSet.Status.APPLIED,
        created_by=user,
        applied_at=applied_at,
    )


def make_current_record(schema, user, change_set, business_code, valid_from=None):
    entity = Entity.objects.create(schema=schema, business_code=business_code, created_by=user)
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=schema.current_version,
        data_payload={"asset_no": business_code},
        valid_from=valid_from or (timezone.localdate() - dt.timedelta(days=1)),
        change_set=change_set,
        recorded_by=user,
    )


@pytest.mark.django_db
def test_create_schema_creates_owner_initial_version_and_audit_log(client, users):
    payload = {
        "schema_code": "asset_list",
        "name": "固定资产表",
        "description": "内部资产台账",
        "icon": "boxes",
        "temporal_mode": "continuous",
        "period_unit": None,
        "identity_field_key": "asset_no",
        "visibility": "private",
        "approval_required": True,
        "fields_config": [
            {
                "key": "asset_no",
                "label": "资产编号",
                "type": "text",
                "required": True,
                "indexed": True,
                "validators": {"max_length": 32},
            }
        ],
    }

    response = auth(client, users["owner"]).post("/api/v1/schemas/", payload, format="json")

    assert response.status_code == 201
    schema = DataSchema.objects.get(schema_code="asset_list")
    assert schema.owner == users["owner"]
    assert schema.created_by == users["owner"]
    assert schema.fields_config[0]["introduced_in_version"] == 1
    assert SchemaVersion.objects.filter(schema=schema, version=1).exists()
    assert AuditLog.objects.filter(
        actor=users["owner"],
        action="schema.create",
        target_type="schema",
        target_id=schema.id,
    ).exists()
    assert response.json()["role"] == "owner"


@pytest.mark.django_db
def test_create_schema_can_generate_entity_code_identity_field(client, users):
    payload = {
        "schema_code": "asset_auto",
        "name": "自动编码资产表",
        "description": "",
        "icon": "boxes",
        "temporal_mode": "continuous",
        "period_unit": None,
        "identity_field_key": "entity_code",
        "visibility": "private",
        "approval_required": False,
        "fields_config": [
            {"key": "status", "label": "状态", "type": "text", "required": False}
        ],
    }

    response = auth(client, users["owner"]).post("/api/v1/schemas/", payload, format="json")

    assert response.status_code == 201, response.json()
    schema = DataSchema.objects.get(schema_code="asset_auto")
    assert schema.identity_field_key == "entity_code"
    identity_field = schema.fields_config[0]
    assert identity_field == {
        "key": "entity_code",
        "label": "实体编码",
        "type": "auto-number",
        "required": True,
        "indexed": True,
        "validators": {
            "prefix": "ASSET_AUTO-",
            "padding": 6,
            "start_sequence": 1,
            "sequence_reset_period": "none",
        },
        "introduced_in_version": 1,
        "deprecated": False,
        "sensitive": False,
        "masking": {},
    }
    assert [field["key"] for field in response.json()["fields_config"]] == [
        "entity_code",
        "status",
    ]


@pytest.mark.django_db
@pytest.mark.parametrize("period_unit", ["day", "week", "half_year"])
def test_create_periodic_schema_accepts_expanded_period_units(client, users, period_unit):
    payload = {
        "schema_code": f"{period_unit}_snapshot",
        "name": f"{period_unit} snapshot",
        "description": "",
        "icon": "calendar",
        "temporal_mode": "periodic",
        "period_unit": period_unit,
        "identity_field_key": "asset_no",
        "visibility": "private",
        "approval_required": False,
        "fields_config": [
            {
                "key": "asset_no",
                "label": "资产编号",
                "type": "text",
                "required": True,
                "indexed": True,
                "validators": {"max_length": 32},
            }
        ],
    }

    response = auth(client, users["owner"]).post("/api/v1/schemas/", payload, format="json")

    assert response.status_code == 201, response.json()
    schema = DataSchema.objects.get(schema_code=f"{period_unit}_snapshot")
    assert schema.temporal_mode == DataSchema.TemporalMode.PERIODIC
    assert schema.period_unit == period_unit
    assert response.json()["period_unit"] == period_unit


@pytest.mark.django_db
def test_create_schema_preserves_custom_entity_code_generation_rules(client, users):
    payload = {
        "schema_code": "equipment_registry",
        "name": "Equipment Registry",
        "description": "",
        "icon": "boxes",
        "temporal_mode": "continuous",
        "period_unit": None,
        "identity_field_key": "entity_code",
        "visibility": "private",
        "approval_required": False,
        "fields_config": [
            {
                "key": "entity_code",
                "label": "Entity Code",
                "type": "auto-number",
                "required": True,
                "indexed": True,
                "validators": {
                    "prefix": "EQ-",
                    "padding": 4,
                    "start_sequence": 42,
                    "sequence_reset_period": "year",
                },
            },
            {"key": "status", "label": "Status", "type": "text", "required": False},
        ],
    }

    response = auth(client, users["owner"]).post("/api/v1/schemas/", payload, format="json")

    assert response.status_code == 201, response.json()
    schema = DataSchema.objects.get(schema_code="equipment_registry")
    identity_field = schema.fields_config[0]
    assert identity_field["key"] == "entity_code"
    assert identity_field["type"] == "auto-number"
    assert identity_field["validators"] == {
        "prefix": "EQ-",
        "padding": 4,
        "start_sequence": 42,
        "sequence_reset_period": "year",
    }


@pytest.mark.django_db
def test_list_schemas_returns_activity_metrics_and_defaults_to_recently_modified_first(
    client, users
):
    base = timezone.now() - dt.timedelta(days=10)
    older_schema = make_schema("older_assets", users["owner"], "shared")
    config_recent_schema = make_schema("config_recent", users["owner"], "shared")
    data_recent_schema = make_schema("data_recent", users["owner"], "shared")
    set_schema_times(older_schema, base)
    set_schema_times(config_recent_schema, base + dt.timedelta(days=5))
    set_schema_times(data_recent_schema, base + dt.timedelta(days=1))
    data_change = make_applied_change(data_recent_schema, users["owner"], base + dt.timedelta(days=8))
    make_current_record(data_recent_schema, users["owner"], data_change, "A-001")
    make_current_record(data_recent_schema, users["owner"], data_change, "A-002")
    draft_change = ChangeSet.objects.create(
        schema=older_schema,
        summary="draft does not count",
        status=ChangeSet.Status.DRAFT,
        created_by=users["owner"],
    )
    ChangeSet.objects.filter(pk=draft_change.pk).update(created_at=timezone.now())

    response = auth(client, users["owner"]).get("/api/v1/schemas/")

    assert response.status_code == 200
    rows = page_results(response)
    assert [item["schema_code"] for item in rows[:3]] == [
        "data_recent",
        "config_recent",
        "older_assets",
    ]
    data_row = next(item for item in rows if item["schema_code"] == "data_recent")
    assert data_row["field_count"] == 1
    assert data_row["row_count"] == 2
    assert data_row["last_data_change_at"] == data_change.applied_at.isoformat()
    assert data_row["last_modified_at"] == data_change.applied_at.isoformat()
    older_row = next(item for item in rows if item["schema_code"] == "older_assets")
    assert older_row["last_data_change_at"] is None
    assert older_row["row_count"] == 0


@pytest.mark.django_db
def test_list_schemas_supports_explicit_ordering_and_rejects_unknown_field(client, users):
    base = timezone.now() - dt.timedelta(days=3)
    alpha_schema = make_schema("alpha_assets", users["owner"], "shared")
    beta_schema = make_schema("beta_assets", users["owner"], "shared")
    set_schema_times(alpha_schema, base)
    set_schema_times(beta_schema, base + dt.timedelta(days=1))
    alpha_change = make_applied_change(alpha_schema, users["owner"], base + dt.timedelta(hours=1))
    beta_change = make_applied_change(beta_schema, users["owner"], base + dt.timedelta(hours=2))
    make_current_record(alpha_schema, users["owner"], alpha_change, "A-001")
    make_current_record(alpha_schema, users["owner"], alpha_change, "A-002")
    make_current_record(beta_schema, users["owner"], beta_change, "B-001")

    row_count_response = auth(client, users["owner"]).get("/api/v1/schemas/?ordering=-row_count")
    name_response = client.get("/api/v1/schemas/?ordering=name")
    invalid_response = client.get("/api/v1/schemas/?ordering=-unknown_field")

    assert row_count_response.status_code == 200
    assert [item["schema_code"] for item in page_results(row_count_response)[:2]] == [
        "alpha_assets",
        "beta_assets",
    ]
    assert name_response.status_code == 200
    assert [item["schema_code"] for item in page_results(name_response)[:2]] == [
        "alpha_assets",
        "beta_assets",
    ]
    assert invalid_response.status_code == 400


@pytest.mark.django_db
def test_create_schema_accepts_web_icon_url(client, users):
    icon_url = "https://static.example.com/icons/business/assets/warehouse-dashboard.png"
    payload = {
        "schema_code": "asset_icon_url",
        "name": "带链接图标的表",
        "description": "内部资产台账",
        "icon": icon_url,
        "temporal_mode": "continuous",
        "period_unit": None,
        "identity_field_key": "asset_no",
        "visibility": "private",
        "approval_required": False,
        "fields_config": [
            {
                "key": "asset_no",
                "label": "资产编号",
                "type": "text",
                "required": True,
            }
        ],
    }

    response = auth(client, users["owner"]).post("/api/v1/schemas/", payload, format="json")

    assert response.status_code == 201
    assert response.json()["icon"] == icon_url
    assert DataSchema.objects.get(schema_code="asset_icon_url").icon == icon_url


@pytest.mark.django_db
def test_upload_schema_icon_returns_image_url_and_rejects_non_images(
    tmp_path, settings, client, users
):
    settings.MEDIA_ROOT = tmp_path

    rejected = auth(client, users["owner"]).post(
        "/api/v1/schema-icons/",
        {"file": SimpleUploadedFile("notes.txt", b"not an image", content_type="text/plain")},
        format="multipart",
    )
    accepted = client.post(
        "/api/v1/schema-icons/",
        {
            "file": SimpleUploadedFile(
                "team.png",
                b"\x89PNG\r\n\x1a\nicon-bytes",
                content_type="image/png",
            )
        },
        format="multipart",
    )

    assert rejected.status_code == 400
    assert accepted.status_code == 201
    payload = accepted.json()
    assert payload["url"].startswith("/api/v1/schema-icons/")
    assert payload["name"] == "team.png"

    preview = client.get(payload["url"])
    assert preview.status_code == 200
    assert preview["Content-Type"] == "image/png"
    assert b"".join(preview.streaming_content).startswith(b"\x89PNG\r\n\x1a\n")


@pytest.mark.django_db
def test_list_schemas_uses_for_user_filter_and_hides_archived_by_default(client, users):
    private_schema = make_schema("private_assets", users["owner"], "private")
    shared_schema = make_schema("shared_assets", users["owner"], "shared")
    public_schema = make_schema("public_assets", users["owner"], "public")
    archived_schema = make_schema("archived_assets", users["owner"], "shared", is_archived=True)
    TableCollaborator.objects.create(
        schema=shared_schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=archived_schema,
        user=users["editor"],
        role="viewer",
        added_by=users["owner"],
    )

    response = auth(client, users["editor"]).get("/api/v1/schemas/")

    assert response.status_code == 200
    assert sorted(item["schema_code"] for item in page_results(response)) == [
        public_schema.schema_code,
        shared_schema.schema_code,
    ]
    assert private_schema.schema_code not in response.content.decode()

    response = client.get("/api/v1/schemas/?include_archived=true")

    assert response.status_code == 200
    assert sorted(item["schema_code"] for item in page_results(response)) == [
        archived_schema.schema_code,
        public_schema.schema_code,
        shared_schema.schema_code,
    ]


@pytest.mark.django_db
def test_owner_can_patch_basic_schema_metadata_and_visibility_is_audited(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")

    response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/",
        {
            "name": "资产清单",
            "description": "资产主数据",
            "visibility": "public",
            "approval_required": True,
            "schema_code": "ignored_code",
        },
        format="json",
    )

    assert response.status_code == 200
    schema.refresh_from_db()
    assert schema.name == "资产清单"
    assert schema.description == "资产主数据"
    assert schema.visibility == "public"
    assert schema.approval_required is True
    assert schema.schema_code == "asset_list"
    visibility_log = AuditLog.objects.get(action="schema.visibility_change")
    assert visibility_log.is_sensitive is True
    assert visibility_log.detail == {"from_visibility": "shared", "to_visibility": "public"}


@pytest.mark.django_db
def test_editor_cannot_patch_schema_metadata(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )

    response = auth(client, users["editor"]).patch(
        f"/api/v1/schemas/{schema.id}/",
        {"name": "越权修改"},
        format="json",
    )

    assert response.status_code == 403
    schema.refresh_from_db()
    assert schema.name == "Asset List"


@pytest.mark.django_db
def test_add_field_increments_schema_version_and_records_snapshot(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")

    response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/fields/",
        {
            "key": "status",
            "label": "状态",
            "type": "enum",
            "required": True,
            "indexed": False,
            "validators": {"options": ["在用", "闲置"]},
        },
        format="json",
    )

    assert response.status_code == 201
    schema.refresh_from_db()
    assert schema.current_version == 2
    assert [field["key"] for field in schema.fields_config] == ["asset_no", "status"]
    assert schema.fields_config[1]["introduced_in_version"] == 2
    version = SchemaVersion.objects.get(schema=schema, version=2)
    assert [field["key"] for field in version.fields_config] == ["asset_no", "status"]
    assert AuditLog.objects.filter(action="schema.update_fields", target_id=schema.id).exists()


@pytest.mark.django_db
def test_patch_field_updates_allowed_shape_and_rejects_type_change(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")

    type_change_response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/fields/asset_no/",
        {"type": "number"},
        format="json",
    )

    assert type_change_response.status_code == 400

    response = client.patch(
        f"/api/v1/schemas/{schema.id}/fields/asset_no/",
        {
            "label": "资产编码",
            "validators": {"max_length": 64},
            "deprecated": True,
        },
        format="json",
    )

    assert response.status_code == 200
    schema.refresh_from_db()
    field = schema.fields_config[0]
    assert schema.current_version == 2
    assert field["label"] == "资产编码"
    assert field["validators"] == {"max_length": 64}
    assert field["deprecated"] is True
    assert field["deprecated_in_version"] == 2
    assert SchemaVersion.objects.filter(schema=schema, version=2).exists()


@pytest.mark.django_db
def test_owner_can_patch_identity_display_template_and_records_version(client, users):
    schema = make_schema("employee_cards", users["owner"], "shared")
    schema.fields_config = [
        {"key": "employee_no", "label": "员工号", "type": "text", "introduced_in_version": 1},
        {"key": "name", "label": "姓名", "type": "text", "introduced_in_version": 1},
    ]
    schema.identity_field_key = "employee_no"
    schema.save(update_fields=["identity_field_key", "fields_config"])

    response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/identity-display-template",
        {"identity_display_template": "{employee_no} / {name}"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    schema.refresh_from_db()
    assert schema.current_version == 2
    assert schema.fields_config[0]["identity_display_template"] == "{employee_no} / {name}"
    assert response.json()["identity_display_template"] == "{employee_no} / {name}"
    version = SchemaVersion.objects.get(schema=schema, version=2)
    assert version.fields_config[0]["identity_display_template"] == "{employee_no} / {name}"
    assert AuditLog.objects.filter(
        action="schema.identity_display_template.update",
        target_id=schema.id,
        detail={"version": 2, "identity_display_template": "{employee_no} / {name}"},
    ).exists()


@pytest.mark.django_db
def test_patch_identity_display_template_rejects_unknown_field(client, users):
    schema = make_schema("employee_cards", users["owner"], "shared")

    response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/identity-display-template",
        {"identity_display_template": "{asset_no} / {name}"},
        format="json",
    )

    assert response.status_code == 400
    assert "identity_display_template" in response.json()
    schema.refresh_from_db()
    assert schema.current_version == 1


@pytest.mark.django_db
def test_patch_identity_display_template_can_clear_existing_template(client, users):
    schema = make_schema("employee_cards", users["owner"], "shared")
    schema.fields_config[0]["identity_display_template"] = "{asset_no}"
    schema.save(update_fields=["fields_config"])

    response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/identity-display-template",
        {"identity_display_template": ""},
        format="json",
    )

    assert response.status_code == 200, response.json()
    schema.refresh_from_db()
    assert "identity_display_template" not in schema.fields_config[0]
    assert response.json()["identity_display_template"] == ""


@pytest.mark.django_db
def test_editor_cannot_patch_identity_display_template(client, users):
    schema = make_schema("employee_cards", users["owner"], "shared")
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )

    response = auth(client, users["editor"]).patch(
        f"/api/v1/schemas/{schema.id}/identity-display-template",
        {"identity_display_template": "{asset_no}"},
        format="json",
    )

    assert response.status_code == 403
    schema.refresh_from_db()
    assert "identity_display_template" not in schema.fields_config[0]


@pytest.mark.django_db
def test_archive_requires_owner_and_hides_schema_from_default_list(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )

    denied = auth(client, users["editor"]).post(f"/api/v1/schemas/{schema.id}/archive")

    assert denied.status_code == 403

    response = auth(client, users["owner"]).post(f"/api/v1/schemas/{schema.id}/archive")

    assert response.status_code == 200
    schema.refresh_from_db()
    assert schema.is_archived is True
    assert AuditLog.objects.filter(action="schema.archive", target_id=schema.id).exists()
    list_response = client.get("/api/v1/schemas/")
    assert schema.schema_code not in list_response.content.decode()


@pytest.mark.django_db
def test_schema_detail_delete_is_not_exposed(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")

    response = auth(client, users["owner"]).delete(f"/api/v1/schemas/{schema.id}/")

    assert response.status_code == 405
    assert DataSchema.objects.filter(pk=schema.id).exists()


@pytest.mark.django_db
def test_handover_requires_admin_and_removes_owner_collaborator_rows(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")
    TableCollaborator.objects.create(
        schema=schema,
        user=users["new_owner"],
        role="editor",
        added_by=users["owner"],
    )

    denied = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/handover",
        {"owner_id": users["new_owner"].id},
        format="json",
    )

    assert denied.status_code == 403

    response = auth(client, users["admin"]).post(
        f"/api/v1/schemas/{schema.id}/handover",
        {"owner_id": users["new_owner"].id},
        format="json",
    )

    assert response.status_code == 200
    schema.refresh_from_db()
    assert schema.owner == users["new_owner"]
    assert not TableCollaborator.objects.filter(schema=schema, user=users["new_owner"]).exists()
    handover_log = AuditLog.objects.get(action="schema.handover")
    assert handover_log.is_sensitive is True
    assert handover_log.detail == {
        "from_owner_id": users["owner"].id,
        "to_owner_id": users["new_owner"].id,
    }


@pytest.mark.django_db
def test_collaborator_management_requires_owner_and_records_audit_logs(client, users):
    schema = make_schema("asset_list", users["owner"], "shared")

    denied = auth(client, users["outsider"]).post(
        f"/api/v1/schemas/{schema.id}/collaborators/",
        {"user_id": users["viewer"].id, "role": "viewer"},
        format="json",
    )

    assert denied.status_code == 404

    response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/collaborators/",
        {"user_id": users["viewer"].id, "role": "viewer"},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["role"] == "viewer"
    assert TableCollaborator.objects.filter(schema=schema, user=users["viewer"]).exists()

    list_response = client.get(f"/api/v1/schemas/{schema.id}/collaborators/")
    assert list_response.status_code == 200
    assert list_response.json()[0]["username"] == "viewer"

    update_response = client.patch(
        f"/api/v1/schemas/{schema.id}/collaborators/{users['viewer'].id}/",
        {"role": "editor"},
        format="json",
    )

    assert update_response.status_code == 200
    assert update_response.json()["role"] == "editor"

    delete_response = client.delete(
        f"/api/v1/schemas/{schema.id}/collaborators/{users['viewer'].id}/"
    )

    assert delete_response.status_code == 204
    assert not TableCollaborator.objects.filter(schema=schema, user=users["viewer"]).exists()
    assert sorted(
        AuditLog.objects.filter(target_id=schema.id).values_list("action", flat=True)
    ) == ["collaborator.add", "collaborator.remove", "collaborator.update"]
