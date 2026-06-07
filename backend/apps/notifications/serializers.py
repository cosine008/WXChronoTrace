from __future__ import annotations

from typing import Any

from .models import Notification, NotificationPreference


def serialize_notification(notification: Notification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "type": notification.type,
        "severity": notification.severity,
        "title": notification.title,
        "body": notification.body,
        "target_kind": notification.target_kind,
        "target_id": notification.target_id,
        "target_url": notification.target_url,
        "payload": notification.payload,
        "actor": _serialize_actor(notification.actor),
        "read_at": _iso_or_none(notification.read_at),
        "archived_at": _iso_or_none(notification.archived_at),
        "created_at": notification.created_at.isoformat(),
        "expires_at": _iso_or_none(notification.expires_at),
    }


def serialize_preference(preference: NotificationPreference) -> dict[str, Any]:
    return {
        "type": preference.type,
        "in_app_enabled": preference.in_app_enabled,
        "external_enabled": preference.external_enabled,
        "updated_at": _iso_or_none(preference.updated_at),
    }


def _serialize_actor(actor: Any) -> dict[str, Any] | None:
    if actor is None:
        return None
    profile = getattr(actor, "profile", None)
    display_name = getattr(profile, "display_name", "") or actor.get_full_name() or actor.username
    return {
        "id": actor.id,
        "username": actor.username,
        "display_name": display_name,
    }


def _iso_or_none(value: Any) -> str | None:
    return value.isoformat() if value else None
