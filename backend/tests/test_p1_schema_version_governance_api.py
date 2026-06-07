import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "editor": User.objects.create_user(username="editor", password="pass"),
        "outsider": User.objects.create_user(username="outsider", password="pass"),
        "admin": User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="pass",
        ),
    }


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def make_schema(owner, visibility="shared"):
    return DataSchema.objects.create(
        schema_code="asset_list",
        name="Asset List",
        description="Asset inventory",
        icon="box",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {
                "key": "asset_no",
                "label": "Asset No",
                "type": "text",
                "required": True,
                "indexed": True,
                "validators": {"max_length": 32},
                "introduced_in_version": 1,
            },
            {
                "key": "status",
                "label": "Status",
                "type": "enum",
                "validators": {"options": ["In Use", "Retired"]},
                "introduced_in_version": 2,
            },
            {
                "key": "owner_name",
                "label": "Owner",
                "type": "text",
                "introduced_in_version": 2,
            },
        ],
        current_version=2,
        owner=owner,
        visibility=visibility,
        created_by=owner,
    )


def create_versions(schema, user):
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config[:1],
        changelog="Initial version",
        created_by=user,
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=2,
        fields_config=schema.fields_config,
        changelog="Add status and owner",
        created_by=user,
    )


@pytest.mark.django_db
def test_schema_versions_list_and_detail_require_schema_visibility(client, users):
    schema = make_schema(users["owner"])
    create_versions(schema, users["owner"])
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["owner"],
    )

    denied = auth(client, users["outsider"]).get(f"/api/v1/schemas/{schema.id}/versions/")
    assert denied.status_code == 404

    response = auth(client, users["editor"]).get(f"/api/v1/schemas/{schema.id}/versions/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert [item["version"] for item in payload["results"]] == [2, 1]
    assert payload["results"][0]["field_count"] == 3
    assert payload["results"][0]["created_by"] == {"id": users["owner"].id, "username": "owner"}

    detail = client.get(f"/api/v1/schemas/{schema.id}/versions/1/")
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["schema_id"] == schema.id
    assert detail_payload["schema_code"] == "asset_list"
    assert detail_payload["version"] == 1
    assert [field["key"] for field in detail_payload["fields_config"]] == ["asset_no"]


@pytest.mark.django_db
def test_reorder_schema_fields_increments_version_records_snapshot_and_audit(client, users):
    schema = make_schema(users["owner"])
    create_versions(schema, users["owner"])

    response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/fields/reorder",
        {"field_keys": ["status", "asset_no", "owner_name"]},
        format="json",
    )

    assert response.status_code == 200
    schema.refresh_from_db()
    assert schema.current_version == 3
    assert [field["key"] for field in schema.fields_config] == [
        "status",
        "asset_no",
        "owner_name",
    ]
    version = SchemaVersion.objects.get(schema=schema, version=3)
    assert [field["key"] for field in version.fields_config] == [
        "status",
        "asset_no",
        "owner_name",
    ]
    audit = AuditLog.objects.get(action="schema.reorder_fields", target_id=schema.id)
    assert audit.detail == {
        "field_keys": ["status", "asset_no", "owner_name"],
        "version": 3,
    }


@pytest.mark.django_db
def test_reorder_schema_fields_requires_owner_or_admin_and_valid_complete_order(client, users):
    schema = make_schema(users["owner"])
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role=TableCollaborator.Role.EDITOR,
        added_by=users["owner"],
    )

    denied = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/reorder",
        {"field_keys": ["status", "asset_no", "owner_name"]},
        format="json",
    )
    assert denied.status_code == 403

    invalid = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/fields/reorder",
        {"field_keys": ["status", "asset_no"]},
        format="json",
    )
    assert invalid.status_code == 400

    admin_response = auth(client, users["admin"]).post(
        f"/api/v1/schemas/{schema.id}/fields/reorder",
        {"field_keys": ["owner_name", "status", "asset_no"]},
        format="json",
    )
    assert admin_response.status_code == 200
