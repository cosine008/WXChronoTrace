import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeSet
from apps.labels.models import EntityLabel, LabelScanEvent
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
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
        schema_code="asset_scan_api",
        name="扫码资产表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "required": True},
            {"key": "location", "label": "位置", "type": "text"},
            {
                "key": "serial_no",
                "label": "序列号",
                "type": "text",
                "sensitive": True,
                "masking": {"mode": "partial", "visible_roles": ["owner"]},
            },
        ],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="初始版本",
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
def entity(schema, users):
    entity = Entity.objects.create(schema=schema, business_code="ASSET-001", created_by=users["owner"])
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="初始化资产",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={
            "asset_no": "展示资产-001",
            "location": "一号库",
            "serial_no": "SN-SECRET-001",
        },
        valid_from=dt.date(2026, 1, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    return entity


@pytest.fixture
def label(entity, users):
    return EntityLabel.objects.create(
        label_code="CT-L-K7F3-9X2M-Q6V8-T4ND",
        entity=entity,
        schema=entity.schema,
        issued_by=users["owner"],
    )


@pytest.mark.django_db
def test_scan_invalid_label_code_writes_event(client):
    response = client.get("/api/v1/scan/not-a-label/")

    assert response.status_code == 400
    assert response.json()["outcome"] == LabelScanEvent.Outcome.INVALID
    event = LabelScanEvent.objects.get()
    assert event.outcome == LabelScanEvent.Outcome.INVALID
    assert event.label_id is None
    assert event.actor_id is None


@pytest.mark.django_db
def test_scan_unknown_well_formed_label_writes_event(client):
    response = client.get("/api/v1/scan/CT-L-ABCD-EFGH-JKLM-NPQR/")

    assert response.status_code == 404
    assert response.json()["outcome"] == LabelScanEvent.Outcome.NOT_FOUND
    event = LabelScanEvent.objects.get()
    assert event.outcome == LabelScanEvent.Outcome.NOT_FOUND
    assert event.label_id is None


@pytest.mark.django_db
def test_scan_existing_label_requires_login_without_leaking_entity(client, label):
    response = client.get(f"/api/v1/scan/{label.label_code}/")

    assert response.status_code == 401
    payload = response.json()
    assert payload["outcome"] == LabelScanEvent.Outcome.LOGIN_REQUIRED
    assert "entity" not in payload
    event = LabelScanEvent.objects.get()
    assert event.label == label
    assert event.actor_id is None


@pytest.mark.django_db
def test_scan_denied_user_does_not_receive_entity_payload(client, users, label):
    response = auth(client, users["outsider"]).get(f"/api/v1/scan/{label.label_code}/")

    assert response.status_code == 403
    payload = response.json()
    assert payload["outcome"] == LabelScanEvent.Outcome.DENIED
    assert "record" not in payload
    event = LabelScanEvent.objects.get()
    assert event.actor == users["outsider"]
    assert event.entity == label.entity


@pytest.mark.django_db
def test_scan_revoked_label_does_not_enter_entity_view(client, users, label):
    label.status = EntityLabel.Status.REVOKED
    label.revoked_reason = "标签破损"
    label.save(update_fields=["status", "revoked_reason", "updated_at"])

    response = auth(client, users["viewer"]).get(f"/api/v1/scan/{label.label_code}/")

    assert response.status_code == 410
    payload = response.json()
    assert payload["outcome"] == LabelScanEvent.Outcome.REVOKED
    assert payload["label"]["revoked_reason"] == "标签破损"
    assert "record" not in payload


@pytest.mark.django_db
def test_scan_replaced_label_returns_replacement_hint(client, users, label, entity):
    label.status = EntityLabel.Status.REPLACED
    label.save(update_fields=["status", "updated_at"])
    replacement = EntityLabel.objects.create(
        label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
        entity=entity,
        schema=entity.schema,
        issued_by=users["owner"],
    )
    label.replaced_by = replacement
    label.save(update_fields=["replaced_by", "updated_at"])

    response = auth(client, users["viewer"]).get(f"/api/v1/scan/{label.label_code}/")

    assert response.status_code == 409
    payload = response.json()
    assert payload["outcome"] == LabelScanEvent.Outcome.REPLACED
    assert payload["replacement"]["label_code"] == replacement.label_code


@pytest.mark.django_db
def test_scan_resolved_returns_current_view_payload_and_records_event(client, users, label):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/scan/{label.label_code}/",
        {"source": LabelScanEvent.Source.SCANNER_CONSOLE},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["outcome"] == LabelScanEvent.Outcome.RESOLVED
    assert payload["entity"]["display_code"] == "展示资产-001"
    assert payload["record"]["data_payload"]["location"] == "一号库"
    assert payload["record"]["data_payload"]["serial_no"]["kind"] == "masked"
    assert payload["capabilities"]["can_manage_labels"] is False

    label.refresh_from_db()
    assert label.scan_count == 1
    assert label.last_scanned_at is not None
    event = LabelScanEvent.objects.get()
    assert event.outcome == LabelScanEvent.Outcome.RESOLVED
    assert event.source == LabelScanEvent.Source.SCANNER_CONSOLE
    assert event.actor == users["viewer"]
    assert event.entity == label.entity
