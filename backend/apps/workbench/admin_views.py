from __future__ import annotations

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import WorkbenchItem, WorkbenchMaterialDetail, WorkbenchUserSetting


@api_view(["GET"])
def admin_workbench_users_view(request):
    if not request.user.is_superuser:
        raise PermissionDenied("only system administrators can view workbench user statistics")

    user_ids = set(WorkbenchItem.objects.values_list("owner_id", flat=True).distinct())
    user_ids.update(WorkbenchUserSetting.objects.values_list("owner_id", flat=True).distinct())
    if not user_ids:
        return Response({"count": 0, "results": []})

    item_rows = WorkbenchItem.objects.filter(owner_id__in=user_ids, deleted_at__isnull=True).values("owner_id").annotate(
        data_card_count=Count("id", filter=Q(type=WorkbenchItem.Type.DATA_CARD)),
        note_count=Count("id", filter=Q(type=WorkbenchItem.Type.NOTE)),
        material_count=Count("id", filter=Q(type=WorkbenchItem.Type.MATERIAL)),
    )
    item_map = {
        row["owner_id"]: {
            "data_card_count": row["data_card_count"],
            "note_count": row["note_count"],
            "material_count": row["material_count"],
        }
        for row in item_rows
    }

    storage_rows = (
        WorkbenchMaterialDetail.objects.filter(
            item__owner_id__in=user_ids,
            item__deleted_at__isnull=True,
        )
        .values("item__owner_id")
        .annotate(storage_used_bytes=Sum("size"))
    )
    storage_map = {row["item__owner_id"]: row["storage_used_bytes"] or 0 for row in storage_rows}

    setting_map = {
        row["owner_id"]: row["upload_disabled"]
        for row in WorkbenchUserSetting.objects.filter(owner_id__in=user_ids).values("owner_id", "upload_disabled")
    }

    rows = []
    for user_row in User.objects.filter(id__in=user_ids).order_by("id").values("id", "username"):
        owner_id = user_row["id"]
        counts = item_map.get(owner_id, {})
        rows.append(
            {
                "user_id": owner_id,
                "username": user_row["username"],
                "data_card_count": counts.get("data_card_count", 0),
                "note_count": counts.get("note_count", 0),
                "material_count": counts.get("material_count", 0),
                "storage_used_bytes": storage_map.get(owner_id, 0),
                "upload_disabled": setting_map.get(owner_id, False),
            }
        )
    return Response({"count": len(rows), "results": rows})
