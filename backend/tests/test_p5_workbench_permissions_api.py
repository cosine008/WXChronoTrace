import json

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.schemas.models import DataSchema, TableCollaborator
from apps.workbench.models import (
    WorkbenchDataCardDetail,
    WorkbenchItem,
    WorkbenchLink,
    WorkbenchMaterialDetail,
    WorkbenchNoteDetail,
)
from apps.workbench.serializers import WorkbenchItemSerializer


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


def _create_note(owner, *, title: str, deleted: bool = False, is_pinned: bool = False) -> WorkbenchItem:
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title=title,
        deleted_at=timezone.now() if deleted else None,
        is_pinned=is_pinned,
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content=f"{title}-markdown")
    return item


def _create_data_card(owner, *, title: str) -> WorkbenchItem:
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.DATA_CARD,
        title=title,
    )
    WorkbenchDataCardDetail.objects.create(item=item, category=WorkbenchDataCardDetail.Category.OTHER)
    return item


def _create_material(owner, *, title: str) -> WorkbenchItem:
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title=title,
    )
    WorkbenchMaterialDetail.objects.create(
        item=item,
        original_name=f"{title}.pdf",
        content_type="application/pdf",
        size=1,
    )
    return item


@pytest.mark.django_db
def test_other_user_cannot_read_owner_item_details(client, users):
    owner_note = _create_note(users["owner"], title="owner-note")
    owner_card = _create_data_card(users["owner"], title="owner-card")
    owner_material = _create_material(users["owner"], title="owner-material")

    note_response = auth(client, users["other"]).get(f"/api/v1/workbench/notes/{owner_note.id}/")
    card_response = auth(client, users["other"]).get(f"/api/v1/workbench/data-cards/{owner_card.id}/")
    material_response = auth(client, users["other"]).get(f"/api/v1/workbench/materials/{owner_material.id}/")

    assert note_response.status_code == 404
    assert card_response.status_code == 404
    assert material_response.status_code == 404


@pytest.mark.django_db
def test_other_user_cannot_delete_owner_item(client, users):
    owner_note = _create_note(users["owner"], title="owner-note")

    response = auth(client, users["other"]).delete(f"/api/v1/workbench/items/{owner_note.id}/")

    assert response.status_code == 404
    owner_note.refresh_from_db()
    assert owner_note.deleted_at is None


@pytest.mark.django_db
def test_owner_cannot_link_to_other_user_private_schema(client, users):
    source_item = _create_note(users["owner"], title="owner-source")
    private_schema = DataSchema.objects.create(
        schema_code="task9_other_private_schema",
        name="task9-other-private-schema",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "id", "type": "text"}],
        owner=users["other"],
        created_by=users["other"],
        visibility=DataSchema.Visibility.PRIVATE,
    )

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": source_item.id, "target_schema_id": private_schema.id},
        format="json",
    )

    assert response.status_code == 404
    assert WorkbenchLink.objects.filter(
        owner=users["owner"],
        source_item=source_item,
        target_schema=private_schema,
    ).count() == 0


@pytest.mark.django_db
def test_inaccessible_target_schema_uses_safe_summary_in_item_detail(client, users):
    source_item = _create_note(users["owner"], title="owner-source")
    sensitive_schema_code = "task9_sensitive_schema_code"
    sensitive_schema_name = "Task 9 Sensitive Schema Name"
    sensitive_field_label = "Task 9 Sensitive Field Label"
    schema = DataSchema.objects.create(
        schema_code=sensitive_schema_code,
        name=sensitive_schema_name,
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": sensitive_field_label, "type": "text"}],
        owner=users["other"],
        created_by=users["other"],
        visibility=DataSchema.Visibility.SHARED,
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["owner"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["other"],
    )

    create_link_response = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": source_item.id, "target_schema_id": schema.id},
        format="json",
    )
    assert create_link_response.status_code == 201
    created_link_id = create_link_response.json()["id"]

    TableCollaborator.objects.filter(schema=schema, user=users["owner"]).delete()
    schema.visibility = DataSchema.Visibility.PRIVATE
    schema.save(update_fields=["visibility"])

    response = auth(client, users["owner"]).get(f"/api/v1/workbench/notes/{source_item.id}/")

    assert response.status_code == 200
    payload = response.json()
    assert "links" in payload
    assert len(payload["links"]) == 1
    link_payload = payload["links"][0]
    assert link_payload["id"] == created_link_id
    assert link_payload["target_schema"] == {
        "id": schema.id,
        "name": None,
        "accessible": False,
    }
    assert link_payload["target_item"] is None
    assert set(link_payload["target_schema"].keys()) == {"id", "name", "accessible"}

    payload_text = json.dumps(payload, ensure_ascii=False)
    assert sensitive_schema_code not in payload_text
    assert sensitive_schema_name not in payload_text
    assert sensitive_field_label not in payload_text
    assert "fields_config" not in payload_text


@pytest.mark.django_db
def test_soft_deleted_target_item_is_masked_in_source_item_links(client, users):
    source_item = _create_note(users["owner"], title="owner-source")
    sensitive_target_title = "Task9 Hidden Target Note Title"
    target_item = _create_note(users["owner"], title=sensitive_target_title)
    WorkbenchLink.objects.create(
        owner=users["owner"],
        source_item=source_item,
        target_item=target_item,
    )
    WorkbenchItem.objects.filter(pk=target_item.id).update(deleted_at=timezone.now())

    response = auth(client, users["owner"]).get(f"/api/v1/workbench/notes/{source_item.id}/")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["links"]) == 1
    link_payload = payload["links"][0]
    assert link_payload["target_schema"] is None
    assert link_payload["target_item"] == {
        "id": target_item.id,
        "title": None,
        "type": None,
        "accessible": False,
    }
    payload_text = json.dumps(payload, ensure_ascii=False)
    assert sensitive_target_title not in payload_text


@pytest.mark.django_db
def test_overview_links_keep_accessible_summaries_when_request_context_exists(client, users):
    source_item = _create_note(users["owner"], title="overview-source", is_pinned=True)
    target_item = _create_note(users["owner"], title="overview-target-item")
    target_schema = DataSchema.objects.create(
        schema_code="task9_overview_visible_schema",
        name="overview-visible-schema",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "id", "type": "text"}],
        owner=users["owner"],
        created_by=users["owner"],
        visibility=DataSchema.Visibility.PRIVATE,
    )
    item_link = WorkbenchLink.objects.create(
        owner=users["owner"],
        source_item=source_item,
        target_item=target_item,
    )
    schema_link = WorkbenchLink.objects.create(
        owner=users["owner"],
        source_item=source_item,
        target_schema=target_schema,
    )

    response = auth(client, users["owner"]).get("/api/v1/workbench/overview/")

    assert response.status_code == 200
    payload = response.json()
    source_payload = next(item for item in payload["pinned"] if item["id"] == source_item.id)
    links_by_id = {link["id"]: link for link in source_payload["links"]}
    assert links_by_id[item_link.id]["target_item"] == {
        "id": target_item.id,
        "title": target_item.title,
        "type": target_item.type,
        "accessible": True,
    }
    assert links_by_id[item_link.id]["target_schema"] is None
    assert links_by_id[schema_link.id]["target_item"] is None
    assert links_by_id[schema_link.id]["target_schema"] == {
        "id": target_schema.id,
        "name": target_schema.name,
        "accessible": True,
    }


@pytest.mark.django_db
def test_search_only_returns_current_user_items(client, users):
    match_query = "task9-shared-query"
    owner_note = _create_note(users["owner"], title=f"owner-{match_query}")
    _create_note(users["other"], title=f"other-{match_query}")

    response = auth(client, users["owner"]).get(f"/api/v1/workbench/search/?q={match_query}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert [item["id"] for item in payload["results"]] == [owner_note.id]


@pytest.mark.django_db
def test_trash_only_returns_current_user_deleted_items(client, users):
    owner_deleted = _create_note(users["owner"], title="owner-deleted", deleted=True)
    _create_note(users["owner"], title="owner-visible", deleted=False)
    _create_note(users["other"], title="other-deleted", deleted=True)

    response = auth(client, users["owner"]).get("/api/v1/workbench/trash/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert [item["id"] for item in payload["results"]] == [owner_deleted.id]


@pytest.mark.django_db
def test_serializer_without_request_context_masks_link_targets(users):
    source_item = _create_note(users["owner"], title="source-no-context")
    target_item = _create_note(users["owner"], title="target-no-context")
    schema = DataSchema.objects.create(
        schema_code="task9_contextless_schema",
        name="contextless-schema",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "id", "type": "text"}],
        owner=users["owner"],
        created_by=users["owner"],
        visibility=DataSchema.Visibility.PUBLIC,
    )
    item_link = WorkbenchLink.objects.create(
        owner=users["owner"],
        source_item=source_item,
        target_item=target_item,
    )
    schema_link = WorkbenchLink.objects.create(
        owner=users["owner"],
        source_item=source_item,
        target_schema=schema,
    )

    payload = WorkbenchItemSerializer(source_item).data
    links_by_id = {link["id"]: link for link in payload["links"]}

    assert links_by_id[item_link.id]["target_item"] == {
        "id": target_item.id,
        "title": None,
        "type": None,
        "accessible": False,
    }
    assert links_by_id[item_link.id]["target_schema"] is None
    assert links_by_id[schema_link.id]["target_item"] is None
    assert links_by_id[schema_link.id]["target_schema"] == {
        "id": schema.id,
        "name": None,
        "accessible": False,
    }
