from __future__ import annotations

from typing import Any

from django.db.models import Prefetch, Q, QuerySet

from apps.schemas.permissions import can_view_schema

from .models import CommentReadState, CommentThread
from .permissions import visible_field_keys

SummaryCounts = dict[str, int]
EntitySummary = dict[str, SummaryCounts | dict[str, SummaryCounts]]


def visible_threads(user: Any, schema: Any) -> QuerySet[CommentThread]:
    if not can_view_schema(user, schema):
        return CommentThread.objects.none()
    return (
        CommentThread.objects.filter(schema=schema)
        .filter(_phase_one_visible_anchor_query(user, schema))
        .select_related("schema", "entity", "created_by", "resolved_by")
        .prefetch_related("comments", "comments__created_by", "comments__mentions")
        .order_by("-last_activity_at", "-id")
    )


def summary_for_entities(
    user: Any,
    schema: Any,
    entity_ids: list[int],
) -> dict[int, EntitySummary]:
    requested_entity_ids = _normalized_entity_ids(entity_ids)
    if not requested_entity_ids or not can_view_schema(user, schema):
        return {}

    threads = (
        CommentThread.objects.filter(schema=schema, entity_id__in=requested_entity_ids)
        .filter(_phase_one_visible_anchor_query(user, schema))
        .prefetch_related(
            Prefetch(
                "read_states",
                queryset=CommentReadState.objects.filter(user=user),
                to_attr="current_user_read_states",
            )
        )
    )
    return _summarize_threads(threads)


def _phase_one_visible_anchor_query(user: Any, schema: Any) -> Q:
    anchor_query = Q(anchor_type=CommentThread.AnchorType.ROW)
    allowed_field_keys = visible_field_keys(user, schema)
    if allowed_field_keys:
        anchor_query |= Q(
            anchor_type=CommentThread.AnchorType.CELL,
            field_key__in=allowed_field_keys,
        )
    return anchor_query


def _summarize_threads(threads: QuerySet[CommentThread]) -> dict[int, EntitySummary]:
    summary: dict[int, EntitySummary] = {}
    for thread in threads:
        entity_summary = _entity_summary(summary, thread.entity_id)
        counts = _thread_counts(entity_summary, thread)
        _increment_counts(counts, thread)
    return summary


def _entity_summary(summary: dict[int, EntitySummary], entity_id: int) -> EntitySummary:
    if entity_id not in summary:
        summary[entity_id] = {"row": _empty_counts(), "cells": {}}
    return summary[entity_id]


def _thread_counts(entity_summary: EntitySummary, thread: CommentThread) -> SummaryCounts:
    if thread.anchor_type == CommentThread.AnchorType.ROW:
        return entity_summary["row"]  # type: ignore[return-value]
    cells = entity_summary["cells"]  # type: ignore[assignment]
    if thread.field_key not in cells:
        cells[thread.field_key] = _empty_counts()
    return cells[thread.field_key]


def _increment_counts(counts: SummaryCounts, thread: CommentThread) -> None:
    counts["total_count"] += 1
    if thread.status == CommentThread.Status.OPEN:
        counts["open_count"] += 1
    if _thread_is_unread(thread):
        counts["unread_count"] += 1


def _thread_is_unread(thread: CommentThread) -> bool:
    read_states = getattr(thread, "current_user_read_states", [])
    if not read_states:
        return True
    return read_states[0].last_read_at < thread.last_activity_at


def _empty_counts() -> SummaryCounts:
    return {"open_count": 0, "total_count": 0, "unread_count": 0}


def _normalized_entity_ids(entity_ids: list[int]) -> list[int]:
    normalized = []
    for entity_id in entity_ids:
        if isinstance(entity_id, bool) or not isinstance(entity_id, int) or entity_id <= 0:
            continue
        if entity_id not in normalized:
            normalized.append(entity_id)
        if len(normalized) >= 200:
            break
    return normalized
