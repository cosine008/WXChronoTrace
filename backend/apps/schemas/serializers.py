import re
from urllib.parse import urlparse

from django.contrib.auth.models import User
from rest_framework import serializers

from .icon_upload import ICON_MAX_LENGTH, SCHEMA_ICON_URL_PREFIX
from .identity import (
    DISPLAY_TEMPLATE_MAX_LENGTH,
    GENERATED_ENTITY_CODE_FIELD_KEY,
    IDENTITY_CODE_FIELD_KEY,
    ensure_generated_entity_code_field,
    ensure_identity_code_field,
    schema_identity_display_template,
    schema_identity_field_keys,
    schema_identity_mode,
    validate_composite_identity_keys,
)
from .models import DataSchema, TableCollaborator
from .permissions import get_schema_role
from .validation import validate_fields_config
from .validation_errors import FieldValidationError


def validation_issues(error: FieldValidationError) -> list[dict]:
    return [
        {"path": item.path, "code": item.code, "message": item.message} for item in error.issues
    ]


def _iso_datetime(value) -> str | None:
    return value.isoformat() if value else None


def validate_schema_icon(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if re.fullmatch(r"[a-z][a-z0-9-]*", value):
        return value
    if value.startswith(SCHEMA_ICON_URL_PREFIX):
        return value

    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return value

    raise serializers.ValidationError("图标必须是内置图标名、http(s) 图片链接或已上传图标地址")


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class DataSchemaSerializer(serializers.ModelSerializer):
    owner = UserSummarySerializer(read_only=True)
    created_by = UserSummarySerializer(read_only=True)
    role = serializers.SerializerMethodField()
    identity_mode = serializers.SerializerMethodField()
    identity_field_keys = serializers.SerializerMethodField()
    identity_display_template = serializers.SerializerMethodField()
    field_count = serializers.SerializerMethodField()
    row_count = serializers.SerializerMethodField()
    last_data_change_at = serializers.SerializerMethodField()
    last_modified_at = serializers.SerializerMethodField()

    class Meta:
        model = DataSchema
        fields = [
            "id",
            "schema_code",
            "name",
            "description",
            "icon",
            "temporal_mode",
            "period_unit",
            "identity_mode",
            "identity_field_key",
            "identity_field_keys",
            "identity_display_template",
            "fields_config",
            "label_print_config",
            "field_count",
            "current_version",
            "config_migrated_at",
            "row_count",
            "last_data_change_at",
            "last_modified_at",
            "owner",
            "visibility",
            "approval_required",
            "created_at",
            "created_by",
            "is_archived",
            "role",
        ]

    def get_role(self, obj: DataSchema) -> str | None:
        request = self.context.get("request")
        if request is None:
            return None
        return get_schema_role(request.user, obj)

    def get_identity_mode(self, obj: DataSchema) -> str:
        return schema_identity_mode(obj)

    def get_identity_field_keys(self, obj: DataSchema) -> list[str]:
        return schema_identity_field_keys(obj)

    def get_identity_display_template(self, obj: DataSchema) -> str:
        return schema_identity_display_template(obj)

    def get_field_count(self, obj: DataSchema) -> int:
        value = getattr(obj, "field_count", None)
        if isinstance(value, int):
            return value
        fields = obj.fields_config if isinstance(obj.fields_config, list) else []
        return len(fields)

    def get_row_count(self, obj: DataSchema) -> int:
        value = getattr(obj, "row_count", None)
        return value if isinstance(value, int) else 0

    def get_last_data_change_at(self, obj: DataSchema) -> str | None:
        return _iso_datetime(getattr(obj, "last_data_change_at", None))

    def get_last_modified_at(self, obj: DataSchema) -> str | None:
        value = getattr(obj, "last_modified_at", None) or obj.config_migrated_at or obj.created_at
        return _iso_datetime(value)


class DataSchemaCreateSerializer(serializers.ModelSerializer):
    icon = serializers.CharField(required=False, allow_blank=True, max_length=ICON_MAX_LENGTH)
    identity_mode = serializers.ChoiceField(
        choices=[("single", "single"), ("composite", "composite")],
        required=False,
        default="single",
    )
    identity_field_keys = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = DataSchema
        fields = [
            "schema_code",
            "name",
            "description",
            "icon",
            "temporal_mode",
            "period_unit",
            "identity_mode",
            "identity_field_key",
            "identity_field_keys",
            "fields_config",
            "visibility",
            "approval_required",
        ]

    def validate_fields_config(self, value):
        try:
            return validate_fields_config(value)
        except FieldValidationError as exc:
            raise serializers.ValidationError(validation_issues(exc)) from exc

    def validate_icon(self, value: str) -> str:
        return validate_schema_icon(value)

    def validate(self, attrs):
        temporal_mode = attrs.get("temporal_mode", DataSchema.TemporalMode.CONTINUOUS)
        period_unit = attrs.get("period_unit")
        fields_config = attrs.get("fields_config", [])
        identity_mode = attrs.pop("identity_mode", "single")
        identity_field_keys = attrs.pop("identity_field_keys", [])

        if temporal_mode == DataSchema.TemporalMode.CONTINUOUS:
            attrs["period_unit"] = None
        elif not period_unit:
            raise serializers.ValidationError({"period_unit": "周期型表必须选择周期单位"})

        if identity_mode == "composite":
            attrs["fields_config"] = self._composite_fields_config(
                fields_config, identity_field_keys
            )
            attrs["identity_field_key"] = IDENTITY_CODE_FIELD_KEY
            return attrs

        identity_field_key = attrs.get("identity_field_key")
        if identity_field_key == GENERATED_ENTITY_CODE_FIELD_KEY:
            attrs["fields_config"] = self._generated_entity_code_fields_config(
                fields_config, attrs.get("schema_code", "")
            )
            return attrs

        field_keys = {field["key"] for field in fields_config}
        if identity_field_key not in field_keys:
            raise serializers.ValidationError(
                {"identity_field_key": "实体标识字段必须存在于字段配置中"}
            )
        return attrs

    def _generated_entity_code_fields_config(
        self, fields_config: list[dict], schema_code: str
    ) -> list[dict]:
        try:
            return validate_fields_config(ensure_generated_entity_code_field(fields_config, schema_code))
        except FieldValidationError as exc:
            raise serializers.ValidationError({"fields_config": validation_issues(exc)}) from exc

    def _composite_fields_config(
        self, fields_config: list[dict], field_keys: list[str]
    ) -> list[dict]:
        try:
            validate_composite_identity_keys(fields_config, field_keys)
            return validate_fields_config(ensure_identity_code_field(fields_config, field_keys))
        except FieldValidationError as exc:
            raise serializers.ValidationError({"fields_config": validation_issues(exc)}) from exc
        except ValueError as exc:
            field_key = getattr(exc, "field_key", "identity_field_keys")
            raise serializers.ValidationError({field_key: str(exc)}) from exc


class DataSchemaUpdateSerializer(serializers.ModelSerializer):
    icon = serializers.CharField(required=False, allow_blank=True, max_length=ICON_MAX_LENGTH)

    class Meta:
        model = DataSchema
        fields = ["name", "description", "icon", "visibility", "approval_required"]

    def validate_icon(self, value: str) -> str:
        return validate_schema_icon(value)


class IdentityDisplayTemplateSerializer(serializers.Serializer):
    identity_display_template = serializers.CharField(
        allow_blank=True,
        max_length=DISPLAY_TEMPLATE_MAX_LENGTH,
        trim_whitespace=False,
    )


class LabelPrintConfigSerializer(serializers.Serializer):
    label_print_config = serializers.JSONField()


class SchemaFieldPatchSerializer(serializers.Serializer):
    label = serializers.CharField(required=False, allow_blank=False)
    required = serializers.BooleanField(required=False)
    indexed = serializers.BooleanField(required=False)
    validators = serializers.DictField(required=False)
    deprecated = serializers.BooleanField(required=False)
    deprecated_in_version = serializers.IntegerField(required=False, min_value=1)
    sensitive = serializers.BooleanField(required=False)
    masking = serializers.DictField(required=False)


class HandoverSerializer(serializers.Serializer):
    owner_id = serializers.IntegerField(min_value=1)


class CollaboratorSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    is_employed = serializers.SerializerMethodField()

    class Meta:
        model = TableCollaborator
        fields = ["user_id", "username", "role", "added_at", "is_employed"]

    def get_is_employed(self, obj) -> bool:
        profile = getattr(obj.user, "profile", None)
        if profile is None:
            return obj.user.is_active
        return profile.is_active


class CollaboratorWriteSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, min_value=1)
    role = serializers.ChoiceField(choices=TableCollaborator.Role.choices)
