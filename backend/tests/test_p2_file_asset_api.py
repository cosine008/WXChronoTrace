import datetime as dt
from io import BytesIO
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity, FieldFileAsset, TemporalRecord


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


def make_schema(users, *, sensitive=False, attachment_validators=None):
    validators = (
        attachment_validators
        if attachment_validators is not None
        else {"allowed_extensions": ["pdf"], "max_file_size": 1024}
    )
    schema = DataSchema.objects.create(
        schema_code=f"asset_docs_{uuid4().hex[:8]}",
        name="Asset Docs",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "Asset No", "type": "text", "required": True},
            {
                "key": "contract_files",
                "label": "Contract Files",
                "type": "attachment",
                "sensitive": sensitive,
                "masking": {"mode": "full", "visible_roles": ["owner"]} if sensitive else {},
                "validators": validators,
            },
            {
                "key": "site_photos",
                "label": "Site Photos",
                "type": "image",
                "validators": {"allowed_extensions": ["png"], "max_files": 2},
            },
        ],
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role="editor",
        added_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role="viewer",
        added_by=users["owner"],
    )
    return schema


def make_docx_bytes(body_xml: str = "") -> bytes:
    body = body_xml or "<w:p/>"
    document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {body}
    <w:sectPr/>
  </w:body>
</w:document>"""
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("word/document.xml", document)
    return buffer.getvalue()


def docx_paragraph(text: str) -> str:
    return f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"


def docx_table(*cells: str) -> str:
    cell_xml = "".join(f"<w:tc>{docx_paragraph(cell)}</w:tc>" for cell in cells)
    return f"<w:tbl><w:tr>{cell_xml}</w:tr></w:tbl>"


def make_docx_schema(users):
    return make_schema(users, attachment_validators={"allowed_extensions": ["pdf", "docx"]})


@pytest.mark.django_db
def test_editor_uploads_attachment_and_viewer_download_inherits_schema_permissions(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    schema = make_schema(users)

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/contract_files/files/",
        {"file": SimpleUploadedFile("contract.pdf", b"%PDF-1.4", content_type="application/pdf")},
        format="multipart",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "contract.pdf"
    assert payload["field_key"] == "contract_files"
    assert payload["download_url"] == f"/api/v1/files/{payload['id']}/download"
    assert FieldFileAsset.objects.filter(
        pk=payload["id"],
        schema=schema,
        field_key="contract_files",
    ).exists()

    download = auth(client, users["viewer"]).get(f"/api/v1/files/{payload['id']}/download")

    assert download.status_code == 200
    assert download.content == b"%PDF-1.4"


@pytest.mark.django_db
def test_image_upload_validates_image_content_and_returns_preview_url(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    schema = make_schema(users)

    rejected = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/site_photos/files/",
        {"file": SimpleUploadedFile("photo.pdf", b"%PDF-1.4", content_type="application/pdf")},
        format="multipart",
    )
    accepted = client.post(
        f"/api/v1/schemas/{schema.id}/fields/site_photos/files/",
        {"file": SimpleUploadedFile("photo.png", b"\x89PNG\r\n", content_type="image/png")},
        format="multipart",
    )

    assert rejected.status_code == 400
    assert accepted.status_code == 201
    assert accepted.json()["preview_url"] == f"/api/v1/files/{accepted.json()['id']}/download"


@pytest.mark.django_db
def test_masked_file_field_denies_upload_download_to_unauthorized_role(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    schema = make_schema(users, sensitive=True)
    asset = FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="contract.pdf",
        content_type="application/pdf",
        size=7,
    )
    asset.file.save("contract.pdf", ContentFile(b"content"), save=True)

    denied_upload = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{schema.id}/fields/contract_files/files/",
        {"file": SimpleUploadedFile("contract.pdf", b"content", content_type="application/pdf")},
        format="multipart",
    )
    denied_download = client.get(f"/api/v1/files/{asset.id}/download")

    assert denied_upload.status_code == 403
    assert denied_download.status_code == 403


@pytest.mark.django_db
def test_outsider_cannot_download_file_asset(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    schema = make_schema(users)
    asset = FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="contract.pdf",
        content_type="application/pdf",
        size=7,
    )
    asset.file.save("contract.pdf", ContentFile(b"content"), save=True)

    response = auth(client, users["outsider"]).get(f"/api/v1/files/{asset.id}/download")

    assert response.status_code == 404


@pytest.mark.django_db
def test_current_records_enrich_attachment_asset_refs(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    schema = make_schema(users)
    asset = FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="contract.pdf",
        content_type="application/pdf",
        size=7,
    )
    asset.file.save("contract.pdf", ContentFile(b"content"), save=True)
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="seed",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entity = Entity.objects.create(schema=schema, business_code="A-001", created_by=users["owner"])
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": "A-001", "contract_files": [asset.id]},
        valid_from=dt.date(2024, 1, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )

    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{schema.id}/records/?at=2024-01-02"
    )

    assert response.status_code == 200
    files = response.json()["results"][0]["data_payload"]["contract_files"]
    assert files == [
        {
            "id": asset.id,
            "schema_id": schema.id,
            "field_key": "contract_files",
            "name": "contract.pdf",
            "content_type": "application/pdf",
            "size": 7,
            "download_url": f"/api/v1/files/{asset.id}/download",
            "preview_url": None,
            "uploaded_by_id": users["owner"].id,
        }
    ]


@pytest.mark.django_db
def test_docx_upload_extracts_paragraph_and_table_text(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)
    docx = make_docx_bytes(
        docx_paragraph("Maintenance summary")
        + docx_paragraph("Replace filter")
        + docx_table("Part", "Status")
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/contract_files/files/",
        {
            "file": SimpleUploadedFile(
                "maintenance.docx",
                docx,
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        format="multipart",
    )

    assert response.status_code == 201
    asset = FieldFileAsset.objects.get(pk=response.json()["id"])
    assert asset.extraction_status == "ready"
    assert asset.extraction_error == ""
    assert asset.extraction_truncated is False
    assert asset.extracted_at is not None
    assert asset.extracted_text == "Maintenance summary\nReplace filter\nPart\tStatus"


@pytest.mark.django_db
def test_empty_docx_upload_records_ready_empty_text(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/contract_files/files/",
        {
            "file": SimpleUploadedFile(
                "empty.docx",
                make_docx_bytes(),
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        format="multipart",
    )

    assert response.status_code == 201
    asset = FieldFileAsset.objects.get(pk=response.json()["id"])
    assert asset.extraction_status == "ready"
    assert asset.extracted_text == ""
    assert asset.extraction_error == ""


@pytest.mark.django_db
def test_corrupted_docx_upload_records_failed_but_still_downloads(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/contract_files/files/",
        {
            "file": SimpleUploadedFile(
                "broken.docx",
                b"not a zip archive",
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        format="multipart",
    )

    assert response.status_code == 201
    asset = FieldFileAsset.objects.get(pk=response.json()["id"])
    assert asset.extraction_status == "failed"
    assert asset.extracted_text == ""
    assert asset.extraction_error == "invalid docx package"
    download = auth(client, users["viewer"]).get(f"/api/v1/files/{asset.id}/download")
    assert download.status_code == 200
    assert download.content == b"not a zip archive"


@pytest.mark.django_db
def test_non_docx_upload_keeps_attachment_behavior_without_extraction(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/contract_files/files/",
        {"file": SimpleUploadedFile("contract.pdf", b"%PDF-1.4", content_type="application/pdf")},
        format="multipart",
    )

    assert response.status_code == 201
    asset = FieldFileAsset.objects.get(pk=response.json()["id"])
    assert asset.extraction_status == "unsupported"
    assert asset.extracted_text == ""
    assert asset.extraction_error == ""


@pytest.mark.django_db
def test_oversized_docx_upload_records_unsupported_without_blocking_upload(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{schema.id}/fields/contract_files/files/",
        {
            "file": SimpleUploadedFile(
                "large.docx",
                b"PK\x03\x04" + b"0" * (5 * 1024 * 1024 + 1),
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        format="multipart",
    )

    assert response.status_code == 201
    asset = FieldFileAsset.objects.get(pk=response.json()["id"])
    assert asset.extraction_status == "unsupported"
    assert asset.extracted_text == ""
    assert asset.extraction_error == "docx preview size limit exceeded"


@pytest.mark.django_db
def test_docx_preview_returns_ready_text_for_authorized_viewer(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)
    asset = FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="maintenance.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size=128,
        extracted_text="Maintenance summary\nReplace filter",
        extraction_status=FieldFileAsset.ExtractionStatus.READY,
        extraction_truncated=False,
        extracted_at=timezone.now(),
    )
    asset.file.save("maintenance.docx", ContentFile(make_docx_bytes()), save=True)

    response = auth(client, users["viewer"]).get(f"/api/v1/files/{asset.id}/preview")

    assert response.status_code == 200
    assert response.json() == {
        "asset_id": asset.id,
        "filename": "maintenance.docx",
        "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "preview_type": "text",
        "status": "ready",
        "text": "Maintenance summary\nReplace filter",
        "truncated": False,
        "extracted_at": asset.extracted_at.isoformat(),
        "download_url": f"/api/v1/files/{asset.id}/download",
    }


@pytest.mark.django_db
def test_docx_preview_truncates_long_ready_text(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)
    asset = FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="long.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size=128,
        extracted_text="A" * 20_005,
        extraction_status=FieldFileAsset.ExtractionStatus.READY,
        extraction_truncated=False,
        extracted_at=timezone.now(),
    )
    asset.file.save("long.docx", ContentFile(make_docx_bytes()), save=True)

    response = auth(client, users["viewer"]).get(f"/api/v1/files/{asset.id}/preview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["text"] == "A" * 20_000
    assert payload["truncated"] is True


@pytest.mark.django_db
def test_docx_preview_returns_failed_and_unsupported_stable_payloads(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    schema = make_docx_schema(users)
    failed = FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="broken.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size=16,
        extraction_status=FieldFileAsset.ExtractionStatus.FAILED,
        extraction_error="invalid docx package",
    )
    unsupported = FieldFileAsset.objects.create(
        schema=schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="large.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size=6 * 1024 * 1024,
        extraction_status=FieldFileAsset.ExtractionStatus.UNSUPPORTED,
        extraction_error="docx preview size limit exceeded",
    )

    failed_response = auth(client, users["viewer"]).get(f"/api/v1/files/{failed.id}/preview")
    unsupported_response = client.get(f"/api/v1/files/{unsupported.id}/preview")

    assert failed_response.status_code == 200
    assert failed_response.json()["status"] == "failed"
    assert failed_response.json()["text"] == ""
    assert failed_response.json()["truncated"] is False
    assert unsupported_response.status_code == 200
    assert unsupported_response.json()["status"] == "unsupported"
    assert unsupported_response.json()["text"] == ""
    assert unsupported_response.json()["truncated"] is False


@pytest.mark.django_db
def test_file_preview_rejects_unauthorized_and_missing_or_non_docx_assets(
    tmp_path,
    settings,
    users,
    client,
):
    settings.MEDIA_ROOT = tmp_path
    sensitive_schema = make_schema(users, sensitive=True, attachment_validators={"allowed_extensions": ["docx", "pdf"]})
    masked_asset = FieldFileAsset.objects.create(
        schema=sensitive_schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="secret.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size=128,
        extraction_status=FieldFileAsset.ExtractionStatus.READY,
        extracted_text="secret",
        extracted_at=timezone.now(),
    )
    regular_schema = make_docx_schema(users)
    pdf_asset = FieldFileAsset.objects.create(
        schema=regular_schema,
        field_key="contract_files",
        uploaded_by=users["owner"],
        original_name="contract.pdf",
        content_type="application/pdf",
        size=16,
        extraction_status=FieldFileAsset.ExtractionStatus.UNSUPPORTED,
    )

    denied = auth(client, users["viewer"]).get(f"/api/v1/files/{masked_asset.id}/preview")
    missing = client.get("/api/v1/files/999999/preview")
    unsupported = client.get(f"/api/v1/files/{pdf_asset.id}/preview")

    assert denied.status_code == 403
    assert missing.status_code == 404
    assert unsupported.status_code == 200
    assert unsupported.json()["status"] == "unsupported"
    assert unsupported.json()["preview_type"] == "none"
