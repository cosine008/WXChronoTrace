from pathlib import Path

import pytest
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.workbench.models import WorkbenchItem, WorkbenchMaterialDetail, WorkbenchUserSetting
from apps.workbench.services import upload_material


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "other": User.objects.create_user(username="other", password="pass"),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def create_material(
    owner,
    *,
    original_name: str = "manual.pdf",
    content: bytes = b"%PDF-1.4 test",
    content_type: str = "application/pdf",
    size: int | None = None,
    deleted: bool = False,
    title: str | None = None,
):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title=title or original_name,
        deleted_at=timezone.now() if deleted else None,
    )
    detail = WorkbenchMaterialDetail.objects.create(
        item=item,
        original_name=original_name,
        content_type=content_type,
        size=len(content),
    )
    detail.file.save(original_name, ContentFile(content), save=True)
    if size is not None:
        WorkbenchMaterialDetail.objects.filter(pk=detail.pk).update(size=size)
        detail.refresh_from_db()
    return item, detail


@pytest.mark.django_db
def test_upload_pdf_creates_material_and_audit_log_without_path_leak(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    file_bytes = b"%PDF-1.4 workbench material"

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {
            "file": SimpleUploadedFile("policy.pdf", file_bytes, content_type="application/pdf"),
            "title": "政策材料",
            "summary": "社保口径",
            "tags": ["policy", "social-security"],
            "is_pinned": True,
            "is_sensitive": True,
            "description": "用于复核的政策材料",
        },
        format="multipart",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["type"] == WorkbenchItem.Type.MATERIAL
    assert payload["title"] == "政策材料"
    assert payload["summary"] == "社保口径"
    assert payload["tags"] == ["policy", "social-security"]
    assert payload["is_pinned"] is True
    assert payload["is_sensitive"] is True
    assert payload["detail"]["original_name"] == "policy.pdf"
    assert payload["detail"]["content_type"] == "application/pdf"
    assert payload["detail"]["size"] == len(file_bytes)
    assert payload["detail"]["preview_status"] == WorkbenchMaterialDetail.PreviewStatus.NONE
    assert payload["detail"]["download_url"] == f"/api/v1/workbench/materials/{payload['id']}/download/"

    item = WorkbenchItem.objects.get(pk=payload["id"])
    assert item.owner_id == users["owner"].id
    assert item.type == WorkbenchItem.Type.MATERIAL
    assert item.material_detail.description == "用于复核的政策材料"
    assert item.material_detail.file

    log = AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.material.upload",
        target_type="workbench_item",
        target_id=item.id,
    ).first()
    assert log is not None
    assert log.is_sensitive is True
    assert log.detail["is_sensitive"] is True
    assert log.detail["size"] == len(file_bytes)
    assert log.detail["content_type"] == "application/pdf"
    assert "file" not in log.detail
    assert "workbench_materials/" not in str(log.detail)
    assert "PDF-1.4" not in str(log.detail)


@pytest.mark.django_db
def test_upload_disallowed_extension_returns_400(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {"file": SimpleUploadedFile("hack.exe", b"MZ", content_type="application/octet-stream")},
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"file": "file extension is not allowed"}


@pytest.mark.django_db
def test_upload_file_larger_than_50mb_returns_400(tmp_path, settings, users, client, monkeypatch):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr("apps.workbench.materials.MAX_MATERIAL_FILE_SIZE_BYTES", 0)

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {"file": SimpleUploadedFile("oversized.pdf", b"x", content_type="application/pdf")},
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"file": "file is larger than max material file size"}


@pytest.mark.django_db
def test_upload_exceeding_quota_returns_400(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    WorkbenchUserSetting.objects.create(
        owner=users["owner"],
        material_quota_bytes=10,
        upload_disabled=False,
    )
    create_material(
        users["owner"],
        original_name="existing.pdf",
        content=b"12345678",
        size=8,
    )

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {
            "file": SimpleUploadedFile("new.pdf", b"123", content_type="application/pdf"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"file": "material quota exceeded"}


@pytest.mark.django_db
def test_list_and_detail_only_return_owner_non_deleted_materials(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    visible_item, _ = create_material(users["owner"], original_name="visible.pdf", content=b"123")
    create_material(users["owner"], original_name="deleted.pdf", content=b"123", deleted=True)
    create_material(users["other"], original_name="other.pdf", content=b"123")

    list_response = auth(client, users["owner"]).get("/api/v1/workbench/materials/")
    detail_ok = auth(client, users["owner"]).get(f"/api/v1/workbench/materials/{visible_item.id}/")
    detail_other = auth(client, users["other"]).get(f"/api/v1/workbench/materials/{visible_item.id}/")

    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["count"] == 1
    assert [item["id"] for item in payload["results"]] == [visible_item.id]
    assert payload["results"][0]["type"] == WorkbenchItem.Type.MATERIAL
    assert detail_ok.status_code == 200
    assert detail_ok.json()["id"] == visible_item.id
    assert detail_other.status_code == 404


@pytest.mark.django_db
def test_patch_material_updates_allowed_fields_and_audit(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    item, _ = create_material(
        users["owner"],
        original_name="source.pdf",
        content=b"abc",
        title="old-title",
    )

    response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/materials/{item.id}/",
        {
            "title": "new-title",
            "summary": "new-summary",
            "tags": ["a", "b"],
            "is_pinned": True,
            "is_sensitive": True,
            "description": "new-description",
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "new-title"
    assert payload["summary"] == "new-summary"
    assert payload["tags"] == ["a", "b"]
    assert payload["is_pinned"] is True
    assert payload["is_sensitive"] is True
    assert payload["detail"]["description"] == "new-description"

    item.refresh_from_db()
    assert item.title == "new-title"
    assert item.summary == "new-summary"
    assert item.tags == ["a", "b"]
    assert item.is_pinned is True
    assert item.is_sensitive is True
    assert item.material_detail.description == "new-description"

    log = AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.item.update",
        target_type="workbench_item",
        target_id=item.id,
    ).first()
    assert log is not None
    assert log.is_sensitive is True
    assert log.detail["type"] == WorkbenchItem.Type.MATERIAL
    assert log.detail["is_sensitive"] is True
    assert "workbench_materials/" not in str(log.detail)


@pytest.mark.django_db
def test_owner_can_download_own_material(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    item, _ = create_material(
        users["owner"],
        original_name="download.pdf",
        content=b"%PDF-1.4 content",
        content_type="application/pdf",
    )

    response = auth(client, users["owner"]).get(f"/api/v1/workbench/materials/{item.id}/download/")

    assert response.status_code == 200
    assert response.content == b"%PDF-1.4 content"
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == 'attachment; filename="download.pdf"'
    assert AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.material.download",
        target_type="workbench_item",
        target_id=item.id,
    ).exists()


@pytest.mark.django_db
def test_other_user_cannot_download_material(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    item, _ = create_material(users["owner"], original_name="private.pdf", content=b"123")

    response = auth(client, users["other"]).get(f"/api/v1/workbench/materials/{item.id}/download/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_soft_deleted_material_cannot_download(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    item, _ = create_material(users["owner"], original_name="deleted.pdf", content=b"123", deleted=True)

    response = auth(client, users["owner"]).get(f"/api/v1/workbench/materials/{item.id}/download/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_upload_audit_failure_rolls_back_db_and_cleans_saved_file(tmp_path, settings, users, monkeypatch):
    settings.MEDIA_ROOT = tmp_path

    def _boom(*args, **kwargs):
        raise RuntimeError("audit failed")

    monkeypatch.setattr("apps.workbench.services._audit", _boom)

    with pytest.raises(RuntimeError, match="audit failed"):
        upload_material(
            users["owner"],
            {
                "file": SimpleUploadedFile("rollback.pdf", b"%PDF-1.4 rollback", content_type="application/pdf"),
                "title": "rollback-check",
            },
        )

    assert WorkbenchItem.objects.filter(owner=users["owner"], type=WorkbenchItem.Type.MATERIAL).count() == 0
    assert WorkbenchMaterialDetail.objects.filter(item__owner=users["owner"]).count() == 0
    assert [path for path in tmp_path.rglob("*") if path.is_file()] == []


@pytest.mark.django_db
def test_upload_material_tags_json_string_decodes_to_array(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {
            "file": SimpleUploadedFile("tags.pdf", b"%PDF-1.4 tags", content_type="application/pdf"),
            "tags": '["a","b"]',
        },
        format="multipart",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["tags"] == ["a", "b"]
    item = WorkbenchItem.objects.get(pk=payload["id"])
    assert item.tags == ["a", "b"]


@pytest.mark.django_db
def test_upload_material_tags_repeated_keys_are_kept_as_list(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {
            "file": SimpleUploadedFile("tags.pdf", b"%PDF-1.4 tags", content_type="application/pdf"),
            "tags": ["a", "b"],
        },
        format="multipart",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["tags"] == ["a", "b"]
    item = WorkbenchItem.objects.get(pk=payload["id"])
    assert item.tags == ["a", "b"]


@pytest.mark.django_db
def test_upload_material_tags_scalar_string_is_single_tag(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {
            "file": SimpleUploadedFile("tags.pdf", b"%PDF-1.4 tags", content_type="application/pdf"),
            "tags": "abc",
        },
        format="multipart",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["tags"] == ["abc"]
    item = WorkbenchItem.objects.get(pk=payload["id"])
    assert item.tags == ["abc"]


@pytest.mark.django_db
def test_purge_material_deletes_file_from_storage(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    item, detail = create_material(
        users["owner"],
        original_name="purge.pdf",
        content=b"%PDF-1.4 purge",
        content_type="application/pdf",
    )
    file_path = Path(detail.file.path)
    assert file_path.exists()

    delete_response = auth(client, users["owner"]).delete(f"/api/v1/workbench/items/{item.id}/")
    assert delete_response.status_code == 200

    purge_response = auth(client, users["owner"]).delete(f"/api/v1/workbench/trash/{item.id}/purge/")
    assert purge_response.status_code == 204
    assert WorkbenchItem.objects.filter(pk=item.id).count() == 0
    assert WorkbenchMaterialDetail.objects.filter(item_id=item.id).count() == 0
    assert not file_path.exists()


@pytest.mark.django_db
def test_upload_quota_counts_only_owner_non_deleted_materials(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    WorkbenchUserSetting.objects.create(owner=users["owner"], material_quota_bytes=10, upload_disabled=False)
    create_material(users["owner"], original_name="deleted.pdf", content=b"123456789", size=9, deleted=True)
    create_material(users["other"], original_name="other.pdf", content=b"123456789", size=9)
    create_material(users["owner"], original_name="active.pdf", content=b"12", size=2)

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {
            "file": SimpleUploadedFile("new.pdf", b"12345678", content_type="application/pdf"),
        },
        format="multipart",
    )

    assert response.status_code == 201


@pytest.mark.django_db
def test_upload_disabled_returns_400_and_does_not_create_records(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    WorkbenchUserSetting.objects.create(owner=users["owner"], upload_disabled=True)

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {
            "file": SimpleUploadedFile("disabled.pdf", b"%PDF-1.4 disabled", content_type="application/pdf"),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json() == {"file": "material upload is disabled"}
    assert WorkbenchItem.objects.filter(owner=users["owner"], type=WorkbenchItem.Type.MATERIAL).count() == 0
    assert WorkbenchMaterialDetail.objects.filter(item__owner=users["owner"]).count() == 0


@pytest.mark.django_db
def test_upload_without_existing_setting_creates_setting_and_succeeds(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    assert WorkbenchUserSetting.objects.filter(owner=users["owner"]).count() == 0

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/materials/",
        {"file": SimpleUploadedFile("first.pdf", b"%PDF-1.4 first", content_type="application/pdf")},
        format="multipart",
    )

    assert response.status_code == 201
    setting = WorkbenchUserSetting.objects.filter(owner=users["owner"]).first()
    assert setting is not None


@pytest.mark.django_db
def test_upload_file_saved_then_detail_save_failure_cleans_file(tmp_path, settings, users, monkeypatch):
    settings.MEDIA_ROOT = tmp_path
    original_save = WorkbenchMaterialDetail.save

    def _patched_save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        if update_fields == ["file"]:
            raise RuntimeError("detail file save failed")
        return original_save(self, *args, **kwargs)

    monkeypatch.setattr(WorkbenchMaterialDetail, "save", _patched_save)

    with pytest.raises(RuntimeError, match="detail file save failed"):
        upload_material(
            users["owner"],
            {
                "file": SimpleUploadedFile("save-fail.pdf", b"%PDF-1.4 save fail", content_type="application/pdf"),
            },
        )

    assert WorkbenchItem.objects.filter(owner=users["owner"], type=WorkbenchItem.Type.MATERIAL).count() == 0
    assert WorkbenchMaterialDetail.objects.filter(item__owner=users["owner"]).count() == 0
    assert [path for path in tmp_path.rglob("*") if path.is_file()] == []


@pytest.mark.django_db
def test_download_returns_404_when_file_is_missing_on_storage(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.MATERIAL,
        title="missing-file",
    )
    detail = WorkbenchMaterialDetail.objects.create(
        item=item,
        original_name="missing.pdf",
        content_type="application/pdf",
        size=1,
    )
    detail.file.name = "workbench_materials/user_missing/missing.pdf"
    detail.save(update_fields=["file"])

    response = auth(client, users["owner"]).get(f"/api/v1/workbench/materials/{item.id}/download/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_material_detail_returns_404_for_non_material_and_soft_deleted_item(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    note_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="not-material",
    )
    soft_deleted_material, _ = create_material(
        users["owner"],
        original_name="soft.pdf",
        content=b"%PDF-1.4 soft",
        deleted=True,
    )

    non_material_response = auth(client, users["owner"]).get(f"/api/v1/workbench/materials/{note_item.id}/")
    soft_deleted_response = auth(client, users["owner"]).get(
        f"/api/v1/workbench/materials/{soft_deleted_material.id}/"
    )

    assert non_material_response.status_code == 404
    assert soft_deleted_response.status_code == 404


@pytest.mark.django_db
def test_patch_sensitive_material_to_non_sensitive_keeps_update_audit_sensitive(tmp_path, settings, users, client):
    settings.MEDIA_ROOT = tmp_path
    item, _ = create_material(
        users["owner"],
        original_name="sensitive.pdf",
        content=b"%PDF-1.4 sensitive",
        title="sensitive",
    )
    WorkbenchItem.objects.filter(pk=item.id).update(is_sensitive=True)

    response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/materials/{item.id}/",
        {"is_sensitive": False},
        format="json",
    )

    assert response.status_code == 200
    item.refresh_from_db()
    assert item.is_sensitive is False

    log = AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.item.update",
        target_type="workbench_item",
        target_id=item.id,
    ).first()
    assert log is not None
    assert log.is_sensitive is True
    assert log.detail["is_sensitive"] is True
