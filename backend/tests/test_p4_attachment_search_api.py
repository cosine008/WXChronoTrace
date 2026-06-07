import datetime as dt
from uuid import uuid4

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity, FieldFileAsset, TemporalRecord


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


def make_schema(users, *, sensitive_attachment=False):
    schema = DataSchema.objects.create(
        schema_code=f"attachment_search_{uuid4().hex[:8]}",
        name="Attachment Search",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "Asset No", "type": "text", "required": True},
            {
                "key": "contract_files",
                "label": "Contract Files",
                "type": "attachment",
                "sensitive": sensitive_attachment,
                "masking": (
                    {"mode": "full", "visible_roles": ["owner"]}
                    if sensitive_attachment
                    else {}
                ),
                "validators": {"allowed_extensions": ["pdf", "docx"]},
            },
        ],
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role="viewer",
        added_by=users["owner"],
    )
    return schema


def make_asset(
    schema,
    users,
    *,
    name="maintenance.docx",
    content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extracted_text="",
    status=FieldFileAsset.ExtractionStatus.READY,
):
    return FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name=name,
        content_type=content_type,
        size=128,
        extracted_text=extracted_text,
        extraction_status=status,
        extracted_at=timezone.now() if status == FieldFileAsset.ExtractionStatus.READY else None,
    )


def seed_record(schema, users, *, business_code="A-001", asset_ids=None):
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="seed",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entity = Entity.objects.create(
        schema=schema,
        business_code=business_code,
        created_by=users["owner"],
    )
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": business_code, "contract_files": asset_ids or []},
        valid_from=dt.date(2024, 1, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )


@pytest.mark.django_db
def test_attachment_text_search_requires_explicit_flag(client, users):
    schema = make_schema(users)
    asset = make_asset(
        schema,
        users,
        extracted_text=(
            "Quarterly service notes mention TorqueNeedle calibration. "
            + "unrelated tail marker " * 20
        ),
    )
    seed_record(schema, users, asset_ids=[asset.id])

    hidden = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {"at": "2024-01-02", "search": "TorqueNeedle"},
    )
    included = client.get(
        f"/api/v1/schemas/{schema.id}/records/",
        {
            "at": "2024-01-02",
            "search": "TorqueNeedle",
            "include_attachment_text": "true",
        },
    )

    assert hidden.status_code == 200
    assert hidden.json()["count"] == 0
    assert included.status_code == 200
    assert included.json()["count"] == 1
    matches = included.json()["results"][0]["search_matches"]
    text_match = next(match for match in matches if match["source"] == "attachment_text")
    assert text_match["field_key"] == "contract_files"
    assert text_match["asset_id"] == asset.id
    assert text_match["filename"] == "maintenance.docx"
    assert "TorqueNeedle" in text_match["snippet"]
    assert "unrelated tail marker unrelated tail marker" not in text_match["snippet"]
    assert "text" not in text_match


@pytest.mark.django_db
def test_attachment_filename_search_reports_source_without_text_flag(client, users):
    schema = make_schema(users)
    asset = make_asset(schema, users, name="safety-manual.docx")
    seed_record(schema, users, asset_ids=[asset.id])

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {"at": "2024-01-02", "search": "safety-manual"},
    )

    assert response.status_code == 200
    assert response.json()["count"] == 1
    matches = response.json()["results"][0]["search_matches"]
    assert {
        "source": "attachment_filename",
        "field_key": "contract_files",
        "asset_id": asset.id,
        "filename": "safety-manual.docx",
    } in matches


@pytest.mark.django_db
def test_masked_attachment_text_is_not_searchable_by_unauthorized_role(client, users):
    schema = make_schema(users, sensitive_attachment=True)
    asset = make_asset(schema, users, extracted_text="OwnerOnlyNeedle contract clause")
    seed_record(schema, users, asset_ids=[asset.id])

    denied = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {
            "at": "2024-01-02",
            "search": "OwnerOnlyNeedle",
            "include_attachment_text": "true",
        },
    )
    allowed = auth(client, users["owner"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {
            "at": "2024-01-02",
            "search": "OwnerOnlyNeedle",
            "include_attachment_text": "true",
        },
    )

    assert denied.status_code == 200
    assert denied.json()["count"] == 0
    assert allowed.status_code == 200
    assert allowed.json()["count"] == 1
    assert allowed.json()["results"][0]["search_matches"][0]["source"] == "attachment_text"


@pytest.mark.django_db
def test_non_docx_attachment_text_does_not_affect_existing_search(client, users):
    schema = make_schema(users)
    asset = make_asset(
        schema,
        users,
        name="contract.pdf",
        content_type="application/pdf",
        extracted_text="PdfOnlyNeedle should be ignored",
    )
    seed_record(schema, users, asset_ids=[asset.id])

    pdf_text = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/",
        {
            "at": "2024-01-02",
            "search": "PdfOnlyNeedle",
            "include_attachment_text": "true",
        },
    )
    field_value = client.get(
        f"/api/v1/schemas/{schema.id}/records/",
        {
            "at": "2024-01-02",
            "search": "A-001",
            "include_attachment_text": "true",
        },
    )

    assert pdf_text.status_code == 200
    assert pdf_text.json()["count"] == 0
    assert field_value.status_code == 200
    assert field_value.json()["count"] == 1
    assert {"source": "field_value", "field_key": "asset_no"} in field_value.json()["results"][0][
        "search_matches"
    ]
