from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound

from .models import Notification, NotificationPreference

logger = logging.getLogger(__name__)


def emit_notification(
    *,
    recipient: Any,
    type: str,
    title: str,
    body: str = "",
    actor: Any = None,
    severity: str = Notification.Severity.INFO,
    target_kind: str = "",
    target_id: str = "",
    target_url: str = "",
    payload: dict[str, Any] | None = None,
    dedupe_key: str = "",
    expires_at: Any = None,
) -> Notification | None:
    _validate_target_url(target_url)
    if actor is not None and getattr(actor, "id", None) == getattr(recipient, "id", None):
        return None
    if not in_app_notification_enabled(recipient=recipient, type=type):
        return None

    values = {
        "recipient": recipient,
        "actor": actor,
        "type": type,
        "severity": severity,
        "title": title,
        "body": body,
        "target_kind": target_kind,
        "target_id": str(target_id or ""),
        "target_url": target_url,
        "payload": payload or {},
        "dedupe_key": dedupe_key,
        "expires_at": expires_at,
    }

    try:
        if dedupe_key:
            notification, _ = Notification.objects.get_or_create(
                recipient=recipient,
                dedupe_key=dedupe_key,
                defaults=values,
            )
            return notification
        return Notification.objects.create(**values)
    except IntegrityError:
        if dedupe_key:
            return Notification.objects.filter(recipient=recipient, dedupe_key=dedupe_key).first()
        raise


def in_app_notification_enabled(*, recipient: Any, type: str) -> bool:
    recipient_id = getattr(recipient, "id", None)
    if recipient_id is None:
        return True
    preference = (
        NotificationPreference.objects.filter(user_id=recipient_id, type=type)
        .only("in_app_enabled")
        .first()
    )
    return preference.in_app_enabled if preference is not None else True


def emit_notifications(
    *,
    recipients: Iterable[Any],
    type: str,
    title: str,
    body: str = "",
    actor: Any = None,
    severity: str = Notification.Severity.INFO,
    target_kind: str = "",
    target_id: str = "",
    target_url: str = "",
    payload: dict[str, Any] | None = None,
    dedupe_key_builder: Callable[[Any], str] | None = None,
    expires_at: Any = None,
) -> list[Notification]:
    created = []
    for recipient in _unique_recipients(recipients):
        notification = emit_notification(
            recipient=recipient,
            actor=actor,
            type=type,
            title=title,
            body=body,
            severity=severity,
            target_kind=target_kind,
            target_id=target_id,
            target_url=target_url,
            payload=payload,
            dedupe_key=dedupe_key_builder(recipient) if dedupe_key_builder else "",
            expires_at=expires_at,
        )
        if notification is not None:
            created.append(notification)
    return created


def schedule_notification_on_commit(**kwargs: Any) -> None:
    def callback() -> None:
        try:
            emit_notification(**kwargs)
        except Exception:
            logger.exception("failed to emit notification after transaction commit")

    transaction.on_commit(callback)


def schedule_notifications_on_commit(**kwargs: Any) -> None:
    def callback() -> None:
        try:
            emit_notifications(**kwargs)
        except Exception:
            logger.exception("failed to emit notifications after transaction commit")

    transaction.on_commit(callback)


def mark_notification_read(*, actor: Any, notification_id: int) -> Notification:
    notification = _owned_notification(actor, notification_id)
    if notification.read_at is None:
        notification.read_at = timezone.now()
        notification.save(update_fields=["read_at"])
    return notification


def mark_all_notifications_read(*, actor: Any, type: str | None = None) -> int:
    now = timezone.now()
    queryset = Notification.objects.filter(
        recipient=actor,
        read_at__isnull=True,
        archived_at__isnull=True,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    if type:
        queryset = queryset.filter(type=type)
    return queryset.update(read_at=now)


def archive_notification(*, actor: Any, notification_id: int) -> Notification:
    notification = _owned_notification(actor, notification_id)
    now = timezone.now()
    update_fields = []
    if notification.read_at is None:
        notification.read_at = now
        update_fields.append("read_at")
    if notification.archived_at is None:
        notification.archived_at = now
        update_fields.append("archived_at")
    if update_fields:
        notification.save(update_fields=update_fields)
    return notification


def _owned_notification(actor: Any, notification_id: int) -> Notification:
    try:
        return Notification.objects.select_related("actor", "recipient").get(
            pk=notification_id,
            recipient=actor,
        )
    except Notification.DoesNotExist as exc:
        raise NotFound("通知不存在。") from exc


def _validate_target_url(target_url: str) -> None:
    if not target_url:
        return
    if not target_url.startswith("/") or target_url.startswith("//"):
        raise ValueError("target_url 必须是站内相对路径。")


def _unique_recipients(recipients: Iterable[Any]) -> list[Any]:
    unique = []
    seen_ids = set()
    for recipient in recipients:
        recipient_id = getattr(recipient, "id", None)
        if recipient_id is None or recipient_id in seen_ids:
            continue
        seen_ids.add(recipient_id)
        unique.append(recipient)
    return unique
