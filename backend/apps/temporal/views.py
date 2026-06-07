from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.changesets.api import save_cell_edit
from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_edit_data, can_view_schema
from apps.schemas.serializers import DataSchemaSerializer

from .api import build_entity_timeline_payload
from .file_assets import download_field_file, preview_field_file, upload_field_file
from .models import Entity


@api_view(["GET"])
def entity_timeline_view(request, entity_id: int):
    entity = Entity.objects.select_related("schema", "schema__owner").filter(pk=entity_id).first()
    if entity is None or not can_view_schema(request.user, entity.schema):
        raise NotFound("实体不存在")

    payload = build_entity_timeline_payload(entity, request.user)
    payload["schema"] = DataSchemaSerializer(entity.schema, context={"request": request}).data
    return Response(payload)


@api_view(["POST"])
def record_cell_edit_view(request, schema_id: int, entity_id: int):
    schema = DataSchema.objects.for_user(request.user).filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("数据表不存在")
    if not can_edit_data(request.user, schema):
        raise PermissionDenied("你对该表无数据编辑权限")

    payload = save_cell_edit(schema, entity_id, request.user, request.data)
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def field_file_upload_view(request, schema_id: int, field_key: str):
    payload = upload_field_file(schema_id, field_key, request.user, request.FILES.get("file"))
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def field_file_download_view(request, asset_id: int):
    return download_field_file(asset_id, request.user)


@api_view(["GET"])
def field_file_preview_view(request, asset_id: int):
    return Response(preview_field_file(asset_id, request.user))
