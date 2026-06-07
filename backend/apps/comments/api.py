from __future__ import annotations

from typing import Any

from django.db.models import Prefetch
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.schemas.models import DataSchema
from apps.temporal.models import Entity, TemporalRecord

from .models import CommentReadState, CommentThread
from .selectors import summary_for_entities, visible_threads
from .serializers import serialize_thread
from .services import (
    add_comment,
    create_thread_with_initial_comment,
    mark_thread_read,
    reopen_thread,
    resolve_thread,
)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def comment_threads_view(request):
    if request.method == "GET":
        schema = _schema_from_query(request.query_params)
        threads = _filtered_threads(request.user, schema, request.query_params)
        return Response(
            {
                "count": len(threads),
                "results": [serialize_thread(thread, request.user) for thread in threads],
            }
        )

    schema = _schema_from_payload(request.data)
    entity = _entity_from_payload(schema, request.data)
    record = _record_from_payload(request.data)
    thread = create_thread_with_initial_comment(
        actor=request.user,
        schema=schema,
        anchor_type=str(request.data.get("anchor_type") or ""),
        entity=entity,
        field_key=str(request.data.get("field_key") or ""),
        context_date=_optional_date(request.data.get("context_date"), "context_date"),
        record_at_creation=record,
        body=str(request.data.get("body") or ""),
        mention_user_ids=_int_list(request.data.get("mention_user_ids", []), "mention_user_ids"),
    )
    return Response(serialize_thread(thread, request.user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def comment_thread_comments_view(request, thread_id: int):
    thread = _thread_or_404(thread_id)
    updated = add_comment(
        actor=request.user,
        thread=thread,
        body=str(request.data.get("body") or ""),
        mention_user_ids=_int_list(request.data.get("mention_user_ids", []), "mention_user_ids"),
    )
    return Response(serialize_thread(updated, request.user), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def comment_thread_resolve_view(request, thread_id: int):
    thread = resolve_thread(actor=request.user, thread=_thread_or_404(thread_id))
    return Response(serialize_thread(thread, request.user))


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def comment_thread_reopen_view(request, thread_id: int):
    thread = reopen_thread(actor=request.user, thread=_thread_or_404(thread_id))
    return Response(serialize_thread(thread, request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def comment_thread_read_view(request, thread_id: int):
    thread = _thread_or_404(thread_id)
    mark_thread_read(actor=request.user, thread=thread)
    return Response(serialize_thread(_thread_or_404(thread_id), request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def comment_summary_view(request):
    schema = _schema_from_query(request.query_params)
    entity_ids = _entity_ids(request.query_params.get("entity_ids"))
    summary = summary_for_entities(request.user, schema, entity_ids)
    return Response(
        {
            "schema_id": schema.id,
            "entities": {str(entity_id): payload for entity_id, payload in summary.items()},
        }
    )


def _filtered_threads(user: Any, schema: DataSchema, query_params: Any) -> list[CommentThread]:
    queryset = _with_user_read_states(visible_threads(user, schema), user)
    if anchor_type := query_params.get("anchor_type"):
        queryset = queryset.filter(anchor_type=_anchor_type(anchor_type))
    if entity_id := query_params.get("entity_id"):
        queryset = queryset.filter(entity_id=_positive_int(entity_id, "entity_id"))
    if (field_key := query_params.get("field_key")) not in (None, ""):
        queryset = queryset.filter(field_key=str(field_key))
    return list(queryset)


def _with_user_read_states(queryset: Any, user: Any) -> Any:
    return queryset.prefetch_related(
        "comments__mentions__user",
        Prefetch(
            "read_states",
            queryset=CommentReadState.objects.filter(user=user),
            to_attr="current_user_read_states",
        ),
    )


def _schema_from_query(query_params: Any) -> DataSchema:
    return _schema_or_404(_positive_int(query_params.get("schema_id"), "schema_id"))


def _schema_from_payload(payload: Any) -> DataSchema:
    return _schema_or_404(_positive_int(payload.get("schema_id"), "schema_id"))


def _schema_or_404(schema_id: int) -> DataSchema:
    try:
        return DataSchema.objects.get(pk=schema_id)
    except DataSchema.DoesNotExist as exc:
        raise NotFound("数据表不存在。") from exc


def _entity_from_payload(schema: DataSchema, payload: Any) -> Entity:
    entity_id = _positive_int(payload.get("entity_id"), "entity_id")
    try:
        entity = Entity.objects.get(pk=entity_id)
    except Entity.DoesNotExist as exc:
        raise ValidationError({"entity_id": "实体不存在。"}) from exc
    if entity.schema_id != schema.id:
        raise ValidationError({"entity_id": "实体不属于当前表。"})
    return entity


def _record_from_payload(payload: Any) -> TemporalRecord | None:
    record_id = payload.get("record_id")
    if record_id in (None, ""):
        return None
    try:
        return TemporalRecord.objects.get(pk=_positive_int(record_id, "record_id"))
    except TemporalRecord.DoesNotExist as exc:
        raise ValidationError({"record_id": "记录不存在。"}) from exc


def _thread_or_404(thread_id: int) -> CommentThread:
    try:
        return CommentThread.objects.select_related("schema", "entity").get(pk=thread_id)
    except CommentThread.DoesNotExist as exc:
        raise NotFound("评论线程不存在。") from exc


def _anchor_type(value: Any) -> str:
    anchor_type = str(value or "")
    if anchor_type not in {CommentThread.AnchorType.ROW, CommentThread.AnchorType.CELL}:
        raise ValidationError({"anchor_type": "必须是 row 或 cell。"})
    return anchor_type


def _entity_ids(value: Any) -> list[int]:
    if value in (None, ""):
        return []
    raw_ids = str(value).split(",")
    if len(raw_ids) > 200:
        raise ValidationError({"entity_ids": "最多支持 200 个 entity id。"})
    return [_positive_int(raw_id.strip(), "entity_ids") for raw_id in raw_ids]


def _int_list(value: Any, field: str) -> list[int]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValidationError({field: "必须是数组。"})
    return [_positive_int(item, field) for item in value]


def _optional_date(value: Any, field: str):
    if value in (None, ""):
        return None
    parsed = parse_date(str(value))
    if parsed is None:
        raise ValidationError({field: "日期格式必须是 YYYY-MM-DD。"})
    return parsed


def _positive_int(value: Any, field: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "必须是正整数。"}) from exc
    if parsed <= 0:
        raise ValidationError({field: "必须是正整数。"})
    return parsed
