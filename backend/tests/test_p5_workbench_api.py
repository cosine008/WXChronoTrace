import pytest
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.schemas.models import DataSchema
from apps.workbench.models import (
    WorkbenchDataCardDetail,
    WorkbenchDataCardField,
    WorkbenchItem,
    WorkbenchLink,
    WorkbenchMaterialDetail,
    WorkbenchNoteDetail,
)
from apps.workbench.search import search_items
from apps.workbench.selectors import owned_item, visible_items
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


@pytest.fixture
def schema(users):
    return DataSchema.objects.create(
        schema_code="workbench_api_schema",
        name="workbench-api-schema",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "编号", "type": "text"}],
        owner=users["owner"],
        created_by=users["owner"],
    )


@pytest.mark.django_db
def test_visible_items_and_owned_item_scope_to_owner_and_deleted_flag(users):
    owned_visible = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-visible",
    )
    owned_deleted = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-deleted",
        deleted_at=timezone.now(),
    )
    other_visible = WorkbenchItem.objects.create(
        owner=users["other"],
        type=WorkbenchItem.Type.NOTE,
        title="other-visible",
    )

    visible_ids = list(visible_items(users["owner"]).values_list("id", flat=True))
    assert visible_ids == [owned_visible.id]
    assert owned_item(users["owner"], owned_visible.id).id == owned_visible.id
    assert owned_item(users["owner"], owned_deleted.id) is None
    assert owned_item(users["owner"], owned_deleted.id, include_deleted=True).id == owned_deleted.id
    assert owned_item(users["owner"], other_visible.id, include_deleted=True) is None


@pytest.mark.django_db
def test_search_matches_note_content_filters_owner_and_tag(users):
    owned = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="import-note",
        tags=["hr", "payroll"],
    )
    WorkbenchNoteDetail.objects.create(item=owned, markdown_content="civil-servant baseline")
    WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="no-tag-match",
        tags=["tax"],
    )
    other = WorkbenchItem.objects.create(
        owner=users["other"],
        type=WorkbenchItem.Type.NOTE,
        title="other-note",
        tags=["hr"],
    )
    WorkbenchNoteDetail.objects.create(item=other, markdown_content="civil-servant baseline")

    result_ids = list(search_items(users["owner"], query="civil-servant").values_list("id", flat=True))
    assert result_ids == [owned.id]

    tagged_ids = list(search_items(users["owner"], query="civil-servant", tag="hr").values_list("id", flat=True))
    assert tagged_ids == [owned.id]

    empty_ids = list(search_items(users["owner"], query="civil-servant", tag="missing").values_list("id", flat=True))
    assert empty_ids == []


@pytest.mark.django_db
def test_search_data_card_field_query_returns_distinct_item(users):
    card_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="social-policy-card",
    )
    card = WorkbenchDataCardDetail.objects.create(
        item=card_item,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )
    WorkbenchDataCardField.objects.create(
        card=card,
        name="salary policy field A",
        value="salary policy",
        value_type=WorkbenchDataCardField.ValueType.TEXT,
        sort_order=1,
    )
    WorkbenchDataCardField.objects.create(
        card=card,
        name="salary policy field B",
        value="salary policy",
        value_type=WorkbenchDataCardField.ValueType.TEXT,
        sort_order=2,
    )

    ids = list(search_items(users["owner"], query="salary policy").values_list("id", flat=True))
    assert ids == [card_item.id]


@pytest.mark.django_db
def test_serializer_returns_empty_detail_when_type_detail_is_missing(users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="missing-note-detail",
    )

    payload = WorkbenchItemSerializer(item).data

    assert payload["detail"] == {}


@pytest.mark.django_db
def test_material_serializer_download_and_preview_url(users):
    image_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.MATERIAL,
        title="img",
    )
    WorkbenchMaterialDetail.objects.create(
        item=image_item,
        original_name="proof.png",
        content_type="image/png",
        size=16,
        preview_status=WorkbenchMaterialDetail.PreviewStatus.IMAGE,
    )

    text_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.MATERIAL,
        title="txt",
    )
    WorkbenchMaterialDetail.objects.create(
        item=text_item,
        original_name="memo.txt",
        content_type="text/plain",
        size=16,
        preview_status=WorkbenchMaterialDetail.PreviewStatus.TEXT,
    )

    image_payload = WorkbenchItemSerializer(image_item).data["detail"]
    text_payload = WorkbenchItemSerializer(text_item).data["detail"]

    assert image_payload["download_url"] == f"/api/v1/workbench/materials/{image_item.id}/download/"
    assert image_payload["preview_url"] == f"/api/v1/workbench/materials/{image_item.id}/download/"
    assert text_payload["download_url"] == f"/api/v1/workbench/materials/{text_item.id}/download/"
    assert text_payload["preview_url"] is None


@pytest.mark.django_db
def test_item_list_is_limited_to_owner(client, users):
    owned = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="my-import-note",
    )
    WorkbenchNoteDetail.objects.create(item=owned, markdown_content="owner-visible")
    other = WorkbenchItem.objects.create(
        owner=users["other"],
        type=WorkbenchItem.Type.NOTE,
        title="others-note",
    )
    WorkbenchNoteDetail.objects.create(item=other, markdown_content="hidden")

    response = auth(client, users["owner"]).get("/api/v1/workbench/items/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == owned.id


@pytest.mark.django_db
def test_item_list_invalid_type_returns_400(client, users):
    response = auth(client, users["owner"]).get("/api/v1/workbench/items/?type=invalid-type")
    assert response.status_code == 400
    assert "type" in response.json()


@pytest.mark.django_db
def test_search_matches_note_content_and_hides_other_users(client, users):
    owned = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="import-record",
    )
    WorkbenchNoteDetail.objects.create(item=owned, markdown_content="civil-servant baseline")
    other = WorkbenchItem.objects.create(
        owner=users["other"],
        type=WorkbenchItem.Type.NOTE,
        title="civil-servant",
    )
    WorkbenchNoteDetail.objects.create(item=other, markdown_content="hidden")

    response = auth(client, users["owner"]).get("/api/v1/workbench/search/?q=civil-servant")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == owned.id


@pytest.mark.django_db
def test_soft_delete_restore_and_purge(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="deletable-note",
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")
    original_updated_at = item.updated_at

    delete_response = auth(client, users["owner"]).delete(f"/api/v1/workbench/items/{item.id}/")
    assert delete_response.status_code == 200
    item.refresh_from_db()
    assert item.deleted_at is not None
    assert item.updated_at != original_updated_at
    deleted_updated_at = item.updated_at

    restore_response = auth(client, users["owner"]).post(f"/api/v1/workbench/trash/{item.id}/restore/")
    assert restore_response.status_code == 200
    item.refresh_from_db()
    assert item.deleted_at is None
    assert item.updated_at != deleted_updated_at

    auth(client, users["owner"]).delete(f"/api/v1/workbench/items/{item.id}/")
    purge_response = auth(client, users["owner"]).delete(f"/api/v1/workbench/trash/{item.id}/purge/")
    assert purge_response.status_code == 204
    assert WorkbenchItem.objects.filter(pk=item.id).count() == 0


@pytest.mark.django_db
def test_create_schema_link_is_owner_scoped(client, users, schema):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="linked-note",
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": item.id, "target_schema_id": schema.id},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["source_item_id"] == item.id
    assert response.json()["target_schema_id"] == schema.id
    assert WorkbenchLink.objects.filter(source_item=item, target_schema=schema).exists()
    assert AuditLog.objects.filter(action="workbench.link.create", actor=users["owner"]).exists()


@pytest.mark.django_db
def test_create_link_requires_exactly_one_target(client, users, schema):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="link-validate-note",
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")

    missing_target = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": item.id},
        format="json",
    )
    assert missing_target.status_code == 400
    assert "non_field_errors" in missing_target.json()

    both_targets = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": item.id, "target_item_id": item.id, "target_schema_id": schema.id},
        format="json",
    )
    assert both_targets.status_code == 400
    assert "non_field_errors" in both_targets.json()


@pytest.mark.django_db
def test_create_same_link_twice_returns_200_and_single_create_audit(client, users, schema):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="idempotent-link-note",
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")

    first = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": item.id, "target_schema_id": schema.id},
        format="json",
    )
    second = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": item.id, "target_schema_id": schema.id},
        format="json",
    )

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert AuditLog.objects.filter(action="workbench.link.create", actor=users["owner"]).count() == 1


@pytest.mark.django_db
def test_other_user_cannot_delete_owner_item(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-note",
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")

    response = auth(client, users["other"]).delete(f"/api/v1/workbench/items/{item.id}/")

    assert response.status_code == 404
    item.refresh_from_db()
    assert item.deleted_at is None


@pytest.mark.django_db
def test_other_user_cannot_restore_or_purge_owner_deleted_item(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-deleted-note",
        deleted_at=timezone.now(),
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")
    deleted_at_before = item.deleted_at

    restore_response = auth(client, users["other"]).post(f"/api/v1/workbench/trash/{item.id}/restore/")
    purge_response = auth(client, users["other"]).delete(f"/api/v1/workbench/trash/{item.id}/purge/")

    assert restore_response.status_code == 404
    assert purge_response.status_code == 404
    item.refresh_from_db()
    assert item.deleted_at == deleted_at_before
    assert WorkbenchItem.objects.filter(pk=item.id).exists()


@pytest.mark.django_db
def test_other_user_cannot_create_link_with_owner_source_item(client, users, schema):
    source_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-source",
    )
    WorkbenchNoteDetail.objects.create(item=source_item, markdown_content="content")

    response = auth(client, users["other"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": source_item.id, "target_schema_id": schema.id},
        format="json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_other_user_cannot_delete_owner_link(client, users, schema):
    source_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-linked-note",
    )
    WorkbenchNoteDetail.objects.create(item=source_item, markdown_content="content")
    link = WorkbenchLink.objects.create(owner=users["owner"], source_item=source_item, target_schema=schema)

    response = auth(client, users["other"]).delete(f"/api/v1/workbench/links/{link.id}/")

    assert response.status_code == 404
    assert WorkbenchLink.objects.filter(pk=link.id).exists()


@pytest.mark.django_db
def test_owner_cannot_link_to_other_users_private_schema(client, users):
    source_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-source-note",
    )
    WorkbenchNoteDetail.objects.create(item=source_item, markdown_content="content")
    private_schema = DataSchema.objects.create(
        schema_code="other_private_schema",
        name="other-private-schema",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "id", "type": "text"}],
        owner=users["other"],
        created_by=users["other"],
    )

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": source_item.id, "target_schema_id": private_schema.id},
        format="json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_sensitive_item_audit_logs_are_sensitive_for_delete_and_link_actions(client, users):
    source_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="sensitive-source-note",
        is_sensitive=True,
    )
    WorkbenchNoteDetail.objects.create(item=source_item, markdown_content="secret")
    target_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="target-note",
    )
    WorkbenchNoteDetail.objects.create(item=target_item, markdown_content="target")

    create_response = auth(client, users["owner"]).post(
        "/api/v1/workbench/links/",
        {"source_item_id": source_item.id, "target_item_id": target_item.id},
        format="json",
    )
    assert create_response.status_code == 201
    link_id = create_response.json()["id"]

    delete_link_response = auth(client, users["owner"]).delete(f"/api/v1/workbench/links/{link_id}/")
    assert delete_link_response.status_code == 204

    delete_item_response = auth(client, users["owner"]).delete(f"/api/v1/workbench/items/{source_item.id}/")
    assert delete_item_response.status_code == 200

    assert AuditLog.objects.filter(
        action="workbench.link.create",
        actor=users["owner"],
        is_sensitive=True,
    ).exists()
    assert AuditLog.objects.filter(
        action="workbench.link.delete",
        actor=users["owner"],
        is_sensitive=True,
    ).exists()
    assert AuditLog.objects.filter(
        action="workbench.item.delete",
        actor=users["owner"],
        is_sensitive=True,
    ).exists()


def _data_card_create_payload(*, is_sensitive: bool = False):
    return {
        "title": "2026 年事业单位缴费基数",
        "summary": "社保缴费基数摘要",
        "tags": ["社保", "2026"],
        "is_pinned": False,
        "is_sensitive": is_sensitive,
        "category": WorkbenchDataCardDetail.Category.SOCIAL_SECURITY,
        "applicable_year": 2026,
        "applicable_region": "杭州",
        "applicable_subject": "事业单位",
        "effective_from": "2026-01-01",
        "effective_to": "2026-12-31",
        "status": WorkbenchDataCardDetail.Status.CONFIRMED,
        "remark": "以正式通知为准",
        "fields": [
            {
                "name": "养老基数下限",
                "value": "5000",
                "value_type": WorkbenchDataCardField.ValueType.MONEY,
                "unit": "元",
            },
            {
                "name": "养老基数上限",
                "value": "25000",
                "value_type": WorkbenchDataCardField.ValueType.MONEY,
                "unit": "元",
            },
        ],
    }


@pytest.mark.django_db
def test_create_data_card_creates_item_and_audit(client, users):
    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/data-cards/",
        _data_card_create_payload(),
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["type"] == WorkbenchItem.Type.DATA_CARD
    assert payload["title"] == "2026 年事业单位缴费基数"
    assert payload["detail"]["fields"][0]["name"] == "养老基数下限"
    assert payload["detail"]["fields"][0]["sort_order"] == 0
    assert payload["detail"]["fields"][1]["sort_order"] == 1

    item = WorkbenchItem.objects.get(pk=payload["id"])
    assert item.owner_id == users["owner"].id
    assert item.type == WorkbenchItem.Type.DATA_CARD
    assert item.tags == ["社保", "2026"]
    assert item.data_card_detail.category == WorkbenchDataCardDetail.Category.SOCIAL_SECURITY
    assert list(item.data_card_detail.fields.values_list("name", flat=True)) == ["养老基数下限", "养老基数上限"]

    log = AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.item.create",
        target_type="workbench_item",
        target_id=item.id,
    ).first()
    assert log is not None
    assert log.detail["type"] == WorkbenchItem.Type.DATA_CARD
    assert log.detail["is_sensitive"] is False
    assert "fields" not in log.detail
    assert "value" not in str(log.detail)


@pytest.mark.django_db
def test_data_card_list_returns_only_owner_non_deleted_data_cards(client, users):
    owner_card = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="owner-card",
    )
    owner_card_detail = WorkbenchDataCardDetail.objects.create(
        item=owner_card,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )
    WorkbenchDataCardField.objects.create(card=owner_card_detail, name="name", value="value")
    owner_deleted_card = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="owner-deleted-card",
        deleted_at=timezone.now(),
    )
    WorkbenchDataCardDetail.objects.create(
        item=owner_deleted_card,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )
    owner_note = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-note",
    )
    WorkbenchNoteDetail.objects.create(item=owner_note, markdown_content="note")
    other_card = WorkbenchItem.objects.create(
        owner=users["other"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="other-card",
    )
    WorkbenchDataCardDetail.objects.create(
        item=other_card,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )

    response = auth(client, users["owner"]).get("/api/v1/workbench/data-cards/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert [item["id"] for item in payload["results"]] == [owner_card.id]
    assert payload["results"][0]["type"] == WorkbenchItem.Type.DATA_CARD


@pytest.mark.django_db
def test_data_card_detail_requires_owner_and_data_card_type(client, users):
    card_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="owner-card",
    )
    WorkbenchDataCardDetail.objects.create(
        item=card_item,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )
    note_item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-note",
    )
    WorkbenchNoteDetail.objects.create(item=note_item, markdown_content="note")

    ok_response = auth(client, users["owner"]).get(f"/api/v1/workbench/data-cards/{card_item.id}/")
    assert ok_response.status_code == 200
    assert ok_response.json()["id"] == card_item.id

    forbidden_response = auth(client, users["other"]).get(f"/api/v1/workbench/data-cards/{card_item.id}/")
    assert forbidden_response.status_code == 404

    non_card_response = auth(client, users["owner"]).get(f"/api/v1/workbench/data-cards/{note_item.id}/")
    assert non_card_response.status_code == 404


@pytest.mark.django_db
def test_patch_data_card_updates_item_replaces_fields_and_writes_sensitive_audit(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="2026 年事业单位缴费基数",
        tags=["旧标签"],
        summary="旧摘要",
        is_sensitive=False,
    )
    detail = WorkbenchDataCardDetail.objects.create(
        item=item,
        category=WorkbenchDataCardDetail.Category.SOCIAL_SECURITY,
        applicable_year=2026,
        applicable_region="杭州",
        status=WorkbenchDataCardDetail.Status.CONFIRMED,
    )
    old_field_ids = [
        WorkbenchDataCardField.objects.create(
            card=detail,
            name="养老基数下限",
            value="5000",
            value_type=WorkbenchDataCardField.ValueType.MONEY,
            unit="元",
            sort_order=0,
        ).id,
        WorkbenchDataCardField.objects.create(
            card=detail,
            name="养老基数上限",
            value="25000",
            value_type=WorkbenchDataCardField.ValueType.MONEY,
            unit="元",
            sort_order=1,
        ).id,
    ]

    patch_payload = {
        "title": "2026 年事业单位缴费基数（修订）",
        "summary": "修订后摘要",
        "tags": ["社保", "修订"],
        "is_pinned": True,
        "is_sensitive": True,
        "applicable_year": 2027,
        "applicable_region": "宁波",
        "status": WorkbenchDataCardDetail.Status.DRAFT,
        "fields": [
            {
                "name": "养老基数下限",
                "value": "5100",
                "value_type": WorkbenchDataCardField.ValueType.MONEY,
                "unit": "元",
                "sort_order": 0,
            },
            {
                "name": "养老基数上限",
                "value": "26000",
                "value_type": WorkbenchDataCardField.ValueType.MONEY,
                "unit": "元",
                "sort_order": 1,
            },
        ],
    }
    response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/data-cards/{item.id}/",
        patch_payload,
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "2026 年事业单位缴费基数（修订）"
    assert payload["tags"] == ["社保", "修订"]
    assert payload["is_pinned"] is True
    assert payload["is_sensitive"] is True
    assert payload["detail"]["applicable_year"] == 2027
    assert payload["detail"]["applicable_region"] == "宁波"
    assert payload["detail"]["status"] == WorkbenchDataCardDetail.Status.DRAFT
    assert [field["name"] for field in payload["detail"]["fields"]] == ["养老基数下限", "养老基数上限"]

    item.refresh_from_db()
    assert item.title == "2026 年事业单位缴费基数（修订）"
    assert item.summary == "修订后摘要"
    assert item.tags == ["社保", "修订"]
    assert item.is_pinned is True
    assert item.is_sensitive is True
    detail.refresh_from_db()
    assert detail.applicable_year == 2027
    assert detail.applicable_region == "宁波"
    assert detail.status == WorkbenchDataCardDetail.Status.DRAFT
    new_fields = list(detail.fields.order_by("sort_order", "id"))
    assert [field.name for field in new_fields] == ["养老基数下限", "养老基数上限"]
    assert set(old_field_ids).isdisjoint({field.id for field in new_fields})

    log = AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.item.update",
        target_type="workbench_item",
        target_id=item.id,
    ).first()
    assert log is not None
    assert log.is_sensitive is True
    assert log.detail["type"] == WorkbenchItem.Type.DATA_CARD
    assert log.detail["is_sensitive"] is True
    assert "fields" not in log.detail
    assert "5100" not in str(log.detail)
    assert "26000" not in str(log.detail)


@pytest.mark.django_db
def test_copy_data_card_text_formats_lines_without_extra_unit_spaces(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="2026 年事业单位缴费基数",
    )
    detail = WorkbenchDataCardDetail.objects.create(
        item=item,
        category=WorkbenchDataCardDetail.Category.SOCIAL_SECURITY,
    )
    WorkbenchDataCardField.objects.create(
        card=detail,
        name="养老基数下限",
        value="5000",
        value_type=WorkbenchDataCardField.ValueType.MONEY,
        unit="元",
        sort_order=0,
    )
    WorkbenchDataCardField.objects.create(
        card=detail,
        name="养老基数上限",
        value="25000",
        value_type=WorkbenchDataCardField.ValueType.MONEY,
        unit="",
        sort_order=1,
    )
    WorkbenchDataCardField.objects.create(
        card=detail,
        name="备注",
        value="",
        value_type=WorkbenchDataCardField.ValueType.TEXT,
        sort_order=2,
    )

    response = auth(client, users["owner"]).post(f"/api/v1/workbench/data-cards/{item.id}/copy-text/")

    assert response.status_code == 200
    assert response.json()["text"] == (
        "2026 年事业单位缴费基数\n养老基数下限：5000 元\n养老基数上限：25000\n备注："
    )


@pytest.mark.django_db
def test_other_user_cannot_patch_or_copy_owner_data_card(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="owner-card",
    )
    detail = WorkbenchDataCardDetail.objects.create(
        item=item,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )
    WorkbenchDataCardField.objects.create(
        card=detail,
        name="字段",
        value="值",
        value_type=WorkbenchDataCardField.ValueType.TEXT,
    )

    patch_response = auth(client, users["other"]).patch(
        f"/api/v1/workbench/data-cards/{item.id}/",
        {"title": "should-fail"},
        format="json",
    )
    copy_response = auth(client, users["other"]).post(f"/api/v1/workbench/data-cards/{item.id}/copy-text/")

    assert patch_response.status_code == 404
    assert copy_response.status_code == 404


@pytest.mark.django_db
def test_sensitive_data_card_create_audit_log_is_sensitive(client, users):
    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/data-cards/",
        _data_card_create_payload(is_sensitive=True),
        format="json",
    )
    assert response.status_code == 201

    item_id = response.json()["id"]
    assert AuditLog.objects.filter(
        action="workbench.item.create",
        actor=users["owner"],
        target_id=item_id,
        is_sensitive=True,
    ).exists()


@pytest.mark.django_db
def test_create_data_card_rejects_non_string_tag(client, users):
    payload = _data_card_create_payload()
    payload["tags"] = [123]

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/data-cards/",
        payload,
        format="json",
    )

    assert response.status_code == 400
    assert "tags" in response.json()


@pytest.mark.django_db
def test_create_data_card_rejects_non_string_field_name(client, users):
    payload = _data_card_create_payload()
    payload["fields"][0]["name"] = 123

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/data-cards/",
        payload,
        format="json",
    )

    assert response.status_code == 400
    assert "fields" in response.json()


@pytest.mark.django_db
def test_create_data_card_rejects_unknown_field_key(client, users):
    payload = _data_card_create_payload()
    payload["fields"][0]["evil"] = "x"

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/data-cards/",
        payload,
        format="json",
    )

    assert response.status_code == 400
    assert "fields" in response.json()


@pytest.mark.django_db
def test_create_data_card_rejects_unknown_top_level_key(client, users):
    payload = _data_card_create_payload()
    payload["evil"] = "x"

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/data-cards/",
        payload,
        format="json",
    )

    assert response.status_code == 400
    assert "non_field_errors" in response.json()


@pytest.mark.django_db
def test_patch_data_card_rejects_invalid_types_in_partial_payload(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="owner-card",
    )
    WorkbenchDataCardDetail.objects.create(
        item=item,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )

    response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/data-cards/{item.id}/",
        {"fields": [{"name": 123}]},
        format="json",
    )

    assert response.status_code == 400
    assert "fields" in response.json()


@pytest.mark.django_db
def test_soft_deleted_data_card_endpoints_return_404(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="deleted-card",
        deleted_at=timezone.now(),
    )
    detail = WorkbenchDataCardDetail.objects.create(
        item=item,
        category=WorkbenchDataCardDetail.Category.POLICY,
    )
    WorkbenchDataCardField.objects.create(
        card=detail,
        name="n",
        value="v",
        value_type=WorkbenchDataCardField.ValueType.TEXT,
    )

    get_response = auth(client, users["owner"]).get(f"/api/v1/workbench/data-cards/{item.id}/")
    patch_response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/data-cards/{item.id}/",
        {"title": "new-title"},
        format="json",
    )
    copy_response = auth(client, users["owner"]).post(f"/api/v1/workbench/data-cards/{item.id}/copy-text/")

    assert get_response.status_code == 404
    assert patch_response.status_code == 404
    assert copy_response.status_code == 404


def _note_create_payload(*, is_sensitive: bool = False):
    return {
        "title": "Workbench note title",
        "summary": "short summary",
        "tags": ["ops", "payroll"],
        "is_pinned": True,
        "is_sensitive": is_sensitive,
        "markdown_content": "# heading\nbody content",
        "stage": WorkbenchNoteDetail.Stage.FIELD_DESIGN,
        "status": WorkbenchNoteDetail.Status.PENDING_CONFIRM,
    }


@pytest.mark.django_db
def test_create_note_creates_item_detail_and_sensitive_audit_without_markdown(client, users):
    payload = _note_create_payload(is_sensitive=True)

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/",
        payload,
        format="json",
    )

    assert response.status_code == 201
    data = response.json()
    assert data["type"] == WorkbenchItem.Type.NOTE
    assert data["title"] == payload["title"]
    assert data["summary"] == payload["summary"]
    assert data["tags"] == payload["tags"]
    assert data["is_pinned"] is True
    assert data["is_sensitive"] is True
    assert data["detail"]["markdown_content"] == payload["markdown_content"]
    assert data["detail"]["stage"] == payload["stage"]
    assert data["detail"]["status"] == payload["status"]

    item = WorkbenchItem.objects.get(pk=data["id"])
    assert item.owner_id == users["owner"].id
    assert item.type == WorkbenchItem.Type.NOTE
    assert item.is_sensitive is True
    assert item.note_detail.markdown_content == payload["markdown_content"]

    log = AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.item.create",
        target_type="workbench_item",
        target_id=item.id,
    ).first()
    assert log is not None
    assert log.is_sensitive is True
    assert log.detail["type"] == WorkbenchItem.Type.NOTE
    assert log.detail["is_sensitive"] is True
    assert "markdown_content" not in log.detail
    assert payload["markdown_content"] not in str(log.detail)


@pytest.mark.django_db
def test_note_list_returns_only_owner_non_deleted_notes(client, users):
    owner_note = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-note",
    )
    WorkbenchNoteDetail.objects.create(
        item=owner_note,
        markdown_content="owner-note-content",
        stage=WorkbenchNoteDetail.Stage.APPROVAL,
        status=WorkbenchNoteDetail.Status.PENDING_CONFIRM,
    )
    owner_deleted_note = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-deleted-note",
        deleted_at=timezone.now(),
    )
    WorkbenchNoteDetail.objects.create(item=owner_deleted_note, markdown_content="deleted-content")
    owner_card = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="owner-card",
    )
    WorkbenchDataCardDetail.objects.create(item=owner_card, category=WorkbenchDataCardDetail.Category.POLICY)
    owner_material = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.MATERIAL,
        title="owner-material",
    )
    WorkbenchMaterialDetail.objects.create(
        item=owner_material,
        original_name="doc.txt",
        content_type="text/plain",
        size=3,
    )
    other_note = WorkbenchItem.objects.create(
        owner=users["other"],
        type=WorkbenchItem.Type.NOTE,
        title="other-note",
    )
    WorkbenchNoteDetail.objects.create(item=other_note, markdown_content="other-note-content")

    response = auth(client, users["owner"]).get("/api/v1/workbench/notes/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert [item["id"] for item in payload["results"]] == [owner_note.id]
    assert payload["results"][0]["type"] == WorkbenchItem.Type.NOTE
    assert payload["results"][0]["detail"]["stage"] == WorkbenchNoteDetail.Stage.APPROVAL
    assert payload["results"][0]["detail"]["status"] == WorkbenchNoteDetail.Status.PENDING_CONFIRM
    assert "markdown_content" not in payload["results"][0]["detail"]


@pytest.mark.django_db
def test_note_detail_requires_owner_and_note_type(client, users):
    owner_note = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-note",
    )
    WorkbenchNoteDetail.objects.create(item=owner_note, markdown_content="owner-note-content")
    owner_card = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.DATA_CARD,
        title="owner-card",
    )
    WorkbenchDataCardDetail.objects.create(item=owner_card, category=WorkbenchDataCardDetail.Category.POLICY)

    ok_response = auth(client, users["owner"]).get(f"/api/v1/workbench/notes/{owner_note.id}/")
    assert ok_response.status_code == 200
    assert ok_response.json()["id"] == owner_note.id
    assert ok_response.json()["detail"]["markdown_content"] == "owner-note-content"

    other_user_response = auth(client, users["other"]).get(f"/api/v1/workbench/notes/{owner_note.id}/")
    assert other_user_response.status_code == 404

    non_note_response = auth(client, users["owner"]).get(f"/api/v1/workbench/notes/{owner_card.id}/")
    assert non_note_response.status_code == 404


@pytest.mark.django_db
def test_patch_note_updates_fields_and_audit_without_markdown(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="old-title",
        summary="old-summary",
        tags=["old-tag"],
        is_pinned=False,
        is_sensitive=False,
    )
    WorkbenchNoteDetail.objects.create(
        item=item,
        markdown_content="old markdown",
        stage=WorkbenchNoteDetail.Stage.OTHER,
        status=WorkbenchNoteDetail.Status.NORMAL,
    )

    patch_payload = {
        "title": "new-title",
        "summary": "new-summary",
        "tags": ["new", "tags"],
        "is_pinned": True,
        "is_sensitive": True,
        "markdown_content": "new markdown content",
        "stage": WorkbenchNoteDetail.Stage.APPROVAL,
        "status": WorkbenchNoteDetail.Status.CONFIRMED,
    }
    response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/notes/{item.id}/",
        patch_payload,
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == patch_payload["title"]
    assert payload["summary"] == patch_payload["summary"]
    assert payload["tags"] == patch_payload["tags"]
    assert payload["is_pinned"] is True
    assert payload["is_sensitive"] is True
    assert payload["detail"]["markdown_content"] == patch_payload["markdown_content"]
    assert payload["detail"]["stage"] == patch_payload["stage"]
    assert payload["detail"]["status"] == patch_payload["status"]

    item.refresh_from_db()
    assert item.title == patch_payload["title"]
    assert item.summary == patch_payload["summary"]
    assert item.tags == patch_payload["tags"]
    assert item.is_pinned is True
    assert item.is_sensitive is True
    assert item.note_detail.markdown_content == patch_payload["markdown_content"]
    assert item.note_detail.stage == patch_payload["stage"]
    assert item.note_detail.status == patch_payload["status"]

    log = AuditLog.objects.filter(
        actor=users["owner"],
        action="workbench.item.update",
        target_type="workbench_item",
        target_id=item.id,
    ).first()
    assert log is not None
    assert log.is_sensitive is True
    assert log.detail["type"] == WorkbenchItem.Type.NOTE
    assert log.detail["is_sensitive"] is True
    assert "markdown_content" not in log.detail
    assert patch_payload["markdown_content"] not in str(log.detail)


@pytest.mark.django_db
def test_patch_sensitive_note_to_non_sensitive_keeps_update_audit_sensitive(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="sensitive-note",
        is_sensitive=True,
    )
    WorkbenchNoteDetail.objects.create(
        item=item,
        markdown_content="sensitive markdown",
        stage=WorkbenchNoteDetail.Stage.OTHER,
        status=WorkbenchNoteDetail.Status.NORMAL,
    )

    response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/notes/{item.id}/",
        {
            "is_sensitive": False,
            "markdown_content": "updated markdown",
            "status": WorkbenchNoteDetail.Status.CONFIRMED,
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_sensitive"] is False

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
    assert "markdown_content" not in log.detail
    assert "updated markdown" not in str(log.detail)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("payload_key", "payload_value", "expected_title"),
    [
        (
            "markdown_content",
            "\n   \nA very long quick capture first line should be trimmed to thirty chars exactly\nnext",
            "A very long quick capture firs",
        ),
        ("content", "Quick capture by content\nbody", "Quick capture by content"),
    ],
)
def test_quick_capture_creates_note_and_uses_defaults(client, users, payload_key, payload_value, expected_title):
    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/quick-capture/",
        {payload_key: payload_value},
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["warning"] is None
    item_payload = payload["item"]
    assert item_payload["type"] == WorkbenchItem.Type.NOTE
    assert item_payload["title"] == expected_title
    assert item_payload["detail"]["markdown_content"] == payload_value
    assert item_payload["detail"]["stage"] == WorkbenchNoteDetail.Stage.OTHER
    assert item_payload["detail"]["status"] == WorkbenchNoteDetail.Status.NORMAL


@pytest.mark.django_db
def test_quick_capture_uses_fallback_title_when_content_has_no_non_empty_lines(client, users):
    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/quick-capture/",
        {"markdown_content": "   \n\t \n"},
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()["item"]
    assert payload["title"] == "未命名笔记"


@pytest.mark.django_db
def test_quick_capture_can_create_link_to_visible_schema(client, users, schema):
    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/quick-capture/",
        {
            "markdown_content": "link this note",
            "target_schema_id": schema.id,
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["warning"] is None
    note_id = payload["item"]["id"]
    assert WorkbenchLink.objects.filter(
        owner=users["owner"],
        source_item_id=note_id,
        target_schema_id=schema.id,
    ).exists()


@pytest.mark.django_db
def test_quick_capture_invalid_schema_keeps_note_and_returns_warning(client, users):
    private_schema = DataSchema.objects.create(
        schema_code="other_private_schema_for_quick_capture",
        name="other-private-schema",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "id", "type": "text"}],
        owner=users["other"],
        created_by=users["other"],
    )

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/quick-capture/",
        {
            "content": "should still persist",
            "target_schema_id": private_schema.id,
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["warning"] is not None
    note_id = payload["item"]["id"]
    note = WorkbenchItem.objects.get(pk=note_id)
    assert note.owner_id == users["owner"].id
    assert note.type == WorkbenchItem.Type.NOTE
    assert WorkbenchLink.objects.filter(source_item_id=note_id).count() == 0


@pytest.mark.django_db
def test_quick_capture_link_django_validation_error_keeps_note_and_returns_warning(client, users, monkeypatch):
    def _raise_django_validation_error(*args, **kwargs):
        raise DjangoValidationError("schema link invalid")

    monkeypatch.setattr("apps.workbench.services.create_link", _raise_django_validation_error)

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/quick-capture/",
        {
            "content": "note should remain",
            "target_schema_id": 999999,
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["warning"]
    note_id = payload["item"]["id"]
    note = WorkbenchItem.objects.get(pk=note_id)
    assert note.owner_id == users["owner"].id
    assert note.type == WorkbenchItem.Type.NOTE


@pytest.mark.django_db
def test_quick_capture_link_integrity_error_keeps_note_and_returns_warning(client, users, monkeypatch):
    def _raise_integrity_error(*args, **kwargs):
        raise IntegrityError("duplicate key value violates unique constraint")

    monkeypatch.setattr("apps.workbench.services.create_link", _raise_integrity_error)

    response = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/quick-capture/",
        {
            "content": "note should remain after integrity error",
            "target_schema_id": 999999,
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["warning"]
    note_id = payload["item"]["id"]
    note = WorkbenchItem.objects.get(pk=note_id)
    assert note.owner_id == users["owner"].id
    assert note.type == WorkbenchItem.Type.NOTE


@pytest.mark.django_db
def test_other_user_cannot_patch_owner_note_and_soft_deleted_note_is_404(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-note",
        deleted_at=timezone.now(),
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")

    other_user_patch = auth(client, users["other"]).patch(
        f"/api/v1/workbench/notes/{item.id}/",
        {"title": "hack"},
        format="json",
    )
    owner_get = auth(client, users["owner"]).get(f"/api/v1/workbench/notes/{item.id}/")
    owner_patch = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/notes/{item.id}/",
        {"title": "new-title"},
        format="json",
    )

    assert other_user_patch.status_code == 404
    assert owner_get.status_code == 404
    assert owner_patch.status_code == 404


@pytest.mark.django_db
def test_other_user_cannot_patch_owner_non_deleted_note_and_keeps_original_values(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="owner-note-title",
        summary="owner-note-summary",
        tags=["owner"],
        is_pinned=False,
        is_sensitive=False,
    )
    detail = WorkbenchNoteDetail.objects.create(
        item=item,
        markdown_content="owner markdown",
        stage=WorkbenchNoteDetail.Stage.FIELD_DESIGN,
        status=WorkbenchNoteDetail.Status.PENDING_CONFIRM,
    )

    response = auth(client, users["other"]).patch(
        f"/api/v1/workbench/notes/{item.id}/",
        {
            "title": "hacked-title",
            "summary": "hacked-summary",
            "markdown_content": "hacked markdown",
            "stage": WorkbenchNoteDetail.Stage.APPROVAL,
            "status": WorkbenchNoteDetail.Status.CONFIRMED,
        },
        format="json",
    )

    assert response.status_code == 404

    item.refresh_from_db()
    detail.refresh_from_db()
    assert item.title == "owner-note-title"
    assert item.summary == "owner-note-summary"
    assert item.tags == ["owner"]
    assert item.is_pinned is False
    assert item.is_sensitive is False
    assert detail.markdown_content == "owner markdown"
    assert detail.stage == WorkbenchNoteDetail.Stage.FIELD_DESIGN
    assert detail.status == WorkbenchNoteDetail.Status.PENDING_CONFIRM


@pytest.mark.django_db
def test_patch_note_unknown_field_returns_400(client, users):
    item = WorkbenchItem.objects.create(
        owner=users["owner"],
        type=WorkbenchItem.Type.NOTE,
        title="note-for-unknown-field",
    )
    WorkbenchNoteDetail.objects.create(item=item, markdown_content="content")

    response = auth(client, users["owner"]).patch(
        f"/api/v1/workbench/notes/{item.id}/",
        {"evil": "x"},
        format="json",
    )

    assert response.status_code == 400
    assert "non_field_errors" in response.json()


@pytest.mark.django_db
def test_note_input_validation_rejects_unknown_fields_and_non_string_values(client, users):
    create_with_unknown = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/",
        {**_note_create_payload(), "evil": "x"},
        format="json",
    )
    assert create_with_unknown.status_code == 400
    assert "non_field_errors" in create_with_unknown.json()

    create_with_non_string_values = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/",
        {
            "title": 123,
            "markdown_content": False,
            "stage": "invalid-stage",
            "status": "invalid-status",
            "tags": ["ok", {"x": 1}],
        },
        format="json",
    )
    assert create_with_non_string_values.status_code == 400
    create_error = create_with_non_string_values.json()
    assert "title" in create_error
    assert "markdown_content" in create_error
    assert "stage" in create_error
    assert "status" in create_error
    assert "tags" in create_error

    quick_capture_with_invalid_content = auth(client, users["owner"]).post(
        "/api/v1/workbench/notes/quick-capture/",
        {"content": {"not": "string"}},
        format="json",
    )
    assert quick_capture_with_invalid_content.status_code == 400
    assert "content" in quick_capture_with_invalid_content.json()
