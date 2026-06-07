import json

from django.http import HttpResponse, JsonResponse
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response

from apps.audit.services import record_audit_log
from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_export_schema, can_view_schema
from apps.temporal.models import Entity

from .admin_overview import build_admin_overview_payload
from .api import (
    build_distribution_payload,
    build_flow_payload,
    build_summary_payload,
    build_trend_payload,
)
from .dashboard import build_dashboard_payload
from .detail_exports import build_changeset_export, build_entity_export
from .export import build_current_export
from .export_tasks import begin_current_export_task


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
def stats_summary_view(request, schema_id: int):
    return Response(
        build_summary_payload(
            _visible_schema(request.user, schema_id),
            request.query_params,
            request.user,
        )
    )


@api_view(["GET"])
def stats_trend_view(request, schema_id: int):
    return Response(build_trend_payload(_visible_schema(request.user, schema_id), request.query_params))


@api_view(["GET"])
def stats_distribution_view(request, schema_id: int):
    return Response(
        build_distribution_payload(
            _visible_schema(request.user, schema_id),
            request.query_params,
            request.user,
        )
    )


@api_view(["GET"])
def stats_flow_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    try:
        return Response(build_flow_payload(schema, request.query_params, request.user))
    except ValidationError as exc:
        return Response(exc.detail, status=400)


@api_view(["GET"])
def dashboard_view(request):
    return Response(build_dashboard_payload(request.user))


@api_view(["GET"])
def admin_overview_view(request):
    if not request.user.is_superuser:
        raise PermissionDenied("只有系统管理员可以查看后台总览")
    return Response(build_admin_overview_payload())


@api_view(["GET"])
@renderer_classes([JSONRenderer, CSVRenderer, XLSXRenderer])
def current_export_view(request, schema_id: int):
    schema = _exportable_schema(request.user, schema_id)
    task_lock = begin_current_export_task(schema, request.user, request.query_params)
    if not task_lock.acquired:
        return JsonResponse(
            {"detail": "same export snapshot is already running"},
            status=409,
        )
    try:
        export = build_current_export(schema, request.user, request.query_params)
        _ensure_export_permission(request.user, schema)
        _audit_export(request, schema, export["metadata"])
    finally:
        task_lock.release()
    response = HttpResponse(export["content"], content_type=_content_type(export["format"]))
    response["Content-Disposition"] = f'attachment; filename="{export["filename"]}"'
    return response


@api_view(["GET"])
def changeset_export_view(request, change_set_id: int):
    change_set = _visible_changeset(request.user, change_set_id)
    export = build_changeset_export(change_set, request.user)
    _audit_export(request, change_set.schema, export["metadata"], target=change_set)
    return _xlsx_response(export)


@api_view(["GET"])
def entity_export_view(request, entity_id: int):
    entity = _visible_entity(request.user, entity_id)
    export = build_entity_export(entity, request.user)
    _audit_export(request, entity.schema, export["metadata"], target=entity)
    return _xlsx_response(export)


def _visible_schema(user, schema_id: int) -> DataSchema:
    schema = DataSchema.objects.for_user(user).filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("schema does not exist")
    return schema


def _exportable_schema(user, schema_id: int) -> DataSchema:
    schema = _visible_schema(user, schema_id)
    _ensure_export_permission(user, schema)
    return schema


def _ensure_export_permission(user, schema: DataSchema) -> None:
    if not can_export_schema(user, schema):
        raise PermissionDenied("you do not have export permission")


def _visible_changeset(user, change_set_id: int) -> ChangeSet:
    change_set = ChangeSet.objects.select_related("schema").filter(pk=change_set_id).first()
    if (
        change_set is None
        or not can_view_schema(user, change_set.schema)
        or not can_export_schema(user, change_set.schema)
    ):
        raise NotFound("changeset does not exist")
    return change_set


def _visible_entity(user, entity_id: int) -> Entity:
    entity = Entity.objects.select_related("schema").filter(pk=entity_id).first()
    if (
        entity is None
        or not can_view_schema(user, entity.schema)
        or not can_export_schema(user, entity.schema)
    ):
        raise NotFound("entity does not exist")
    return entity


def _audit_export(request, schema: DataSchema, metadata: dict, target=None) -> None:
    target_type = metadata.get("export_scope", "schema")
    target_id = getattr(target, "id", schema.id)
    detail = {
        "export_id": metadata["export_id"],
        "format": metadata.get("format", "xlsx"),
        "row_count": metadata["row_count"],
        "export_scope": metadata.get("export_scope", "current_view"),
        "schema_code": schema.schema_code,
        "data_at": metadata.get("data_at"),
    }
    query_snapshot = _metadata_json(metadata.get("query_snapshot"))
    if query_snapshot is not None:
        detail["query_snapshot"] = query_snapshot
    record_audit_log(
        actor=request.user,
        action="data.export",
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        ip_address=request.META.get("REMOTE_ADDR"),
    )


def _metadata_json(value: object) -> dict | None:
    if not isinstance(value, str) or not value:
        return None
    parsed = json.loads(value)
    return parsed if isinstance(parsed, dict) else None


def _xlsx_response(export: dict) -> HttpResponse:
    response = HttpResponse(export["content"], content_type=_content_type("xlsx"))
    response["Content-Disposition"] = f'attachment; filename="{export["filename"]}"'
    return response


def _content_type(export_format: str) -> str:
    if export_format == "csv":
        return "text/csv; charset=utf-8"
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
