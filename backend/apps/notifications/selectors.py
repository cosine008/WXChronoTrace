from __future__ import annotations

import math
from typing import Any

from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Notification
from .serializers import serialize_notification

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def notification_summary(user: Any) -> dict[str, Any]:
    queryset = _active_notifications(user).filter(read_at__isnull=True)
    latest = queryset.order_by("-created_at").first()
    return {
        "unread_count": queryset.count(),
        "latest_created_at": latest.created_at.isoformat() if latest else None,
    }


def list_notifications_payload(user: Any, query_params: Any) -> dict[str, Any]:
    page = _positive_int(query_params.get("page"), "page", default=1)
    page_size = _positive_int(
        query_params.get("page_size"),
        "page_size",
        default=DEFAULT_PAGE_SIZE,
        maximum=MAX_PAGE_SIZE,
    )
    queryset = _filtered_notifications(user, query_params)
    total = queryset.count()
    start = (page - 1) * page_size
    notifications = list(queryset[start : start + page_size])
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": [serialize_notification(notification) for notification in notifications],
    }


def _filtered_notifications(user: Any, query_params: Any) -> QuerySet[Notification]:
    status = str(query_params.get("status") or "all")
    if status == "archived":
        queryset = Notification.objects.filter(recipient=user, archived_at__isnull=False)
    else:
        queryset = _active_notifications(user)
        if status == "unread":
            queryset = queryset.filter(read_at__isnull=True)
        elif status != "all":
            raise ValidationError({"status": "必须是 all、unread 或 archived。"})

    if type_value := query_params.get("type"):
        queryset = queryset.filter(type=str(type_value))

    return queryset.select_related("actor", "recipient").order_by("-created_at", "-id")


def _active_notifications(user: Any) -> QuerySet[Notification]:
    now = timezone.now()
    return Notification.objects.filter(recipient=user, archived_at__isnull=True).filter(
        expires_at__isnull=True
    ) | Notification.objects.filter(
        recipient=user,
        archived_at__isnull=True,
        expires_at__gt=now,
    )


def _positive_int(value: Any, field: str, *, default: int, maximum: int | None = None) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "必须是正整数。"}) from exc
    if parsed <= 0:
        raise ValidationError({field: "必须是正整数。"})
    if maximum is not None and parsed > maximum:
        raise ValidationError({field: f"最大值是 {maximum}。"})
    return parsed
