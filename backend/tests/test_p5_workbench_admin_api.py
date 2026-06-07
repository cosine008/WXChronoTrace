import json

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.schemas.models import DataSchema
from apps.workbench.models import (
    WorkbenchDataCardDetail,
    WorkbenchDataCardField,
    WorkbenchItem,
    WorkbenchLink,
    WorkbenchMaterialDetail,
    WorkbenchNoteDetail,
    WorkbenchUserSetting,
)


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def users(db):
    return {
        "admin": User.objects.create_superuser(username="admin", email="admin@example.com", password="pass"),
        "owner": User.objects.create_user(username="owner", password="pass"),
        "other": User.objects.create_user(username="other", password="pass"),
    }


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def _stamp_updated_at(item: WorkbenchItem, updated_at):
    WorkbenchItem.objects.filter(pk=item.id).update(updated_at=updated_at)
    item.refresh_from_db()
    return item


def _create_data_card(
    owner,
    *,
    title: str,
    field_value: str,
    is_pinned: bool = False,
    deleted: bool = False,
    updated_at=None,
):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.DATA_CARD,
        title=title,
        is_pinned=is_pinned,
        deleted_at=timezone.now() if deleted else None,
    )
    detail = WorkbenchDataCardDetail.objects.create(item=item, category=WorkbenchDataCardDetail.Category.OTHER)
    WorkbenchDataCardField.objects.create(
        card=detail,
        name="field",
        value=field_value,
        value_type=WorkbenchDataCardField.ValueType.TEXT,
        sort_order=0,
    )
    if updated_at is not None:
        _stamp_updated_at(item, updated_at)
    return item


def _create_note(
    owner,
    *,
    title: str,
    markdown_content: str,
    is_pinned: bool = False,
    deleted: bool = False,
    updated_at=None,
):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title=title,
        is_pinned=is_pinned,
        deleted_at=timezone.now() if deleted else None,
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content=markdown_content)
    if updated_at is not None:
        _stamp_updated_at(item, updated_at)
    return item


def _create_material(
    owner,
    *,
    title: str,
    original_name: str,
    size: int,
    file_name: str = "",
    is_pinned: bool = False,
    deleted: bool = False,
    updated_at=None,
):
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title=title,
        is_pinned=is_pinned,
        deleted_at=timezone.now() if deleted else None,
    )
    detail = WorkbenchMaterialDetail.objects.create(
        item=item,
        original_name=original_name,
        content_type="application/octet-stream",
        size=size,
    )
    if file_name:
        detail.file.name = file_name
        detail.save(update_fields=["file"])
    if updated_at is not None:
        _stamp_updated_at(item, updated_at)
    return item


@pytest.mark.django_db
def test_workbench_overview_returns_owner_metrics_and_lists_without_deleted_or_other_users(client, users):
    base = timezone.now()
    owner = users["owner"]
    other = users["other"]

    pinned_card = _create_data_card(
        owner,
        title="owner-card",
        field_value="owner-visible-card-value",
        is_pinned=True,
        updated_at=base - timezone.timedelta(minutes=10),
    )
    pinned_note = _create_note(
        owner,
        title="owner-note-pinned",
        markdown_content="owner-note-content",
        is_pinned=True,
        updated_at=base - timezone.timedelta(minutes=1),
    )
    recent_note = _create_note(
        owner,
        title="owner-note-recent",
        markdown_content="owner-note-recent-content",
        updated_at=base - timezone.timedelta(minutes=2),
    )
    pinned_material = _create_material(
        owner,
        title="owner-material-pinned",
        original_name="owner.pdf",
        size=700,
        is_pinned=True,
        updated_at=base - timezone.timedelta(minutes=3),
    )
    recent_material = _create_material(
        owner,
        title="owner-material-recent",
        original_name="owner2.pdf",
        size=324,
        updated_at=base - timezone.timedelta(minutes=4),
    )

    _create_note(
        owner,
        title="owner-note-deleted",
        markdown_content="deleted-owner-note",
        deleted=True,
    )
    _create_material(
        owner,
        title="owner-material-deleted",
        original_name="deleted-owner.pdf",
        size=4096,
        deleted=True,
    )
    _create_note(
        other,
        title="other-note",
        markdown_content="other-user-note",
        is_pinned=True,
    )
    _create_material(
        other,
        title="other-material",
        original_name="other.pdf",
        size=8192,
        is_pinned=True,
    )

    response = auth(client, owner).get("/api/v1/workbench/overview/")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload.keys()) == {"metrics", "note_summary", "pinned", "recent_notes", "recent_materials"}
    assert payload["metrics"] == {
        "data_card_count": 1,
        "note_count": 2,
        "material_count": 2,
        "storage_used_bytes": 1024,
    }
    assert payload["note_summary"] == {
        "total_count": 2,
        "pending_confirm_count": 0,
        "homepage_count": 2,
    }
    assert [item["id"] for item in payload["pinned"]] == [pinned_note.id, pinned_material.id, pinned_card.id]
    assert [item["id"] for item in payload["recent_notes"]] == [pinned_note.id, recent_note.id]
    assert [item["id"] for item in payload["recent_materials"]] == [pinned_material.id, recent_material.id]
    assert all(item["type"] in {WorkbenchItem.Type.DATA_CARD, WorkbenchItem.Type.NOTE, WorkbenchItem.Type.MATERIAL} for item in payload["pinned"])
    assert all(item["type"] == WorkbenchItem.Type.NOTE for item in payload["recent_notes"])
    assert all(item["type"] == WorkbenchItem.Type.MATERIAL for item in payload["recent_materials"])


@pytest.mark.django_db
def test_workbench_overview_applies_limits_for_pinned_and_recent_lists(client, users):
    owner = users["owner"]
    base = timezone.now()

    for index in range(9):
        _create_note(
            owner,
            title=f"pinned-note-{index}",
            markdown_content=f"pinned-note-{index}-content",
            is_pinned=True,
            updated_at=base - timezone.timedelta(minutes=index),
        )
    for index in range(6):
        _create_note(
            owner,
            title=f"recent-note-{index}",
            markdown_content=f"recent-note-{index}-content",
            updated_at=base - timezone.timedelta(hours=1, minutes=index),
        )
    pending_note_ids = []
    for index in range(2):
        note = _create_note(
            owner,
            title=f"pending-note-{index}",
            markdown_content=f"pending-note-{index}-content",
            updated_at=base - timezone.timedelta(hours=2, minutes=index),
        )
        WorkbenchNoteDetail.objects.filter(item=note).update(status=WorkbenchNoteDetail.Status.PENDING_CONFIRM)
        pending_note_ids.append(note.id)
    _create_note(
        owner,
        title="deleted-pending-note",
        markdown_content="deleted-pending-note-content",
        deleted=True,
    )
    WorkbenchNoteDetail.objects.filter(item__title="deleted-pending-note").update(
        status=WorkbenchNoteDetail.Status.PENDING_CONFIRM
    )

    for index in range(6):
        _create_material(
            owner,
            title=f"recent-material-{index}",
            original_name=f"recent-material-{index}.pdf",
            size=10 + index,
            updated_at=base - timezone.timedelta(minutes=index),
        )

    response = auth(client, owner).get("/api/v1/workbench/overview/")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["pinned"]) == 8
    assert len(payload["recent_notes"]) == 3
    assert [item["id"] for item in payload["recent_notes"][:2]] == pending_note_ids
    assert len(payload["recent_materials"]) == 5
    assert payload["note_summary"] == {
        "total_count": 17,
        "pending_confirm_count": 2,
        "homepage_count": 3,
    }


@pytest.mark.django_db
def test_admin_workbench_users_requires_superuser(client, users):
    response = auth(client, users["owner"]).get("/api/v1/admin/workbench/users/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_admin_workbench_users_returns_capacity_only_and_avoids_content_leak(client, users):
    owner = users["owner"]

    leaked_markdown = "LEAK_MARKDOWN_SHOULD_NOT_APPEAR"
    leaked_field_value = "LEAK_FIELD_VALUE_SHOULD_NOT_APPEAR"
    leaked_file_name = "LEAK_FILENAME_SHOULD_NOT_APPEAR.pdf"
    leaked_file_path = "workbench_materials/secret_path/LEAK_FILE_PATH_SHOULD_NOT_APPEAR.bin"
    leaked_schema_code = "leak_schema_code_should_not_appear"
    leaked_field_config = "LEAK_FIELD_CONFIG_SHOULD_NOT_APPEAR"

    note_item = _create_note(
        owner,
        title="owner-note",
        markdown_content=leaked_markdown,
        is_pinned=True,
    )
    _create_data_card(
        owner,
        title="owner-card-1",
        field_value=leaked_field_value,
    )
    _create_data_card(
        owner,
        title="owner-card-2",
        field_value=leaked_field_value,
    )
    _create_note(
        owner,
        title="owner-note-2",
        markdown_content=leaked_markdown,
    )
    _create_note(
        owner,
        title="owner-note-3",
        markdown_content=leaked_markdown,
    )
    _create_material(
        owner,
        title="owner-material",
        original_name=leaked_file_name,
        file_name=leaked_file_path,
        size=1024,
    )

    schema = DataSchema.objects.create(
        schema_code=leaked_schema_code,
        name="leak-schema",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": leaked_field_config, "type": "text"}],
        owner=owner,
        created_by=owner,
    )
    WorkbenchLink.objects.create(owner=owner, source_item=note_item, target_schema=schema)
    WorkbenchUserSetting.objects.create(owner=owner, upload_disabled=False)

    response = auth(client, users["admin"]).get("/api/v1/admin/workbench/users/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert len(payload["results"]) == 1

    row = payload["results"][0]
    assert row == {
        "user_id": owner.id,
        "username": "owner",
        "data_card_count": 2,
        "note_count": 3,
        "material_count": 1,
        "storage_used_bytes": 1024,
        "upload_disabled": False,
    }

    forbidden_keys = {
        "markdown_content",
        "fields",
        "value",
        "file",
        "original_name",
        "schema_code",
        "fields_config",
        "detail",
        "items",
    }
    assert forbidden_keys.isdisjoint(set(row.keys()))

    payload_text = json.dumps(payload, ensure_ascii=False)
    for forbidden_text in [
        leaked_markdown,
        leaked_field_value,
        leaked_file_name,
        leaked_file_path,
        leaked_schema_code,
        leaked_field_config,
    ]:
        assert forbidden_text not in payload_text
