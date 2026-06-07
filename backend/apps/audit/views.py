from django.http import HttpResponse
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response

from .api import list_audit_logs_payload
from .export import build_audit_export
from .services import record_audit_log


class CSVRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class XLSXRenderer(BaseRenderer):
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    format = "xlsx"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


@api_view(["GET"])
def audit_logs_view(request):
    return Response(list_audit_logs_payload(request.user, request.query_params))


@api_view(["GET"])
def sensitive_audit_logs_view(request):
    if not request.user.is_superuser:
        raise PermissionDenied("只有系统管理员可以查看敏感操作看板")
    return Response(
        list_audit_logs_payload(request.user, request.query_params, sensitive_only=True)
    )


@api_view(["GET"])
@renderer_classes([JSONRenderer, CSVRenderer, XLSXRenderer])
def sensitive_audit_export_view(request):
    if not request.user.is_superuser:
        raise PermissionDenied("只有系统管理员可以导出敏感操作")
    export = build_audit_export(request.user, request.query_params, sensitive_only=True)
    _audit_export(request, export["metadata"])
    response = HttpResponse(export["content"], content_type=_content_type(export["format"]))
    response["Content-Disposition"] = f'attachment; filename="{export["filename"]}"'
    return response


def _audit_export(request, metadata: dict) -> None:
    record_audit_log(
        actor=request.user,
        action="audit.export",
        target_type="audit",
        detail={
            "export_id": metadata["export_id"],
            "format": metadata["format"],
            "row_count": metadata["row_count"],
            "export_scope": metadata["export_scope"],
            "filters": metadata["filters"],
        },
        ip_address=request.META.get("REMOTE_ADDR"),
    )


def _content_type(export_format: str) -> str:
    if export_format == "csv":
        return "text/csv; charset=utf-8"
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
