from django.db.models import Count, DateTimeField, F, Func, IntegerField, Max, Q
from django.db.models.functions import Coalesce, Greatest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.changesets.models import ChangeSet

SCHEMA_LIST_DEFAULT_ORDERING = "-last_modified_at"
SCHEMA_LIST_ORDER_FIELDS = {
    "created_at",
    "field_count",
    "last_data_change_at",
    "last_modified_at",
    "name",
    "row_count",
    "schema_code",
}


def with_schema_list_metrics(queryset):
    today = timezone.localdate()
    active_record_filter = (
        Q(entity__records__is_superseded=False)
        & Q(entity__records__valid_from__lte=today)
        & (
            Q(entity__records__valid_to__isnull=True)
            | Q(entity__records__valid_to__gt=today)
        )
    )
    effective_change_filter = Q(
        changeset__status__in=[
            ChangeSet.Status.APPLIED,
            ChangeSet.Status.REVERTED,
        ]
    )
    return queryset.annotate(
        field_count=Func(
            "fields_config",
            function="jsonb_array_length",
            output_field=IntegerField(),
        ),
        row_count=Count("entity", filter=active_record_filter, distinct=True),
        last_data_change_at=Max(
            Coalesce("changeset__applied_at", "changeset__created_at"),
            filter=effective_change_filter,
            output_field=DateTimeField(),
        ),
    ).annotate(
        last_modified_at=Greatest(
            "config_migrated_at",
            Coalesce("last_data_change_at", "created_at"),
            "created_at",
            output_field=DateTimeField(),
        )
    )


def order_schema_list(queryset, ordering: str | None):
    normalized = ordering or SCHEMA_LIST_DEFAULT_ORDERING
    descending = normalized.startswith("-")
    field = normalized[1:] if descending else normalized
    if field not in SCHEMA_LIST_ORDER_FIELDS:
        raise ValidationError({"ordering": "不支持的排序字段"})
    primary = F(field).desc(nulls_last=True) if descending else F(field).asc(nulls_last=True)
    return queryset.order_by(primary, "name", "id")
