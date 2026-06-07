from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.db.models import Count
from django.utils import timezone

from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema


def build_dashboard_payload(user: Any) -> dict[str, int]:
    visible_schemas = DataSchema.objects.for_user(user)
    active_schemas = visible_schemas.filter(is_archived=False)
    schema_ids = list(active_schemas.values_list("id", flat=True))
    managed_schema_count = (
        active_schemas.count()
        if getattr(user, "is_superuser", False)
        else active_schemas.filter(owner=user).count()
    )
    shared_schema_count = (
        active_schemas.filter(
            visibility=DataSchema.Visibility.SHARED,
            collaborators__user=user,
        )
        .exclude(owner=user)
        .distinct()
        .count()
    )
    recent_since = timezone.now() - timedelta(days=30)
    recent_changes = ChangeSet.objects.filter(
        schema_id__in=schema_ids,
        status=ChangeSet.Status.APPLIED,
        applied_at__gte=recent_since,
    )
    return {
        "schema_count": len(schema_ids),
        "owned_schema_count": managed_schema_count,
        "shared_schema_count": shared_schema_count,
        "public_schema_count": active_schemas.filter(
            visibility=DataSchema.Visibility.PUBLIC
        ).count(),
        "archived_schema_count": visible_schemas.filter(is_archived=True).count(),
        "pending_approval_count": ChangeSet.objects.filter(
            schema_id__in=schema_ids,
            status=ChangeSet.Status.SUBMITTED,
            approver=user,
        ).count(),
        "recent_change_count": recent_changes.count(),
        "active_user_count": recent_changes.aggregate(total=Count("created_by", distinct=True))[
            "total"
        ],
    }
