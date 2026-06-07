from __future__ import annotations

from typing import Any

from apps.schemas.field_security import field_value_is_masked
from apps.schemas.identity import field_is_system_hidden
from apps.schemas.permissions import can_edit_data, can_view_schema

from .models import CommentThread


def can_view_comment_anchor(
    user: Any,
    schema: Any,
    anchor_type: str,
    entity: Any = None,
    field_key: str = "",
) -> bool:
    if not _is_authenticated(user) or not can_view_schema(user, schema):
        return False
    if anchor_type == CommentThread.AnchorType.SCHEMA:
        return True
    if anchor_type == CommentThread.AnchorType.ROW:
        return _entity_matches_schema(entity, schema)
    if anchor_type == CommentThread.AnchorType.CELL:
        return _entity_matches_schema(entity, schema) and field_key_is_visible(
            user,
            schema,
            field_key,
        )
    return False


def can_mutate_thread_status(user: Any, thread: CommentThread) -> bool:
    if not _is_authenticated(user):
        return False
    if bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False)):
        return True
    if thread.created_by_id == getattr(user, "pk", None):
        return True
    return can_edit_data(user, thread.schema)


def field_key_is_visible(user: Any, schema: Any, field_key: str) -> bool:
    field = field_config_by_key(schema, field_key)
    return field is not None and field_is_visible(user, schema, field)


def visible_field_keys(user: Any, schema: Any) -> list[str]:
    return [
        field["key"]
        for field in schema_fields_config(schema)
        if isinstance(field.get("key"), str) and field_is_visible(user, schema, field)
    ]


def field_config_by_key(schema: Any, field_key: str) -> dict[str, Any] | None:
    if not field_key:
        return None
    for field in schema_fields_config(schema):
        if field.get("key") == field_key:
            return field
    return None


def schema_fields_config(schema: Any) -> list[dict[str, Any]]:
    fields_config = getattr(schema, "fields_config", None)
    return fields_config if isinstance(fields_config, list) else []


def field_is_visible(user: Any, schema: Any, field: dict[str, Any]) -> bool:
    if field_is_system_hidden(field):
        return False
    return not field_value_is_masked(user, schema, field)


def _entity_matches_schema(entity: Any, schema: Any) -> bool:
    return bool(entity is not None and getattr(entity, "schema_id", None) == schema.id)


def _is_authenticated(user: Any) -> bool:
    return bool(getattr(user, "is_authenticated", False))
