from __future__ import annotations

import math
from collections import Counter
from datetime import timedelta
from typing import Any

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .api import _action_counts_by_changeset, _serialize_changeset_summary
from .models import ChangeSet

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
APPROVAL_OVERDUE_DAYS = 3


def list_admin_pending_changesets_payload(query_params) -> dict[str, Any]:
    queryset = _apply_filters(
        ChangeSet.objects.filter(status=ChangeSet.Status.SUBMITTED)
        .select_related("schema", "created_by", "approver"),
        query_params,
    ).order_by("created_at", "id")
    page = _positive_int(query_params.get("page"), "page", default=1)
    page_size = _positive_int(
        query_params.get("page_size"),
        "page_size",
        default=DEFAULT_PAGE_SIZE,
        maximum=MAX_PAGE_SIZE,
    )
    total = queryset.count()
    start = (page - 1) * page_size
    items = list(queryset[start : start + page_size])
    action_counts = _action_counts_by_changeset([item.id for item in items])
    now = timezone.now()
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": [
            _serialize_admin_pending_changeset(
                item,
                action_counts.get(item.id, Counter()),
                now,
            )
            for item in items
        ],
    }


def _apply_filters(queryset, query_params):
    if schema := query_params.get("schema"):
        queryset = _filter_schema(queryset, schema)
    if creator := query_params.get("creator"):
        queryset = _filter_user(queryset, "created_by", creator)
    if approver := query_params.get("approver"):
        queryset = _filter_user(queryset, "approver", approver)
    if min_age_days := query_params.get("min_age_days"):
        days = _non_negative_int(min_age_days, "min_age_days")
        queryset = queryset.filter(created_at__lte=timezone.now() - timedelta(days=days))
    return queryset


def _serialize_admin_pending_changeset(
    change_set: ChangeSet,
    action_counts: Counter,
    now,
) -> dict[str, Any]:
    age_days = max((now - change_set.created_at).days, 0)
    return {
        **_serialize_changeset_summary(change_set, action_counts),
        "schema_name": change_set.schema.name,
        "schema_code": change_set.schema.schema_code,
        "age_days": age_days,
        "overdue": age_days >= APPROVAL_OVERDUE_DAYS,
    }


def _filter_schema(queryset, value: str):
    if value.isdigit():
        return queryset.filter(schema_id=int(value))
    return queryset.filter(
        Q(schema__schema_code__icontains=value) | Q(schema__name__icontains=value)
    )


def _filter_user(queryset, relation: str, value: str):
    if value.isdigit():
        return queryset.filter(**{f"{relation}_id": int(value)})
    return queryset.filter(**{f"{relation}__username__icontains": value})


def _positive_int(value: object, field: str, *, default: int, maximum: int | None = None) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "must be a positive integer"}) from exc
    if parsed < 1:
        raise ValidationError({field: "must be a positive integer"})
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def _non_negative_int(value: object, field: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "must be a non-negative integer"}) from exc
    if parsed < 0:
        raise ValidationError({field: "must be a non-negative integer"})
    return parsed
