from __future__ import annotations

from typing import Literal

from .models import DataSchema, TableCollaborator

SchemaRole = Literal["admin", "owner", "editor", "viewer"]


def get_schema_role(user, schema: DataSchema) -> SchemaRole | None:
    if not _is_authenticated(user):
        return None
    if user.is_superuser:
        return "admin"
    if schema.owner_id == user.pk:
        return "owner"
    if schema.visibility == DataSchema.Visibility.PUBLIC:
        return "viewer"
    if schema.visibility == DataSchema.Visibility.SHARED:
        return _collaborator_role(user, schema)
    return None


def can_create_schema(user) -> bool:
    return _is_authenticated(user) and bool(getattr(user, "is_active", False))


def can_view_schema(user, schema: DataSchema) -> bool:
    return get_schema_role(user, schema) is not None


def can_edit_data(user, schema: DataSchema) -> bool:
    role = get_schema_role(user, schema)
    if role in {"admin", "owner"}:
        return True
    return role == "editor" and schema.visibility == DataSchema.Visibility.SHARED


def can_change_schema(user, schema: DataSchema) -> bool:
    return get_schema_role(user, schema) in {"admin", "owner"}


def can_manage_collaborators(user, schema: DataSchema) -> bool:
    return get_schema_role(user, schema) in {"admin", "owner"}


def can_archive_schema(user, schema: DataSchema) -> bool:
    return get_schema_role(user, schema) in {"admin", "owner"}


def can_handover_schema(user, schema: DataSchema) -> bool:
    return get_schema_role(user, schema) == "admin"


def can_export_schema(user, schema: DataSchema) -> bool:
    return can_view_schema(user, schema)


def _collaborator_role(user, schema: DataSchema) -> SchemaRole | None:
    role = (
        TableCollaborator.objects.filter(schema=schema, user=user)
        .values_list("role", flat=True)
        .first()
    )
    if role == TableCollaborator.Role.EDITOR:
        return "editor"
    if role == TableCollaborator.Role.VIEWER:
        return "viewer"
    return None


def _is_authenticated(user) -> bool:
    return bool(getattr(user, "is_authenticated", False))
