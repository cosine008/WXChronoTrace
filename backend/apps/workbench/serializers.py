from __future__ import annotations

import json
from collections.abc import Mapping

from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from apps.schemas.models import DataSchema

from .models import (
    WorkbenchDataCardDetail,
    WorkbenchDataCardField,
    WorkbenchItem,
    WorkbenchLink,
    WorkbenchMaterialChecklistItem,
    WorkbenchMaterialDetail,
    WorkbenchNoteDetail,
)


class WorkbenchDataCardFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkbenchDataCardField
        fields = [
            "id",
            "name",
            "value",
            "value_type",
            "unit",
            "remark",
            "sort_order",
        ]


class WorkbenchDataCardDetailSerializer(serializers.ModelSerializer):
    fields = WorkbenchDataCardFieldSerializer(many=True, read_only=True)

    class Meta:
        model = WorkbenchDataCardDetail
        fields = [
            "category",
            "applicable_year",
            "applicable_region",
            "applicable_subject",
            "effective_from",
            "effective_to",
            "status",
            "remark",
            "fields",
        ]


class StrictStringField(serializers.CharField):
    default_error_messages = {
        "invalid_type": "Not a valid string.",
    }

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid_type")
        return super().to_internal_value(data)


class RejectUnknownFieldsMixin:
    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown_fields = set(data.keys()) - set(self.fields.keys())
            if unknown_fields:
                joined = ", ".join(sorted(str(field) for field in unknown_fields))
                raise serializers.ValidationError({"non_field_errors": [f"Unknown field(s): {joined}"]})
        return super().to_internal_value(data)


class MaterialTagsField(serializers.ListField):
    default_error_messages = {
        "must_be_list": "tags must be a list of strings",
        "json_must_be_array": "tags JSON must be an array of strings",
        "invalid_json": "tags is not valid JSON",
    }

    def __init__(self, **kwargs):
        kwargs.setdefault("child", StrictStringField())
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        normalized = self._normalize(data)
        return super().to_internal_value(normalized)

    def _normalize(self, data):
        if isinstance(data, str):
            stripped = data.strip()
            if stripped.startswith("["):
                try:
                    decoded = json.loads(stripped)
                except json.JSONDecodeError:
                    self.fail("invalid_json")
                if not isinstance(decoded, list):
                    self.fail("json_must_be_array")
                return decoded
            return [data]

        if isinstance(data, list) and len(data) == 1 and isinstance(data[0], str):
            candidate = data[0].strip()
            if candidate.startswith("["):
                try:
                    decoded = json.loads(candidate)
                except json.JSONDecodeError:
                    self.fail("invalid_json")
                if not isinstance(decoded, list):
                    self.fail("json_must_be_array")
                return decoded
        return data


class WorkbenchDataCardFieldWriteSerializer(RejectUnknownFieldsMixin, serializers.Serializer):
    name = StrictStringField(max_length=120)
    value = StrictStringField(required=False, allow_blank=True, default="")
    value_type = serializers.ChoiceField(
        choices=WorkbenchDataCardField.ValueType.choices,
        required=False,
        default=WorkbenchDataCardField.ValueType.TEXT,
    )
    unit = StrictStringField(max_length=32, required=False, allow_blank=True, default="")
    remark = StrictStringField(required=False, allow_blank=True, default="")
    sort_order = serializers.IntegerField(required=False, min_value=0)


class WorkbenchDataCardPayloadSerializer(RejectUnknownFieldsMixin, serializers.Serializer):
    summary = StrictStringField(required=False, allow_blank=True)
    tags = serializers.ListField(child=StrictStringField(), required=False)
    is_pinned = serializers.BooleanField(required=False)
    is_sensitive = serializers.BooleanField(required=False)

    category = serializers.ChoiceField(choices=WorkbenchDataCardDetail.Category.choices, required=False)
    applicable_year = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    applicable_region = StrictStringField(max_length=120, required=False, allow_blank=True)
    applicable_subject = StrictStringField(max_length=120, required=False, allow_blank=True)
    effective_from = serializers.DateField(required=False, allow_null=True)
    effective_to = serializers.DateField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=WorkbenchDataCardDetail.Status.choices, required=False)
    remark = StrictStringField(required=False, allow_blank=True)
    fields = WorkbenchDataCardFieldWriteSerializer(many=True, required=False)


class WorkbenchDataCardCreateSerializer(WorkbenchDataCardPayloadSerializer):
    title = StrictStringField(max_length=160)


class WorkbenchDataCardUpdateSerializer(WorkbenchDataCardPayloadSerializer):
    title = StrictStringField(max_length=160, required=False)


class WorkbenchNoteCreateSerializer(RejectUnknownFieldsMixin, serializers.Serializer):
    title = StrictStringField(max_length=160)
    summary = StrictStringField(required=False, allow_blank=True)
    tags = serializers.ListField(child=StrictStringField())
    is_pinned = serializers.BooleanField(required=False)
    is_sensitive = serializers.BooleanField(required=False)
    markdown_content = StrictStringField(required=False, allow_blank=True, default="", trim_whitespace=False)
    stage = serializers.ChoiceField(choices=WorkbenchNoteDetail.Stage.choices)
    status = serializers.ChoiceField(choices=WorkbenchNoteDetail.Status.choices)


class WorkbenchNoteUpdateSerializer(RejectUnknownFieldsMixin, serializers.Serializer):
    title = StrictStringField(max_length=160, required=False)
    summary = StrictStringField(required=False, allow_blank=True)
    tags = serializers.ListField(child=StrictStringField(), required=False)
    is_pinned = serializers.BooleanField(required=False)
    is_sensitive = serializers.BooleanField(required=False)
    markdown_content = StrictStringField(required=False, allow_blank=True, trim_whitespace=False)
    stage = serializers.ChoiceField(choices=WorkbenchNoteDetail.Stage.choices, required=False)
    status = serializers.ChoiceField(choices=WorkbenchNoteDetail.Status.choices, required=False)


class WorkbenchNoteQuickCaptureSerializer(RejectUnknownFieldsMixin, serializers.Serializer):
    markdown_content = StrictStringField(required=False, allow_blank=True, trim_whitespace=False)
    content = StrictStringField(required=False, allow_blank=True, trim_whitespace=False)
    target_schema_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        if "markdown_content" not in attrs and "content" not in attrs:
            raise serializers.ValidationError(
                {"non_field_errors": ["markdown_content or content is required"]}
            )
        return attrs


class WorkbenchMaterialCreateSerializer(RejectUnknownFieldsMixin, serializers.Serializer):
    file = serializers.FileField(required=True)
    title = StrictStringField(max_length=160, required=False, allow_blank=True)
    summary = StrictStringField(required=False, allow_blank=True)
    tags = MaterialTagsField(required=False)
    is_pinned = serializers.BooleanField(required=False)
    is_sensitive = serializers.BooleanField(required=False)
    description = StrictStringField(required=False, allow_blank=True)


class WorkbenchMaterialUpdateSerializer(RejectUnknownFieldsMixin, serializers.Serializer):
    title = StrictStringField(max_length=160, required=False)
    summary = StrictStringField(required=False, allow_blank=True)
    tags = MaterialTagsField(required=False)
    is_pinned = serializers.BooleanField(required=False)
    is_sensitive = serializers.BooleanField(required=False)
    description = StrictStringField(required=False, allow_blank=True)


class ActiveLinkedMaterialField(serializers.PrimaryKeyRelatedField):
    def use_pk_only_optimization(self):
        return False

    def to_representation(self, value):
        if value is None or value.deleted_at is not None:
            return None
        return super().to_representation(value)


class WorkbenchMaterialChecklistItemSerializer(RejectUnknownFieldsMixin, serializers.ModelSerializer):
    linked_material = ActiveLinkedMaterialField(
        queryset=WorkbenchItem.objects.filter(deleted_at__isnull=True),
        required=False,
        allow_null=True,
    )
    linked_material_item = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = WorkbenchMaterialChecklistItem
        fields = [
            "id",
            "title",
            "status",
            "linked_material",
            "linked_material_item",
            "note",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "linked_material_item", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self._context_user()
        queryset = WorkbenchItem.objects.filter(
            type=WorkbenchItem.Type.MATERIAL,
            deleted_at__isnull=True,
        )
        if user is None:
            queryset = queryset.none()
        else:
            queryset = queryset.filter(owner=user)
        self.fields["linked_material"].queryset = queryset

    def validate_linked_material(self, value: WorkbenchItem | None) -> WorkbenchItem | None:
        if value is None:
            return None
        user = self._context_user()
        if value.type != WorkbenchItem.Type.MATERIAL:
            raise serializers.ValidationError("linked_material must reference a material item")
        if value.deleted_at is not None:
            raise serializers.ValidationError("linked_material must not be deleted")
        if user is not None and value.owner_id != user.id:
            raise serializers.ValidationError("linked_material must belong to the current user")
        return value

    def create(self, validated_data):
        return WorkbenchMaterialChecklistItem.objects.create(
            owner=self._context_user(),
            schema=self._context_schema(),
            **validated_data,
        )

    def get_linked_material_item(self, obj: WorkbenchMaterialChecklistItem) -> dict | None:
        linked_material = obj.linked_material
        if linked_material is None or linked_material.deleted_at is not None:
            return None
        return {
            "id": linked_material.id,
            "title": linked_material.title,
            "type": linked_material.type,
        }

    def _context_schema(self):
        return self.context.get("schema")

    def _context_user(self):
        request = self.context.get("request")
        if request is None:
            return self.context.get("owner")
        user = getattr(request, "user", None)
        if getattr(user, "is_authenticated", False):
            return user
        return self.context.get("owner")


class WorkbenchNoteDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkbenchNoteDetail
        fields = [
            "markdown_content",
            "stage",
            "status",
        ]


class WorkbenchNoteListDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkbenchNoteDetail
        fields = [
            "stage",
            "status",
        ]


class WorkbenchMaterialDetailSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkbenchMaterialDetail
        fields = [
            "original_name",
            "content_type",
            "size",
            "checksum",
            "description",
            "preview_status",
            "download_url",
            "preview_url",
        ]

    def get_download_url(self, obj: WorkbenchMaterialDetail) -> str:
        return f"/api/v1/workbench/materials/{obj.item_id}/download/"

    def get_preview_url(self, obj: WorkbenchMaterialDetail) -> str | None:
        if obj.preview_status == WorkbenchMaterialDetail.PreviewStatus.IMAGE:
            return self.get_download_url(obj)
        return None


class WorkbenchItemSerializer(serializers.ModelSerializer):
    detail = serializers.SerializerMethodField()
    links = serializers.SerializerMethodField()

    class Meta:
        model = WorkbenchItem
        fields = [
            "id",
            "type",
            "title",
            "summary",
            "tags",
            "is_pinned",
            "is_archived",
            "is_sensitive",
            "deleted_at",
            "last_used_at",
            "created_at",
            "updated_at",
            "detail",
            "links",
        ]

    def get_detail(self, obj: WorkbenchItem) -> dict:
        if obj.type == WorkbenchItem.Type.DATA_CARD:
            detail = self._safe_related(obj, "data_card_detail")
            if detail is None:
                return {}
            return WorkbenchDataCardDetailSerializer(detail, context=self.context).data
        if obj.type == WorkbenchItem.Type.NOTE:
            detail = self._safe_related(obj, "note_detail")
            if detail is None:
                return {}
            return WorkbenchNoteDetailSerializer(detail, context=self.context).data
        if obj.type == WorkbenchItem.Type.MATERIAL:
            detail = self._safe_related(obj, "material_detail")
            if detail is None:
                return {}
            return WorkbenchMaterialDetailSerializer(detail, context=self.context).data
        return {}

    def get_links(self, obj: WorkbenchItem) -> list[dict]:
        return [self._serialize_link(link) for link in self._outgoing_links(obj)]

    def _serialize_link(self, link: WorkbenchLink) -> dict:
        return {
            "id": link.id,
            "target_item": self._serialize_target_item(link),
            "target_schema": self._serialize_target_schema(link),
        }

    def _serialize_target_item(self, link: WorkbenchLink) -> dict | None:
        if link.target_item_id is None:
            return None

        target_item = self._safe_link_related(link, "target_item")
        if target_item is not None and self._can_access_target_item(target_item):
            return {
                "id": target_item.id,
                "title": target_item.title,
                "type": target_item.type,
                "accessible": True,
            }
        return {
            "id": link.target_item_id,
            "title": None,
            "type": None,
            "accessible": False,
        }

    def _serialize_target_schema(self, link: WorkbenchLink) -> dict | None:
        if link.target_schema_id is None:
            return None

        target_schema = self._safe_link_related(link, "target_schema")
        if self._can_access_target_schema(link.target_schema_id):
            return {
                "id": link.target_schema_id,
                "name": target_schema.name if target_schema is not None else None,
                "accessible": True,
            }
        return {
            "id": link.target_schema_id,
            "name": None,
            "accessible": False,
        }

    def _outgoing_links(self, obj: WorkbenchItem):
        prefetched = getattr(obj, "_prefetched_objects_cache", {})
        links = prefetched.get("outgoing_links")
        if links is not None:
            return links
        return obj.outgoing_links.select_related("target_item", "target_schema").all()

    def _can_access_target_item(self, target_item: WorkbenchItem) -> bool:
        if target_item.deleted_at is not None:
            return False
        user = self._context_user()
        if user is None:
            return False
        if getattr(user, "is_superuser", False):
            return True
        return target_item.owner_id == user.id

    def _can_access_target_schema(self, schema_id: int) -> bool:
        user = self._context_user()
        if user is None:
            return False
        if getattr(user, "is_superuser", False):
            return True
        cache = getattr(self, "_schema_access_cache", None)
        if cache is None:
            cache = {}
            self._schema_access_cache = cache
        if schema_id not in cache:
            cache[schema_id] = DataSchema.objects.for_user(user).filter(pk=schema_id).exists()
        return cache[schema_id]

    def _context_user(self):
        request = self.context.get("request")
        if request is None:
            return None
        user = getattr(request, "user", None)
        if not getattr(user, "is_authenticated", False):
            return None
        return user

    @staticmethod
    def _safe_link_related(obj: WorkbenchLink, attr: str):
        try:
            return getattr(obj, attr)
        except ObjectDoesNotExist:
            return None

    @staticmethod
    def _safe_related(obj: WorkbenchItem, attr: str):
        try:
            return getattr(obj, attr)
        except ObjectDoesNotExist:
            return None


class WorkbenchNoteListItemSerializer(WorkbenchItemSerializer):
    def get_detail(self, obj: WorkbenchItem) -> dict:
        detail = self._safe_related(obj, "note_detail")
        if detail is None:
            return {}
        return WorkbenchNoteListDetailSerializer(detail, context=self.context).data


class SchemaWorkbenchItemSerializer(WorkbenchItemSerializer):
    def get_detail(self, obj: WorkbenchItem) -> dict:
        if obj.type == WorkbenchItem.Type.NOTE:
            detail = self._safe_related(obj, "note_detail")
            if detail is None:
                return {}
            return WorkbenchNoteListDetailSerializer(detail, context=self.context).data
        return super().get_detail(obj)

    def get_links(self, obj: WorkbenchItem) -> list[dict]:
        schema_id = self.context.get("schema_id")
        links = self._outgoing_links(obj)
        if schema_id is not None:
            links = [link for link in links if link.target_schema_id == schema_id]
        return [self._serialize_link(link) for link in links]
