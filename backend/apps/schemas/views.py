from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, parser_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.labels.template_config import (
    LabelPrintConfigError,
    label_print_config_validation_error,
    normalized_label_print_config,
)
from apps.temporal.api import (
    build_current_view_location_payload,
    build_current_view_payload,
    build_snapshot_diff_payload,
)

from .icon_upload import open_schema_icon, upload_schema_icon
from .identity import IdentityResolutionError, apply_identity_display_template
from .listing import order_schema_list, with_schema_list_metrics
from .models import DataSchema, TableCollaborator
from .permissions import (
    can_archive_schema,
    can_change_schema,
    can_create_schema,
    can_handover_schema,
    can_manage_collaborators,
)
from .serializers import (
    CollaboratorSerializer,
    CollaboratorWriteSerializer,
    DataSchemaCreateSerializer,
    DataSchemaSerializer,
    DataSchemaUpdateSerializer,
    HandoverSerializer,
    IdentityDisplayTemplateSerializer,
    LabelPrintConfigSerializer,
    SchemaFieldPatchSerializer,
)
from .services import (
    audit_schema_action,
    create_schema_version,
    find_field_index,
    get_active_user,
    get_collaborator,
    include_archived,
    lock_schema,
    patch_field,
    reject_field_identity_changes,
    validate_config,
)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def schema_icon_upload_view(request):
    payload = upload_schema_icon(request.user, request.FILES.get("file"))
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def schema_icon_view(request, filename: str):
    return open_schema_icon(filename)


class DataSchemaViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = (
            DataSchema.objects.for_user(self.request.user)
            .select_related("owner", "created_by")
        )
        if self.action == "list" and not include_archived(self.request):
            queryset = queryset.filter(is_archived=False)
        queryset = with_schema_list_metrics(queryset)
        if self.action == "list":
            return order_schema_list(queryset, self.request.query_params.get("ordering"))
        return queryset.order_by("schema_code")

    def get_serializer_class(self):
        if self.action == "create":
            return DataSchemaCreateSerializer
        if self.action == "partial_update":
            return DataSchemaUpdateSerializer
        return DataSchemaSerializer

    def create(self, request, *args, **kwargs):
        if not can_create_schema(request.user):
            raise PermissionDenied("当前用户不能建表")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            schema = serializer.save(owner=request.user, created_by=request.user)
            create_schema_version(schema, request.user, "初始版本")
            audit_schema_action(
                request, "schema.create", schema, {"schema_code": schema.schema_code}
            )

        return Response(
            DataSchemaSerializer(schema, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        schema = self.get_object()
        if not can_change_schema(request.user, schema):
            raise PermissionDenied("你对该表无结构修改权限")

        old_visibility = schema.visibility
        serializer = self.get_serializer(schema, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        changed_fields = sorted(serializer.validated_data)
        if old_visibility != schema.visibility:
            audit_schema_action(
                request,
                "schema.visibility_change",
                schema,
                {"from_visibility": old_visibility, "to_visibility": schema.visibility},
            )
        elif changed_fields:
            audit_schema_action(
                request, "schema.update", schema, {"changed_fields": changed_fields}
            )

        return Response(DataSchemaSerializer(schema, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="fields")
    def add_field(self, request, pk=None):
        schema = self.get_object()
        if not can_change_schema(request.user, schema):
            raise PermissionDenied("你对该表无字段修改权限")
        if not isinstance(request.data, dict):
            raise ValidationError({"field": "字段配置必须是对象"})

        with transaction.atomic():
            locked_schema = lock_schema(schema.pk)
            next_version = locked_schema.current_version + 1
            new_field = {**request.data, "introduced_in_version": next_version}
            fields_config = validate_config([*locked_schema.fields_config, new_field])
            locked_schema.fields_config = fields_config
            locked_schema.current_version = next_version
            locked_schema.save(
                update_fields=["fields_config", "current_version", "config_migrated_at"]
            )
            create_schema_version(locked_schema, request.user, f"新增字段 {new_field.get('key')}")
            audit_schema_action(
                request,
                "schema.update_fields",
                locked_schema,
                {"added_field_key": new_field.get("key"), "version": next_version},
            )

        return Response(fields_config[-1], status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path=r"fields/(?P<field_key>[a-z][a-z0-9_]*)")
    def patch_field(self, request, field_key=None, pk=None):
        schema = self.get_object()
        if not can_change_schema(request.user, schema):
            raise PermissionDenied("你对该表无字段修改权限")
        reject_field_identity_changes(request.data)

        patch_serializer = SchemaFieldPatchSerializer(data=request.data, partial=True)
        patch_serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            locked_schema = lock_schema(schema.pk)
            field_index = find_field_index(locked_schema.fields_config, field_key)
            next_version = locked_schema.current_version + 1
            updated_field = patch_field(
                locked_schema.fields_config[field_index],
                patch_serializer.validated_data,
                next_version,
            )
            fields_config = list(locked_schema.fields_config)
            fields_config[field_index] = updated_field
            fields_config = validate_config(fields_config)
            locked_schema.fields_config = fields_config
            locked_schema.current_version = next_version
            locked_schema.save(
                update_fields=["fields_config", "current_version", "config_migrated_at"]
            )
            create_schema_version(locked_schema, request.user, f"修改字段 {field_key}")
            audit_schema_action(
                request,
                "schema.update_fields",
                locked_schema,
                {
                    "changed_field_key": field_key,
                    "changed_fields": sorted(patch_serializer.validated_data),
                    "version": next_version,
                },
            )

        return Response(fields_config[field_index])

    @action(detail=True, methods=["get"], url_path="records")
    def records(self, request, pk=None):
        schema = self.get_object()
        payload = build_current_view_payload(schema, request.query_params, request.user)
        payload["schema"] = DataSchemaSerializer(schema, context=self.get_serializer_context()).data
        return Response(payload)

    @action(detail=True, methods=["get"], url_path="records/locate")
    def record_location(self, request, pk=None):
        schema = self.get_object()
        payload = build_current_view_location_payload(schema, request.query_params, request.user)
        return Response(payload)

    @action(detail=True, methods=["get"], url_path="snapshot-diff")
    def snapshot_diff(self, request, pk=None):
        schema = self.get_object()
        payload = build_snapshot_diff_payload(schema, request.query_params, request.user)
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, pk=None):
        schema = self.get_object()
        if not can_archive_schema(request.user, schema):
            raise PermissionDenied("你对该表无归档权限")
        if not schema.is_archived:
            schema.is_archived = True
            schema.save(update_fields=["is_archived"])
            audit_schema_action(
                request, "schema.archive", schema, {"schema_code": schema.schema_code}
            )
        return Response(DataSchemaSerializer(schema, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["patch"], url_path="identity-display-template")
    def identity_display_template(self, request, pk=None):
        schema = self.get_object()
        if not can_change_schema(request.user, schema):
            raise PermissionDenied("你对该表无结构修改权限")

        serializer = IdentityDisplayTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.validated_data["identity_display_template"]
        normalized_template = template.strip()

        with transaction.atomic():
            locked_schema = lock_schema(schema.pk)
            next_version = locked_schema.current_version + 1
            try:
                fields_config = validate_config(
                    apply_identity_display_template(locked_schema, template)
                )
            except IdentityResolutionError as exc:
                raise ValidationError({exc.field_key: exc.message}) from exc
            locked_schema.fields_config = fields_config
            locked_schema.current_version = next_version
            locked_schema.save(
                update_fields=["fields_config", "current_version", "config_migrated_at"]
            )
            create_schema_version(locked_schema, request.user, "修改实体展示模板")
            audit_schema_action(
                request,
                "schema.identity_display_template.update",
                locked_schema,
                {
                    "version": next_version,
                    "identity_display_template": normalized_template,
                },
            )

        return Response(
            DataSchemaSerializer(locked_schema, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["patch"], url_path="label-print-config")
    def label_print_config(self, request, pk=None):
        schema = self.get_object()
        if not can_change_schema(request.user, schema):
            raise PermissionDenied("你对该表无结构修改权限")

        serializer = LabelPrintConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            locked_schema = lock_schema(schema.pk)
            next_version = locked_schema.current_version + 1
            try:
                normalized_config = normalized_label_print_config(
                    locked_schema,
                    serializer.validated_data["label_print_config"],
                )
            except LabelPrintConfigError as exc:
                raise label_print_config_validation_error(exc) from exc

            locked_schema.label_print_config = normalized_config
            locked_schema.current_version = next_version
            locked_schema.save(
                update_fields=[
                    "label_print_config",
                    "current_version",
                    "config_migrated_at",
                ]
            )
            create_schema_version(locked_schema, request.user, "修改物理标签模板配置")
            audit_schema_action(
                request,
                "schema.label_print_config.update",
                locked_schema,
                {"version": next_version, "label_print_config": normalized_config},
            )

        return Response(
            DataSchemaSerializer(locked_schema, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"], url_path="handover")
    def handover(self, request, pk=None):
        schema = self.get_object()
        if not can_handover_schema(request.user, schema):
            raise PermissionDenied("只有系统管理员可以移交表 owner")

        serializer = HandoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_owner = get_active_user(serializer.validated_data["owner_id"])
        old_owner_id = schema.owner_id
        if new_owner.id == old_owner_id:
            raise ValidationError({"owner_id": "新 owner 不能与当前 owner 相同"})

        with transaction.atomic():
            locked_schema = lock_schema(schema.pk)
            locked_schema.owner = new_owner
            locked_schema.save(update_fields=["owner"])
            TableCollaborator.objects.filter(
                schema=locked_schema, user__in=[new_owner, schema.owner]
            ).delete()
            audit_schema_action(
                request,
                "schema.handover",
                locked_schema,
                {"from_owner_id": old_owner_id, "to_owner_id": new_owner.id},
            )

        return Response(
            DataSchemaSerializer(locked_schema, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["get", "post"], url_path="collaborators")
    def collaborators(self, request, pk=None):
        schema = self.get_object()
        if not can_manage_collaborators(request.user, schema):
            raise PermissionDenied("你对该表无协作者管理权限")
        if request.method == "GET":
            return self._list_collaborators(schema)
        return self._create_collaborator(request, schema)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"collaborators/(?P<user_id>\d+)",
    )
    def collaborator_detail(self, request, user_id=None, pk=None):
        schema = self.get_object()
        if not can_manage_collaborators(request.user, schema):
            raise PermissionDenied("你对该表无协作者管理权限")
        collaborator = get_collaborator(schema, user_id)
        if request.method == "DELETE":
            return self._delete_collaborator(request, schema, collaborator)
        return self._update_collaborator(request, schema, collaborator)

    def _list_collaborators(self, schema):
        queryset = schema.collaborators.select_related("user").order_by("user__username")
        return Response(CollaboratorSerializer(queryset, many=True).data)

    def _create_collaborator(self, request, schema):
        serializer = CollaboratorWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = serializer.validated_data.get("user_id")
        if user_id is None:
            raise ValidationError({"user_id": "必填"})
        user = get_active_user(user_id)
        if user.id == schema.owner_id:
            raise ValidationError({"user_id": "owner 不需要添加为协作者"})
        if TableCollaborator.objects.filter(schema=schema, user=user).exists():
            raise ValidationError({"user_id": "该用户已是协作者"})

        collaborator = TableCollaborator.objects.create(
            schema=schema,
            user=user,
            role=serializer.validated_data["role"],
            added_by=request.user,
        )
        audit_schema_action(
            request,
            "collaborator.add",
            schema,
            {"user_id": user.id, "role": collaborator.role},
        )
        return Response(CollaboratorSerializer(collaborator).data, status=status.HTTP_201_CREATED)

    def _update_collaborator(self, request, schema, collaborator):
        serializer = CollaboratorWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data.get("role")
        if role is None:
            raise ValidationError({"role": "必填"})
        old_role = collaborator.role
        collaborator.role = role
        collaborator.save(update_fields=["role"])
        audit_schema_action(
            request,
            "collaborator.update",
            schema,
            {"user_id": collaborator.user_id, "from_role": old_role, "to_role": collaborator.role},
        )
        return Response(CollaboratorSerializer(collaborator).data)

    def _delete_collaborator(self, request, schema, collaborator):
        user_id = collaborator.user_id
        role = collaborator.role
        collaborator.delete()
        audit_schema_action(
            request, "collaborator.remove", schema, {"user_id": user_id, "role": role}
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
