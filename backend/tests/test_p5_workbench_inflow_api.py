import pytest
from django.apps import apps as django_apps
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.schemas.models import DataSchema
from apps.workbench import services as workbench_services
from apps.workbench.models import WorkbenchItem, WorkbenchLink, WorkbenchMaterialDetail, WorkbenchNoteDetail


@pytest.fixture
def users(db):
    return {
        "admin": User.objects.create_superuser(username="admin", password="pass", email="admin@example.com"),
        "owner": User.objects.create_user(username="owner", password="pass"),
        "other": User.objects.create_user(username="other", password="pass"),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def _checklist_model():
    try:
        return django_apps.get_model("workbench", "WorkbenchMaterialChecklistItem")
    except LookupError:
        pytest.fail("WorkbenchMaterialChecklistItem model not found")


def _create_schema(owner, *, schema_code: str, visibility: str = DataSchema.Visibility.PRIVATE) -> DataSchema:
    return DataSchema.objects.create(
        schema_code=schema_code,
        name=schema_code,
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="code",
        fields_config=[{"key": "code", "label": "id", "type": "text"}],
        owner=owner,
        created_by=owner,
        visibility=visibility,
    )


def _create_note(owner, *, title: str, deleted: bool = False) -> WorkbenchItem:
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.NOTE,
        title=title,
        deleted_at=timezone.now() if deleted else None,
    )
    WorkbenchNoteDetail.objects.create(
        item=item,
        markdown_content=f"{title}\nbody",
        stage=WorkbenchNoteDetail.Stage.FIELD_DESIGN,
        status=WorkbenchNoteDetail.Status.PENDING_CONFIRM,
    )
    return item


def _create_material(owner, *, title: str, deleted: bool = False) -> WorkbenchItem:
    item = WorkbenchItem.objects.create(
        owner=owner,
        type=WorkbenchItem.Type.MATERIAL,
        title=title,
        deleted_at=timezone.now() if deleted else None,
    )
    WorkbenchMaterialDetail.objects.create(
        item=item,
        original_name=f"{title}.pdf",
        content_type="application/pdf",
        size=8,
        description=f"{title}-description",
    )
    return item


@pytest.mark.django_db
def test_schema_workbench_summary_returns_only_current_users_linked_items(client, users):
    schema = _create_schema(
        users["owner"],
        schema_code="task18_workbench_public_schema",
        visibility=DataSchema.Visibility.PUBLIC,
    )
    other_schema = _create_schema(users["owner"], schema_code="task18_workbench_other_schema")

    owner_note = _create_note(users["owner"], title="owner-linked-note")
    owner_material = _create_material(users["owner"], title="owner-linked-material")
    owner_deleted = _create_note(users["owner"], title="owner-deleted-note", deleted=True)
    owner_other_schema = _create_note(users["owner"], title="owner-other-schema-note")
    other_users_item = _create_note(users["other"], title="other-users-note")

    WorkbenchLink.objects.create(owner=users["owner"], source_item=owner_note, target_schema=schema)
    WorkbenchLink.objects.create(owner=users["owner"], source_item=owner_material, target_schema=schema)
    WorkbenchLink.objects.create(owner=users["owner"], source_item=owner_deleted, target_schema=schema)
    WorkbenchLink.objects.create(owner=users["owner"], source_item=owner_other_schema, target_schema=other_schema)
    WorkbenchLink.objects.create(owner=users["other"], source_item=other_users_item, target_schema=schema)

    response = auth(client, users["owner"]).get(f"/api/v1/schemas/{schema.id}/workbench/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert {item["id"] for item in payload["results"]} == {owner_note.id, owner_material.id}
    note_payload = next(item for item in payload["results"] if item["id"] == owner_note.id)
    assert note_payload["type"] == WorkbenchItem.Type.NOTE
    assert "markdown_content" not in note_payload["detail"]


@pytest.mark.django_db
def test_schema_workbench_quick_note_creates_note_linked_to_current_schema(client, users):
    schema = _create_schema(users["owner"], schema_code="task18_quick_note_schema")

    response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/workbench/quick-note/",
        {"markdown_content": "Task 18 quick note\nbody"},
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["warning"] is None
    assert payload["item"]["type"] == WorkbenchItem.Type.NOTE
    note_id = payload["item"]["id"]
    assert WorkbenchLink.objects.filter(
        owner=users["owner"],
        source_item_id=note_id,
        target_schema_id=schema.id,
    ).exists()


@pytest.mark.django_db
def test_checklist_crud_is_scoped_to_owner_and_schema(client, users):
    checklist_model = _checklist_model()
    schema = _create_schema(users["owner"], schema_code="task18_checklist_schema")
    linked_material = _create_material(users["owner"], title="linked-material")

    create_response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/",
        {
            "title": "身份证复印件",
            "status": "uploaded",
            "linked_material": linked_material.id,
            "note": "已补齐",
            "sort_order": 3,
        },
        format="json",
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["title"] == "身份证复印件"
    assert created["status"] == "uploaded"
    assert created["linked_material"] == linked_material.id
    assert created["note"] == "已补齐"
    assert created["sort_order"] == 3

    checklist_item = checklist_model.objects.get(pk=created["id"])
    assert checklist_item.owner_id == users["owner"].id
    assert checklist_item.schema_id == schema.id

    list_response = auth(client, users["owner"]).get(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/"
    )
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1
    assert list_response.json()["results"][0]["id"] == checklist_item.id

    patch_response = auth(client, users["owner"]).patch(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/{checklist_item.id}/",
        {
            "title": "身份证原件",
            "status": "pending_confirm",
            "linked_material": None,
            "note": "待人工确认",
            "sort_order": 7,
        },
        format="json",
    )

    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["title"] == "身份证原件"
    assert patched["status"] == "pending_confirm"
    assert patched["linked_material"] is None
    assert patched["note"] == "待人工确认"
    assert patched["sort_order"] == 7

    checklist_item.refresh_from_db()
    assert checklist_item.linked_material_id is None

    delete_response = auth(client, users["owner"]).delete(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/{checklist_item.id}/"
    )

    assert delete_response.status_code == 204
    assert checklist_model.objects.filter(pk=checklist_item.id).count() == 0


@pytest.mark.django_db
def test_other_user_cannot_see_or_mutate_checklist_items_on_same_visible_schema(client, users):
    checklist_model = _checklist_model()
    schema = _create_schema(
        users["owner"],
        schema_code="task18_checklist_public_schema",
        visibility=DataSchema.Visibility.PUBLIC,
    )
    checklist_item = checklist_model.objects.create(
        owner=users["owner"],
        schema=schema,
        title="owner-only-checklist",
    )

    list_response = auth(client, users["other"]).get(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/"
    )
    patch_response = auth(client, users["other"]).patch(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/{checklist_item.id}/",
        {"title": "hijacked"},
        format="json",
    )
    delete_response = auth(client, users["other"]).delete(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/{checklist_item.id}/"
    )

    assert list_response.status_code == 200
    assert list_response.json()["count"] == 0
    assert list_response.json()["results"] == []
    assert patch_response.status_code == 404
    assert delete_response.status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize(
    "linked_material_factory",
    [
        lambda users: _create_note(users["owner"], title="not-a-material"),
        lambda users: _create_material(users["other"], title="other-user-material"),
        lambda users: _create_material(users["owner"], title="deleted-material", deleted=True),
    ],
)
def test_checklist_rejects_invalid_linked_material(client, users, linked_material_factory):
    schema = _create_schema(users["owner"], schema_code="task18_invalid_material_schema")
    linked_material = linked_material_factory(users)

    response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/",
        {
            "title": "invalid material link",
            "linked_material": linked_material.id,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "linked_material" in response.json()


@pytest.mark.django_db
def test_superuser_cannot_use_other_users_material_for_checklist_create_or_update(client, users):
    checklist_model = _checklist_model()
    schema = _create_schema(users["admin"], schema_code="task18_admin_checklist_schema")
    admin_material = _create_material(users["admin"], title="admin-material")
    other_material = _create_material(users["other"], title="other-material")

    create_response = auth(client, users["admin"]).post(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/",
        {
            "title": "admin create invalid link",
            "linked_material": other_material.id,
        },
        format="json",
    )

    assert create_response.status_code == 400
    assert "linked_material" in create_response.json()

    checklist_item = checklist_model.objects.create(
        owner=users["admin"],
        schema=schema,
        title="admin-checklist",
        linked_material=admin_material,
    )

    patch_response = auth(client, users["admin"]).patch(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/{checklist_item.id}/",
        {"linked_material": other_material.id},
        format="json",
    )

    assert patch_response.status_code == 400
    assert "linked_material" in patch_response.json()


@pytest.mark.django_db
def test_soft_deleted_material_clears_checklist_link_and_response_fields(client, users):
    checklist_model = _checklist_model()
    schema = _create_schema(users["owner"], schema_code="task18_soft_delete_cleanup_schema")
    linked_material = _create_material(users["owner"], title="cleanup-material")

    create_response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/",
        {
            "title": "cleanup row",
            "linked_material": linked_material.id,
        },
        format="json",
    )
    assert create_response.status_code == 201
    checklist_item_id = create_response.json()["id"]

    delete_response = auth(client, users["owner"]).delete(f"/api/v1/workbench/items/{linked_material.id}/")
    assert delete_response.status_code == 200

    list_response = auth(client, users["owner"]).get(
        f"/api/v1/schemas/{schema.id}/workbench/material-checklist/"
    )

    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == checklist_item_id
    assert payload["results"][0]["linked_material"] is None
    assert payload["results"][0]["linked_material_item"] is None

    checklist_item = checklist_model.objects.get(pk=checklist_item_id)
    assert checklist_item.linked_material_id is None


@pytest.mark.django_db
def test_soft_delete_material_rolls_back_when_checklist_unlink_fails(client, users, monkeypatch):
    checklist_model = _checklist_model()
    schema = _create_schema(users["owner"], schema_code="task18_soft_delete_atomic_schema")
    linked_material = _create_material(users["owner"], title="atomic-material")
    checklist_item = checklist_model.objects.create(
        owner=users["owner"],
        schema=schema,
        title="atomic row",
        linked_material=linked_material,
    )

    class _FailingQuerySet:
        def update(self, **kwargs):
            raise RuntimeError("unlink failed")

    class _FailingManager:
        @staticmethod
        def filter(*args, **kwargs):
            return _FailingQuerySet()

    class _FailingChecklistModel:
        objects = _FailingManager()

    monkeypatch.setattr(workbench_services, "WorkbenchMaterialChecklistItem", _FailingChecklistModel, raising=False)

    with pytest.raises(RuntimeError, match="unlink failed"):
        auth(client, users["owner"]).delete(f"/api/v1/workbench/items/{linked_material.id}/")

    linked_material.refresh_from_db()
    checklist_item.refresh_from_db()
    assert linked_material.deleted_at is None
    assert checklist_item.linked_material_id == linked_material.id


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/v1/schemas/{schema_id}/workbench/", None),
        ("post", "/api/v1/schemas/{schema_id}/workbench/quick-note/", {"content": "hidden schema quick note"}),
        ("get", "/api/v1/schemas/{schema_id}/workbench/material-checklist/", None),
        ("post", "/api/v1/schemas/{schema_id}/workbench/material-checklist/", {"title": "hidden schema row"}),
    ],
)
def test_inaccessible_schema_returns_403_or_404(client, users, method, path, payload):
    payload_code = "none" if payload is None else "body"
    hidden_schema = _create_schema(users["other"], schema_code=f"task18_hidden_{method}_{payload_code}")
    response = getattr(auth(client, users["owner"]), method)(
        path.format(schema_id=hidden_schema.id),
        payload,
        format="json" if payload is not None else None,
    )

    assert response.status_code in {403, 404}
