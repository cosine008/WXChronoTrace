from __future__ import annotations

from django.db.models import Q, QuerySet

from .models import WorkbenchItem
from .selectors import visible_items


def search_items(user, query: str = "", item_type: str = "", tag: str = "") -> QuerySet[WorkbenchItem]:
    queryset = visible_items(user)
    if item_type:
        queryset = queryset.filter(type=item_type)
    if tag:
        queryset = queryset.filter(tags__contains=[tag])
    if not query:
        return queryset
    return queryset.filter(
        Q(title__icontains=query)
        | Q(summary__icontains=query)
        | Q(tags__icontains=query)
        | Q(data_card_detail__remark__icontains=query)
        | Q(data_card_detail__fields__name__icontains=query)
        | Q(data_card_detail__fields__value__icontains=query)
        | Q(note_detail__markdown_content__icontains=query)
        | Q(material_detail__original_name__icontains=query)
        | Q(material_detail__description__icontains=query)
    ).distinct()
