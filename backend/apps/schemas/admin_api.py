from __future__ import annotations

import math
from typing import Any

from django.db.models import Count, Max, Q
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

from apps.changesets.models import ChangeSet

from .models import DataSchema

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def list_admin_schema_ledger_payload(query_params) -> dict[str, Any]:
    queryset = _apply_filters(
        DataSchema.objects.all().select_related("owner", "created_by"),
        query_params,
    ).order_by("schema_code", "id")
    page = _positive_int(query_params.get("page"), "page", default=1)
    page_size = _positive_int(
        query_params.get("page_size"),
        "page_size",
        default=DEFAULT_PAGE_SIZE,
        maximum=MAX_PAGE_SIZE,
    )
    total = queryset.count()
    start = (page - 1) * page_size
    schemas = list(queryset[start : start + page_size])
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": _serialize_schema_rows(schemas),
    }


def _apply_filters(queryset, query_params):
    if owner := query_params.get("owner"):
        queryset = _filter_owner(queryset, owner)
    if visibility := query_params.get("visibility"):
        queryset = _filter_visibility(queryset, visibility)
    if (archived := query_params.get("archived")) not in (None, "", "all"):
        queryset = queryset.filter(is_archived=_parse_bool(archived, "archived"))
    elif archived != "all":
        queryset = queryset.filter(is_archived=False)
    if (approval_required := query_params.get("approval_required")) not in (None, ""):
        queryset = queryset.filter(
            approval_required=_parse_bool(approval_required, "approval_required")
        )
    return _apply_change_window(queryset, query_params)


def _filter_owner(queryset, owner: str):
    if owner.isdigit():
        return queryset.filter(owner_id=int(owner))
    return queryset.filter(owner__username__icontains=owner)


def _filter_visibility(queryset, visibility: str):
    valid = {choice[0] for choice in DataSchema.Visibility.choices}
    if visibility not in valid:
        raise ValidationError({"visibility": "must be private, shared, or public"})
    return queryset.filter(visibility=visibility)


def _apply_change_window(queryset, query_params):
    changed_after = query_params.get("changed_after")
    changed_before = query_params.get("changed_before")
    if not changed_after and not changed_before:
        return queryset

    change_query = ChangeSet.objects.all()
    if changed_after:
        change_query = _filter_changed_after(change_query, changed_after)
    if changed_before:
        change_query = _filter_changed_before(change_query, changed_before)
    schema_ids = change_query.values_list("schema_id", flat=True)
    return queryset.filter(id__in=schema_ids)


def _serialize_schema_rows(schemas: list[DataSchema]) -> list[dict[str, Any]]:
    metrics = _changeset_metrics([schema.id for schema in schemas])
    return [_serialize_schema_row(schema, metrics.get(schema.id, {})) for schema in schemas]


def _changeset_metrics(schema_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not schema_ids:
        return {}
    rows = (
        ChangeSet.objects.filter(schema_id__in=schema_ids)
        .values("schema_id")
        .annotate(
            change_count=Count("id"),
            pending_changeset_count=Count(
                "id",
                filter=Q(status=ChangeSet.Status.SUBMITTED),
            ),
            last_change_at=Max("created_at"),
        )
    )
    return {row["schema_id"]: row for row in rows}


def _serialize_schema_row(schema: DataSchema, metrics: dict[str, Any]) -> dict[str, Any]:
    field_count = len(schema.fields_config) if isinstance(schema.fields_config, list) else 0
    last_change_at = metrics.get("last_change_at")
    return {
        "id": schema.id,
        "schema_code": schema.schema_code,
        "name": schema.name,
        "description": schema.description,
        "visibility": schema.visibility,
        "approval_required": schema.approval_required,
        "is_archived": schema.is_archived,
        "owner": _user_summary(schema.owner),
        "created_by": _user_summary(schema.created_by),
        "field_count": field_count,
        "current_version": schema.current_version,
        "created_at": schema.created_at.isoformat(),
        "updated_at": schema.config_migrated_at.isoformat(),
        "pending_changeset_count": metrics.get("pending_changeset_count", 0),
        "change_count": metrics.get("change_count", 0),
        "last_change_at": last_change_at.isoformat() if last_change_at else None,
    }


def _user_summary(user) -> dict[str, Any]:
    return {"id": user.id, "username": user.username}


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


def _parse_bool(value: object, field: str) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise ValidationError({field: "must be a boolean"})


def _filter_changed_after(queryset, value: str):
    if parsed_date := parse_date(value):
        return queryset.filter(created_at__date__gte=parsed_date)
    return queryset.filter(created_at__gte=_parse_datetime_boundary(value, "changed_after"))


def _filter_changed_before(queryset, value: str):
    if parsed_date := parse_date(value):
        return queryset.filter(created_at__date__lte=parsed_date)
    return queryset.filter(created_at__lte=_parse_datetime_boundary(value, "changed_before"))


def _parse_datetime_boundary(value: str, field: str):
    if parsed_datetime := parse_datetime(value):
        return parsed_datetime
    raise ValidationError({field: "must be YYYY-MM-DD or ISO datetime"})
