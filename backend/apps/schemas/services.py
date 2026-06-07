from django.contrib.auth.models import User
from rest_framework.exceptions import NotFound, ValidationError

from apps.audit.services import record_audit_log

from .models import DataSchema, SchemaVersion, TableCollaborator
from .serializers import validation_issues
from .validation import validate_fields_config
from .validation_errors import FieldValidationError


def include_archived(request) -> bool:
    return request.query_params.get("include_archived", "").lower() in {"1", "true", "yes"}


def lock_schema(schema_id: int) -> DataSchema:
    return DataSchema.objects.select_for_update().select_related("owner", "created_by").get(pk=schema_id)


def validate_config(fields_config: list[dict]) -> list[dict]:
    try:
        return validate_fields_config(fields_config)
    except FieldValidationError as exc:
        raise ValidationError({"fields_config": validation_issues(exc)}) from exc


def create_schema_version(schema: DataSchema, user, changelog: str) -> SchemaVersion:
    return SchemaVersion.objects.create(
        schema=schema,
        version=schema.current_version,
        fields_config=schema.fields_config,
        changelog=changelog,
        created_by=user,
    )


def audit_schema_action(request, action: str, schema: DataSchema, detail: dict) -> None:
    record_audit_log(
        actor=request.user,
        action=action,
        target_type="schema",
        target_id=schema.id,
        detail=detail,
        ip_address=request.META.get("REMOTE_ADDR"),
    )


def reject_field_identity_changes(data) -> None:
    forbidden = {"key", "type", "introduced_in_version"} & set(data)
    if forbidden:
        raise ValidationError({field: "字段 key、类型和引入版本不可通过该接口修改" for field in forbidden})


def find_field_index(fields_config: list[dict], field_key: str) -> int:
    for index, field in enumerate(fields_config):
        if field.get("key") == field_key:
            return index
    raise NotFound("字段不存在")


def patch_field(field: dict, updates: dict, next_version: int) -> dict:
    updated = {**field, **updates}
    if updated.get("deprecated") is True and "deprecated_in_version" not in updated:
        updated["deprecated_in_version"] = next_version
    if updated.get("deprecated") is False:
        updated.pop("deprecated_in_version", None)
    return updated


def get_active_user(user_id: int) -> User:
    try:
        return User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist as exc:
        raise ValidationError({"user_id": "用户不存在或已停用"}) from exc


def get_collaborator(schema: DataSchema, user_id: int) -> TableCollaborator:
    try:
        return schema.collaborators.select_related("user").get(user_id=user_id)
    except TableCollaborator.DoesNotExist as exc:
        raise NotFound("协作者不存在") from exc
