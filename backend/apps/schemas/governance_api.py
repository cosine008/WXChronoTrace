from __future__ import annotations

from typing import Any

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

from .models import DataSchema, SchemaVersion
from .services import create_schema_version, lock_schema, validate_config


def get_visible_schema(user, schema_id: int) -> DataSchema:
    schema = (
        DataSchema.objects.for_user(user)
        .select_related("owner", "created_by")
        .filter(pk=schema_id)
        .first()
    )
    if schema is None:
        raise NotFound("schema does not exist")
    return schema


def list_schema_versions_payload(schema: DataSchema) -> dict[str, Any]:
    versions = list(
        schema.versions.select_related("created_by").order_by("-version")
    )
    return {
        "count": len(versions),
        "results": [_serialize_version_summary(version) for version in versions],
    }


def get_schema_version_payload(schema: DataSchema, version: int) -> dict[str, Any]:
    schema_version = (
        schema.versions.select_related("created_by").filter(version=version).first()
    )
    if schema_version is None:
        raise NotFound("schema version does not exist")
    return {
        **_serialize_version_summary(schema_version),
        "schema_id": schema.id,
        "schema_code": schema.schema_code,
        "fields_config": schema_version.fields_config,
    }


def reorder_schema_fields(schema: DataSchema, user, field_keys: object) -> DataSchema:
    requested_keys = _field_keys(field_keys)
    with transaction.atomic():
        locked_schema = lock_schema(schema.id)
        existing_fields = locked_schema.fields_config
        field_by_key = {field.get("key"): field for field in existing_fields}
        _validate_complete_order(requested_keys, list(field_by_key))
        next_version = locked_schema.current_version + 1
        locked_schema.fields_config = validate_config(
            [field_by_key[field_key] for field_key in requested_keys]
        )
        locked_schema.current_version = next_version
        locked_schema.save(
            update_fields=["fields_config", "current_version", "config_migrated_at"]
        )
        create_schema_version(locked_schema, user, "Reorder fields")
    return locked_schema


def _serialize_version_summary(version: SchemaVersion) -> dict[str, Any]:
    return {
        "id": version.id,
        "version": version.version,
        "changelog": version.changelog,
        "field_count": len(version.fields_config)
        if isinstance(version.fields_config, list)
        else 0,
        "created_at": version.created_at.isoformat(),
        "created_by": {
            "id": version.created_by_id,
            "username": version.created_by.username,
        },
    }


def _field_keys(value: object) -> list[str]:
    if not isinstance(value, list):
        raise ValidationError({"field_keys": "must be a list"})
    if not value or not all(isinstance(item, str) and item for item in value):
        raise ValidationError({"field_keys": "must contain non-empty strings"})
    return value


def _validate_complete_order(requested_keys: list[str], existing_keys: list[str]) -> None:
    if len(requested_keys) != len(set(requested_keys)):
        raise ValidationError({"field_keys": "must not contain duplicates"})
    if set(requested_keys) != set(existing_keys):
        raise ValidationError({"field_keys": "must match current schema fields"})
