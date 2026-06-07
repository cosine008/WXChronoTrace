from __future__ import annotations

from rest_framework import serializers, status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.schemas.models import DataSchema

from .models import WorkbenchItem, WorkbenchMaterialChecklistItem
from .overview import build_workbench_overview
from .search import search_items
from .selectors import owned_item, trash_items, visible_items
from .serializers import (
    SchemaWorkbenchItemSerializer,
    WorkbenchDataCardCreateSerializer,
    WorkbenchDataCardUpdateSerializer,
    WorkbenchItemSerializer,
    WorkbenchMaterialChecklistItemSerializer,
    WorkbenchMaterialCreateSerializer,
    WorkbenchMaterialUpdateSerializer,
    WorkbenchNoteCreateSerializer,
    WorkbenchNoteListItemSerializer,
    WorkbenchNoteQuickCaptureSerializer,
    WorkbenchNoteUpdateSerializer,
)
from .services import (
    copy_data_card_text,
    create_data_card,
    create_link,
    create_note,
    delete_link,
    download_material,
    purge_item,
    quick_capture_note,
    restore_item,
    soft_delete_item,
    update_data_card,
    update_material,
    update_note,
    upload_material,
)


class WorkbenchItemListQuerySerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=WorkbenchItem.Type.choices, required=False, allow_blank=True, default="")


class WorkbenchSearchQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True, default="")
    type = serializers.ChoiceField(choices=WorkbenchItem.Type.choices, required=False, allow_blank=True, default="")
    tag = serializers.CharField(required=False, allow_blank=True, default="")


class WorkbenchLinkCreateSerializer(serializers.Serializer):
    source_item_id = serializers.IntegerField(min_value=1)
    target_item_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    target_schema_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        has_target_item = attrs.get("target_item_id") is not None
        has_target_schema = attrs.get("target_schema_id") is not None
        if has_target_item == has_target_schema:
            raise serializers.ValidationError("target_item_id and target_schema_id must provide exactly one")
        return attrs


@api_view(["GET", "POST"])
def workbench_data_cards_view(request):
    if request.method == "GET":
        items = visible_items(request.user).filter(type=WorkbenchItem.Type.DATA_CARD)
        return Response(
            {
                "count": items.count(),
                "results": WorkbenchItemSerializer(items, many=True, context={"request": request}).data,
            }
        )

    serializer = WorkbenchDataCardCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    item = create_data_card(request.user, serializer.validated_data, request=request)
    return Response(
        WorkbenchItemSerializer(item, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH"])
def workbench_data_card_detail_view(request, item_id: int):
    if request.method == "GET":
        item = _owned_data_card_item(request.user, item_id)
        return Response(WorkbenchItemSerializer(item, context={"request": request}).data)

    serializer = WorkbenchDataCardUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    item = update_data_card(request.user, item_id, serializer.validated_data, request=request)
    return Response(WorkbenchItemSerializer(item, context={"request": request}).data)


@api_view(["POST"])
def workbench_data_card_copy_text_view(request, item_id: int):
    text = copy_data_card_text(request.user, item_id)
    return Response({"text": text})


@api_view(["GET", "POST"])
def workbench_notes_view(request):
    if request.method == "GET":
        items = visible_items(request.user).filter(type=WorkbenchItem.Type.NOTE)
        return Response(
            {
                "count": items.count(),
                "results": WorkbenchNoteListItemSerializer(
                    items, many=True, context={"request": request}
                ).data,
            }
        )

    serializer = WorkbenchNoteCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    item = create_note(request.user, serializer.validated_data, request=request)
    return Response(
        WorkbenchItemSerializer(item, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser])
def workbench_materials_view(request):
    if request.method == "GET":
        items = visible_items(request.user).filter(type=WorkbenchItem.Type.MATERIAL)
        return Response(
            {
                "count": items.count(),
                "results": WorkbenchItemSerializer(items, many=True, context={"request": request}).data,
            }
        )

    serializer = WorkbenchMaterialCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    item = upload_material(request.user, serializer.validated_data, request=request)
    return Response(
        WorkbenchItemSerializer(item, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH"])
def workbench_material_detail_view(request, item_id: int):
    if request.method == "GET":
        item = _owned_material_item(request.user, item_id)
        return Response(WorkbenchItemSerializer(item, context={"request": request}).data)

    serializer = WorkbenchMaterialUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    item = update_material(request.user, item_id, serializer.validated_data, request=request)
    return Response(WorkbenchItemSerializer(item, context={"request": request}).data)


@api_view(["GET"])
def workbench_material_download_view(request, item_id: int):
    return download_material(request.user, item_id, request=request)


@api_view(["GET", "PATCH"])
def workbench_note_detail_view(request, item_id: int):
    if request.method == "GET":
        item = _owned_note_item(request.user, item_id)
        return Response(WorkbenchItemSerializer(item, context={"request": request}).data)

    serializer = WorkbenchNoteUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    item = update_note(request.user, item_id, serializer.validated_data, request=request)
    return Response(WorkbenchItemSerializer(item, context={"request": request}).data)


@api_view(["POST"])
def workbench_notes_quick_capture_view(request):
    serializer = WorkbenchNoteQuickCaptureSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    item, warning = quick_capture_note(request.user, serializer.validated_data, request=request)
    return Response(
        {
            "item": WorkbenchItemSerializer(item, context={"request": request}).data,
            "warning": warning,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def workbench_items_view(request):
    query_serializer = WorkbenchItemListQuerySerializer(data=request.query_params)
    query_serializer.is_valid(raise_exception=True)
    item_type = query_serializer.validated_data["type"]

    items = visible_items(request.user)
    if item_type:
        items = items.filter(type=item_type)

    return Response(
        {
            "count": items.count(),
            "results": WorkbenchItemSerializer(items, many=True, context={"request": request}).data,
        }
    )


@api_view(["GET"])
def workbench_overview_view(request):
    return Response(build_workbench_overview(request.user, request=request))


@api_view(["DELETE"])
def workbench_item_detail_view(request, item_id: int):
    item = soft_delete_item(request.user, item_id, request=request)
    return Response(WorkbenchItemSerializer(item, context={"request": request}).data)


@api_view(["GET"])
def workbench_search_view(request):
    query_serializer = WorkbenchSearchQuerySerializer(data=request.query_params)
    query_serializer.is_valid(raise_exception=True)
    data = query_serializer.validated_data
    items = search_items(
        request.user,
        query=data["q"],
        item_type=data["type"],
        tag=data["tag"],
    )
    return Response(
        {
            "count": items.count(),
            "results": WorkbenchItemSerializer(items, many=True, context={"request": request}).data,
        }
    )


@api_view(["GET"])
def workbench_trash_view(request):
    items = trash_items(request.user)
    return Response(
        {
            "count": items.count(),
            "results": WorkbenchItemSerializer(items, many=True, context={"request": request}).data,
        }
    )


@api_view(["POST"])
def workbench_trash_restore_view(request, item_id: int):
    item = restore_item(request.user, item_id, request=request)
    return Response(WorkbenchItemSerializer(item, context={"request": request}).data)


@api_view(["DELETE"])
def workbench_trash_purge_view(request, item_id: int):
    purge_item(request.user, item_id, request=request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
def workbench_links_view(request):
    serializer = WorkbenchLinkCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    link, created = create_link(
        request.user,
        source_item_id=data["source_item_id"],
        target_item_id=data.get("target_item_id"),
        target_schema_id=data.get("target_schema_id"),
        request=request,
    )
    return Response(
        {
            "id": link.id,
            "source_item_id": link.source_item_id,
            "target_item_id": link.target_item_id,
            "target_schema_id": link.target_schema_id,
            "created": created,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["DELETE"])
def workbench_link_detail_view(request, link_id: int):
    delete_link(request.user, link_id, request=request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
def schema_workbench_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    items = visible_items(request.user).filter(outgoing_links__target_schema=schema).distinct()
    serializer = SchemaWorkbenchItemSerializer(
        items,
        many=True,
        context={"request": request, "schema_id": schema.id},
    )
    return Response({"count": items.count(), "results": serializer.data})


@api_view(["POST"])
def schema_workbench_quick_note_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    serializer = WorkbenchNoteQuickCaptureSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    payload = dict(serializer.validated_data)
    payload["target_schema_id"] = schema.id
    item, warning = quick_capture_note(request.user, payload, request=request)
    return Response(
        {
            "item": WorkbenchItemSerializer(item, context={"request": request}).data,
            "warning": warning,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "POST"])
def schema_workbench_material_checklist_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    if request.method == "GET":
        items = _owned_schema_checklist_queryset(request.user, schema)
        serializer = WorkbenchMaterialChecklistItemSerializer(
            items,
            many=True,
            context={"request": request, "schema": schema},
        )
        return Response({"count": items.count(), "results": serializer.data})

    serializer = WorkbenchMaterialChecklistItemSerializer(
        data=request.data,
        context={"request": request, "schema": schema},
    )
    serializer.is_valid(raise_exception=True)
    checklist_item = serializer.save()
    return Response(
        WorkbenchMaterialChecklistItemSerializer(
            checklist_item,
            context={"request": request, "schema": schema},
        ).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH", "DELETE"])
def schema_workbench_material_checklist_detail_view(request, schema_id: int, checklist_item_id: int):
    schema = _visible_schema(request.user, schema_id)
    checklist_item = _owned_schema_checklist_item(request.user, schema, checklist_item_id)
    if request.method == "DELETE":
        checklist_item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = WorkbenchMaterialChecklistItemSerializer(
        checklist_item,
        data=request.data,
        partial=True,
        context={"request": request, "schema": schema},
    )
    serializer.is_valid(raise_exception=True)
    checklist_item = serializer.save()
    return Response(
        WorkbenchMaterialChecklistItemSerializer(
            checklist_item,
            context={"request": request, "schema": schema},
        ).data
    )


def _owned_data_card_item(user, item_id: int) -> WorkbenchItem:
    item = owned_item(user, item_id)
    if item is None or item.type != WorkbenchItem.Type.DATA_CARD:
        raise NotFound("data card does not exist")
    return item


def _owned_note_item(user, item_id: int) -> WorkbenchItem:
    item = owned_item(user, item_id)
    if item is None or item.type != WorkbenchItem.Type.NOTE:
        raise NotFound("note does not exist")
    return item


def _owned_material_item(user, item_id: int) -> WorkbenchItem:
    item = owned_item(user, item_id)
    if item is None or item.type != WorkbenchItem.Type.MATERIAL:
        raise NotFound("material does not exist")
    return item


def _visible_schema(user, schema_id: int) -> DataSchema:
    schema = DataSchema.objects.for_user(user).filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("schema does not exist")
    return schema


def _owned_schema_checklist_queryset(user, schema: DataSchema):
    return (
        WorkbenchMaterialChecklistItem.objects.filter(owner=user, schema=schema)
        .select_related("linked_material")
        .order_by("sort_order", "id")
    )


def _owned_schema_checklist_item(user, schema: DataSchema, checklist_item_id: int) -> WorkbenchMaterialChecklistItem:
    checklist_item = _owned_schema_checklist_queryset(user, schema).filter(pk=checklist_item_id).first()
    if checklist_item is None:
        raise NotFound("material checklist item does not exist")
    return checklist_item
