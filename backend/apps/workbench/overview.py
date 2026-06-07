from __future__ import annotations

from django.db.models import Count, Q, Sum

from .models import WorkbenchItem, WorkbenchMaterialDetail, WorkbenchNoteDetail
from .selectors import visible_items
from .serializers import WorkbenchItemSerializer


def build_workbench_overview(user, request=None) -> dict:
    items = WorkbenchItem.objects.filter(owner=user, deleted_at__isnull=True)
    metrics = items.aggregate(
        data_card_count=Count("id", filter=Q(type=WorkbenchItem.Type.DATA_CARD)),
        note_count=Count("id", filter=Q(type=WorkbenchItem.Type.NOTE)),
        material_count=Count("id", filter=Q(type=WorkbenchItem.Type.MATERIAL)),
    )
    storage_used_bytes = (
        WorkbenchMaterialDetail.objects.filter(
            item__owner=user,
            item__deleted_at__isnull=True,
        ).aggregate(total=Sum("size"))["total"]
        or 0
    )
    metrics["storage_used_bytes"] = storage_used_bytes

    visible_note_items = visible_items(user).filter(type=WorkbenchItem.Type.NOTE)
    note_summary = {
        "total_count": metrics["note_count"] or 0,
        "pending_confirm_count": visible_note_items.filter(
            note_detail__status=WorkbenchNoteDetail.Status.PENDING_CONFIRM,
        ).count(),
    }
    pinned_items = visible_items(user).filter(is_pinned=True)[:8]
    pending_notes = visible_note_items.filter(
        note_detail__status=WorkbenchNoteDetail.Status.PENDING_CONFIRM,
    ).order_by("-updated_at", "-id")[:3]
    recent_notes = list(pending_notes)
    if len(recent_notes) < 3:
        recent_note_ids = [item.id for item in recent_notes]
        recent_notes.extend(
            visible_note_items.exclude(id__in=recent_note_ids).order_by("-updated_at", "-id")[
                : 3 - len(recent_notes)
            ]
        )
    recent_materials = (
        visible_items(user).filter(type=WorkbenchItem.Type.MATERIAL).order_by("-updated_at", "-id")[:5]
    )

    serializer_context = {"request": request} if request is not None else {}

    return {
        "metrics": metrics,
        "note_summary": {
            **note_summary,
            "homepage_count": len(recent_notes),
        },
        "pinned": WorkbenchItemSerializer(
            pinned_items,
            many=True,
            context=serializer_context,
        ).data,
        "recent_notes": WorkbenchItemSerializer(
            recent_notes,
            many=True,
            context=serializer_context,
        ).data,
        "recent_materials": WorkbenchItemSerializer(
            recent_materials,
            many=True,
            context=serializer_context,
        ).data,
    }
