from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_create_schema, can_edit_data, can_export_schema

from .api import commit_import, preview_import
from .excel_intake.commit import commit_intake
from .excel_intake.normalize import build_preview
from .excel_intake.scan import scan_upload
from .excel_intake.storage import get_upload
from .template import build_template_workbook


@api_view(["GET"])
def import_template_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    if not can_export_schema(request.user, schema):
        raise PermissionDenied("你对该表无导出权限")
    content = build_template_workbook(schema)
    response = HttpResponse(
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{schema.schema_code}_template.xlsx"'
    return response


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def import_preview_view(request, schema_id: int):
    schema = _editable_schema(request.user, schema_id)
    return Response(preview_import(schema, _uploaded_file(request), request.data))


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def import_commit_view(request, schema_id: int):
    schema = _editable_schema(request.user, schema_id)
    payload = commit_import(schema, request.user, request.FILES.get("file"), request.data)
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def excel_intake_scan_view(request):
    return Response(scan_upload(_uploaded_file(request)))


@api_view(["POST"])
@parser_classes([JSONParser, FormParser])
def excel_intake_preview_view(request):
    filename, content = get_upload(request.data.get("upload_token"))
    return Response(build_preview(filename, content, request.data))


@api_view(["POST"])
@parser_classes([JSONParser, FormParser])
def excel_intake_commit_view(request):
    if not can_create_schema(request.user):
        raise PermissionDenied("当前用户不能建表")
    filename, content = get_upload(request.data.get("upload_token"))
    payload = commit_intake(filename, content, request.user, request.data, request=request)
    return Response(payload, status=status.HTTP_201_CREATED)


def _visible_schema(user, schema_id: int) -> DataSchema:
    schema = DataSchema.objects.for_user(user).filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("数据表不存在")
    return schema


def _editable_schema(user, schema_id: int) -> DataSchema:
    schema = _visible_schema(user, schema_id)
    if not can_edit_data(user, schema):
        raise PermissionDenied("你对该表无数据编辑权限")
    return schema


def _uploaded_file(request):
    file_obj = request.FILES.get("file")
    if file_obj is None:
        raise ValidationError({"file": "必须上传 Excel 文件"})
    return file_obj
