import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.labels.models import EntityLabel
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "editor": User.objects.create_user(username="editor", password="pass"),
        "viewer": User.objects.create_user(username="viewer", password="pass"),
        "outsider": User.objects.create_user(username="outsider", password="pass"),
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
        schema_code="asset_label_api",
        name="标签 API 资产表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[{"key": "asset_no", "label": "资产编号", "type": "text"}],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role=TableCollaborator.Role.EDITOR,
        added_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["owner"],
    )
    return schema


@pytest.fixture
def entity(schema, users):
    return Entity.objects.create(schema=schema, business_code="ASSET-001", created_by=users["owner"])


@pytest.mark.django_db
def test_viewer_can_list_entity_labels(client, users, entity):
    historical = EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=entity.schema,
        status=EntityLabel.Status.REVOKED,
        issued_by=users["owner"],
    )
    active = EntityLabel.objects.create(
        label_code="CT-L-BCDE-FGHJ-KLMN-PQRS",
        entity=entity,
        schema=entity.schema,
        issued_by=users["owner"],
    )
    EntityLabel.objects.filter(pk=historical.pk).update(
        issued_at=timezone.now() - timezone.timedelta(days=1)
    )

    response = auth(client, users["viewer"]).get(f"/api/v1/entities/{entity.id}/labels/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert [item["id"] for item in payload["results"]] == [active.id, historical.id]
    assert payload["results"][0]["label_code"] == active.label_code


@pytest.mark.django_db
def test_outsider_cannot_list_entity_labels(client, users, entity):
    response = auth(client, users["outsider"]).get(f"/api/v1/entities/{entity.id}/labels/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_editor_can_create_label_and_viewer_cannot(client, users, entity):
    create_response = auth(client, users["editor"]).post(
        f"/api/v1/entities/{entity.id}/labels/",
        {"template_code": "asset_standard"},
        format="json",
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["status"] == EntityLabel.Status.ACTIVE
    assert created["template_code"] == "asset_standard"
    assert AuditLog.objects.filter(action="label.create", actor=users["editor"]).exists()

    viewer_response = auth(client, users["viewer"]).post(
        f"/api/v1/entities/{entity.id}/labels/",
        {"template_code": "asset_standard"},
        format="json",
    )

    assert viewer_response.status_code == 403


@pytest.mark.django_db
def test_create_label_rejects_duplicate_active_label(client, users, entity):
    EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=entity.schema,
        issued_by=users["owner"],
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/entities/{entity.id}/labels/",
        {"template_code": "asset_standard"},
        format="json",
    )

    assert response.status_code == 400
    assert "active_label" in response.json()


@pytest.mark.django_db
def test_create_label_can_replace_existing_active_label(client, users, entity):
    old_label = EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=entity.schema,
        issued_by=users["owner"],
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/entities/{entity.id}/labels/",
        {
            "template_code": "asset_standard",
            "replace_existing_active": True,
            "reason": "原标签破损",
        },
        format="json",
    )

    assert response.status_code == 201
    old_label.refresh_from_db()
    new_label = EntityLabel.objects.get(pk=response.json()["id"])
    assert old_label.status == EntityLabel.Status.REPLACED
    assert old_label.replaced_by_id == new_label.id
    assert new_label.status == EntityLabel.Status.ACTIVE
    assert AuditLog.objects.filter(action="label.replace", actor=users["editor"]).exists()


@pytest.mark.django_db
def test_bulk_create_skips_existing_active_labels(client, users, schema, entity):
    another = Entity.objects.create(schema=schema, business_code="ASSET-002", created_by=users["owner"])
    existing = EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=schema,
        issued_by=users["owner"],
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/labels/bulk-create/",
        {
            "entity_ids": [entity.id, another.id],
            "template_code": "asset_standard",
            "skip_existing_active": True,
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert [item["entity_id"] for item in payload["created"]] == [another.id]
    assert payload["skipped"] == [
        {
            "entity_id": entity.id,
            "reason": "active_label_exists",
            "label": {
                "id": existing.id,
                "label_code": "CT-L-ABCD-EFGH-JKLM-NPQR",
                "entity_id": entity.id,
                "schema_id": schema.id,
                "status": "active",
                "template_code": "asset_standard",
                "issued_at": existing.issued_at.isoformat(),
                "issued_by_id": users["owner"].id,
                "printed_at": None,
                "printed_by_id": None,
                "revoked_at": None,
                "revoked_by_id": None,
                "revoked_reason": "",
                "replaced_by_id": None,
                "last_scanned_at": None,
                "scan_count": 0,
            },
        }
    ]
    assert AuditLog.objects.filter(action="label.bulk_create", actor=users["editor"]).exists()


@pytest.mark.django_db
def test_bulk_create_can_return_only_existing_active_labels(client, users, schema, entity):
    missing = Entity.objects.create(schema=schema, business_code="ASSET-002", created_by=users["owner"])
    existing = EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=schema,
        issued_by=users["owner"],
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/labels/bulk-create/",
        {
            "entity_ids": [entity.id, missing.id],
            "template_code": "asset_standard",
            "skip_existing_active": True,
            "create_missing": False,
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["created"] == []
    assert payload["skipped"][0]["entity_id"] == entity.id
    assert payload["skipped"][0]["reason"] == "active_label_exists"
    assert payload["skipped"][0]["label"]["id"] == existing.id
    assert payload["skipped"][1] == {"entity_id": missing.id, "reason": "active_label_missing"}
    assert EntityLabel.objects.filter(entity=missing).count() == 0


@pytest.mark.django_db
def test_bulk_create_rejects_cross_schema_entity_ids(client, users, schema):
    other_schema = DataSchema.objects.create(
        schema_code="other_label_api",
        name="其他表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    other_entity = Entity.objects.create(
        schema=other_schema,
        business_code="OTHER-001",
        created_by=users["owner"],
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/labels/bulk-create/",
        {
            "entity_ids": [other_entity.id],
            "template_code": "asset_standard",
            "skip_existing_active": True,
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["invalid_entity_ids"] == [other_entity.id]


@pytest.mark.django_db
def test_revoke_label_changes_status_and_writes_audit_log(client, users, entity):
    label = EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=entity.schema,
        issued_by=users["owner"],
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/revoke/",
        {"reason": "标签破损"},
        format="json",
    )

    assert response.status_code == 200
    label.refresh_from_db()
    assert label.status == EntityLabel.Status.REVOKED
    assert label.revoked_by == users["editor"]
    assert AuditLog.objects.filter(action="label.revoke", target_id=label.id).exists()

    second_response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/revoke/",
        {"reason": "重复作废"},
        format="json",
    )
    assert second_response.status_code == 400


@pytest.mark.django_db
def test_replace_label_creates_new_active_and_writes_audit_log(client, users, entity):
    label = EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=entity.schema,
        issued_by=users["owner"],
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/replace/",
        {"reason": "贴错位置", "template_code": "asset_standard"},
        format="json",
    )

    assert response.status_code == 201
    label.refresh_from_db()
    new_label = EntityLabel.objects.get(pk=response.json()["new_label"]["id"])
    assert label.status == EntityLabel.Status.REPLACED
    assert label.replaced_by_id == new_label.id
    assert new_label.status == EntityLabel.Status.ACTIVE
    assert AuditLog.objects.filter(action="label.replace", target_id=label.id).exists()

    second_response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/replace/",
        {"reason": "重复替换", "template_code": "asset_standard"},
        format="json",
    )
    assert second_response.status_code == 400
