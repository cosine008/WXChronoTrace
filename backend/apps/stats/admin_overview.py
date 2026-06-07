from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import UserProfile
from apps.audit.api import serialize_audit_logs
from apps.audit.models import AuditLog
from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema

from .admin_export_api import export_event_has_risk, export_event_row_count

APPROVAL_OVERDUE_DAYS = 3
RECENT_LIMIT = 5


def build_admin_overview_payload() -> dict[str, Any]:
    since = timezone.now() - timedelta(days=30)
    return {
        "users": _user_metrics(),
        "schemas": _schema_metrics(),
        "approvals": _approval_metrics(),
        "sensitive_audit": _sensitive_audit_metrics(since),
        "exports": _export_metrics(since),
    }


def _user_metrics() -> dict[str, int]:
    total = User.objects.count()
    left_users = User.objects.filter(
        Q(is_active=False)
        | Q(id__in=UserProfile.objects.filter(is_active=False).values_list("user_id", flat=True))
    ).distinct()
    return {
        "total": total,
        "employed": total - left_users.count(),
        "left": left_users.count(),
        "superusers": User.objects.filter(is_superuser=True).count(),
    }


def _schema_metrics() -> dict[str, int]:
    schemas = DataSchema.objects.all()
    active = schemas.filter(is_archived=False)
    return {
        "active": active.count(),
        "public": active.filter(visibility=DataSchema.Visibility.PUBLIC).count(),
        "archived": schemas.filter(is_archived=True).count(),
        "approval_required": active.filter(approval_required=True).count(),
    }


def _approval_metrics() -> dict[str, Any]:
    pending = ChangeSet.objects.filter(status=ChangeSet.Status.SUBMITTED)
    overdue_since = timezone.now() - timedelta(days=APPROVAL_OVERDUE_DAYS)
    latest = pending.select_related("schema", "created_by").order_by("-created_at", "-id")[
        :RECENT_LIMIT
    ]
    return {
        "pending": pending.count(),
        "overdue": pending.filter(created_at__lt=overdue_since).count(),
        "latest": [_serialize_changeset(item) for item in latest],
    }


def _sensitive_audit_metrics(since) -> dict[str, Any]:
    logs = (
        AuditLog.objects.filter(is_sensitive=True, created_at__gte=since)
        .select_related("actor")
        .order_by("-created_at", "-id")
    )
    return {
        "last_30_days": logs.count(),
        "latest": serialize_audit_logs(list(logs[:RECENT_LIMIT])),
    }


def _export_metrics(since) -> dict[str, Any]:
    exports = (
        AuditLog.objects.filter(action="data.export", created_at__gte=since)
        .select_related("actor")
        .order_by("-created_at", "-id")
    )
    large = [_serialize_export(log) for log in exports if export_event_has_risk(log, "large_export")]
    return {
        "large_last_30_days": len(large),
        "recent_large": large[:RECENT_LIMIT],
    }


def _serialize_changeset(change_set: ChangeSet) -> dict[str, Any]:
    return {
        "id": change_set.id,
        "schema_id": change_set.schema_id,
        "schema_name": change_set.schema.name,
        "summary": change_set.summary,
        "created_by_username": change_set.created_by.username,
        "created_at": change_set.created_at.isoformat(),
    }


def _serialize_export(log: AuditLog) -> dict[str, Any]:
    return {
        "id": log.id,
        "actor_username": log.actor.username,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "row_count": _row_count(log),
        "format": log.detail.get("format"),
        "schema_code": log.detail.get("schema_code"),
        "created_at": log.created_at.isoformat(),
    }


def _row_count(log: AuditLog) -> int:
    return export_event_row_count(log) or 0
