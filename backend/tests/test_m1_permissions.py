import datetime as dt

import pytest
from django.contrib.auth.models import AnonymousUser, User
from django.utils import timezone

from apps.audit.services import record_audit_log
from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema, TableCollaborator
from apps.schemas.permissions import (
    can_archive_schema,
    can_change_schema,
    can_create_schema,
    can_edit_data,
    can_export_schema,
    can_handover_schema,
    can_manage_collaborators,
    can_view_schema,
    get_schema_role,
)
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "editor": User.objects.create_user(username="editor", password="pass"),
        "viewer": User.objects.create_user(username="viewer", password="pass"),
        "outsider": User.objects.create_user(username="outsider", password="pass"),
        "admin": User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="pass",
        ),
    }


@pytest.fixture
def permission_matrix(users):
    owner = users["owner"]
    schemas = {
        "private": make_schema("private_assets", owner, "private"),
        "shared": make_schema("shared_assets", owner, "shared"),
        "public": make_schema("public_assets", owner, "public"),
    }
    TableCollaborator.objects.create(
        schema=schemas["shared"],
        user=users["editor"],
        role="editor",
        added_by=owner,
    )
    TableCollaborator.objects.create(
        schema=schemas["shared"],
        user=users["viewer"],
        role="viewer",
        added_by=owner,
    )
    return schemas


def make_schema(schema_code, owner, visibility):
    return DataSchema.objects.create(
        schema_code=schema_code,
        name=schema_code,
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[{"key": "asset_no", "label": "资产编号", "type": "text"}],
        owner=owner,
        visibility=visibility,
        created_by=owner,
    )


@pytest.mark.django_db
def test_schema_for_user_filters_private_shared_public_matrix(users, permission_matrix):
    assert visible_schema_codes(users["owner"]) == [
        "private_assets",
        "public_assets",
        "shared_assets",
    ]
    assert visible_schema_codes(users["editor"]) == ["public_assets", "shared_assets"]
    assert visible_schema_codes(users["viewer"]) == ["public_assets", "shared_assets"]
    assert visible_schema_codes(users["outsider"]) == ["public_assets"]
    assert visible_schema_codes(users["admin"]) == [
        "private_assets",
        "public_assets",
        "shared_assets",
    ]


@pytest.mark.django_db
def test_temporal_record_for_user_filters_through_entity_schema(users, permission_matrix):
    for schema in permission_matrix.values():
        create_record(schema, users["owner"])

    assert visible_record_codes(users["owner"]) == [
        "private_assets-001",
        "public_assets-001",
        "shared_assets-001",
    ]
    assert visible_record_codes(users["editor"]) == ["public_assets-001", "shared_assets-001"]
    assert visible_record_codes(users["viewer"]) == ["public_assets-001", "shared_assets-001"]
    assert visible_record_codes(users["outsider"]) == ["public_assets-001"]
    assert visible_record_codes(users["admin"]) == [
        "private_assets-001",
        "public_assets-001",
        "shared_assets-001",
    ]


@pytest.mark.django_db
def test_schema_roles_and_operation_permissions_match_m1_rules(users, permission_matrix):
    owner = users["owner"]
    editor = users["editor"]
    viewer = users["viewer"]
    outsider = users["outsider"]
    admin = users["admin"]
    shared = permission_matrix["shared"]
    public = permission_matrix["public"]

    assert get_schema_role(admin, shared) == "admin"
    assert get_schema_role(owner, shared) == "owner"
    assert get_schema_role(editor, shared) == "editor"
    assert get_schema_role(viewer, shared) == "viewer"
    assert get_schema_role(outsider, shared) is None
    assert get_schema_role(outsider, public) == "viewer"

    assert can_create_schema(owner) is True
    assert can_create_schema(AnonymousUser()) is False
    assert can_view_schema(editor, shared) is True
    assert can_edit_data(editor, shared) is True
    assert can_edit_data(viewer, shared) is False
    assert can_edit_data(outsider, public) is False
    assert can_change_schema(editor, shared) is False
    assert can_change_schema(owner, shared) is True
    assert can_manage_collaborators(owner, shared) is True
    assert can_manage_collaborators(editor, shared) is False
    assert can_archive_schema(owner, shared) is True
    assert can_handover_schema(owner, shared) is False
    assert can_handover_schema(admin, shared) is True
    assert can_export_schema(viewer, shared) is True
    assert can_export_schema(outsider, public) is True


@pytest.mark.django_db
def test_record_audit_log_marks_sensitive_operations(users, permission_matrix):
    schema = permission_matrix["shared"]

    visibility_log = record_audit_log(
        actor=users["owner"],
        action="schema.visibility_change",
        target_type="schema",
        target_id=schema.id,
        detail={"from_visibility": "shared", "to_visibility": "public"},
    )
    handover_log = record_audit_log(
        actor=users["admin"],
        action="schema.handover",
        target_type="schema",
        target_id=schema.id,
        detail={"from_owner_id": users["owner"].id, "to_owner_id": users["editor"].id},
    )
    small_export_log = record_audit_log(
        actor=users["viewer"],
        action="data.export",
        target_type="schema",
        target_id=schema.id,
        detail={"row_count": 500},
    )
    large_export_log = record_audit_log(
        actor=users["viewer"],
        action="data.export",
        target_type="schema",
        target_id=schema.id,
        detail={"row_count": 501},
    )
    normal_log = record_audit_log(
        actor=users["editor"],
        action="collaborator.add",
        target_type="schema",
        target_id=schema.id,
        detail={"user_id": users["viewer"].id},
    )

    assert visibility_log.is_sensitive is True
    assert handover_log.is_sensitive is True
    assert small_export_log.is_sensitive is False
    assert large_export_log.is_sensitive is True
    assert normal_log.is_sensitive is False


def create_record(schema, user):
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary=f"{schema.schema_code} init",
        status="applied",
        created_by=user,
        applied_at=timezone.now(),
    )
    entity = Entity.objects.create(
        schema=schema,
        business_code=f"{schema.schema_code}-001",
        created_by=user,
    )
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=schema.current_version,
        data_payload={"asset_no": entity.business_code},
        valid_from=dt.date(2024, 1, 1),
        change_set=change_set,
        recorded_by=user,
    )


def visible_schema_codes(user):
    return sorted(DataSchema.objects.for_user(user).values_list("schema_code", flat=True))


def visible_record_codes(user):
    return sorted(
        TemporalRecord.objects.for_user(user).values_list("entity__business_code", flat=True)
    )
