from __future__ import annotations

from django.db.models import Prefetch, QuerySet

from .models import WorkbenchItem, WorkbenchLink

_OUTGOING_LINKS_PREFETCH = Prefetch(
    "outgoing_links",
    queryset=WorkbenchLink.objects.select_related("target_item", "target_schema").order_by("id"),
)


def visible_items(user) -> QuerySet[WorkbenchItem]:
    return (
        WorkbenchItem.objects.filter(owner=user, deleted_at__isnull=True)
        .select_related("data_card_detail", "note_detail", "material_detail")
        .prefetch_related("data_card_detail__fields", _OUTGOING_LINKS_PREFETCH)
        .order_by("-is_pinned", "-updated_at", "-id")
    )


def trash_items(user) -> QuerySet[WorkbenchItem]:
    return (
        WorkbenchItem.objects.filter(owner=user, deleted_at__isnull=False)
        .select_related("data_card_detail", "note_detail", "material_detail")
        .prefetch_related("data_card_detail__fields", _OUTGOING_LINKS_PREFETCH)
        .order_by("-deleted_at", "-id")
    )


def owned_item(user, item_id: int, *, include_deleted: bool = False) -> WorkbenchItem | None:
    queryset = WorkbenchItem.objects.filter(owner=user, pk=item_id)
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return (
        queryset.select_related("data_card_detail", "note_detail", "material_detail")
        .prefetch_related("data_card_detail__fields", _OUTGOING_LINKS_PREFETCH)
        .first()
    )
