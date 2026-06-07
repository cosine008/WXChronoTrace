from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.schemas.models import DataSchema
from apps.temporal.models import Entity

from .models import EntityLabel
from .permissions import ensure_can_manage_labels, ensure_can_view_labels
from .renderers import render_label_sheet_svg, render_label_svg
from .serializers import (
    LabelBulkCreateSerializer,
    LabelCreateSerializer,
    LabelPreviewSerializer,
    LabelPrintSerializer,
    LabelReasonSerializer,
    LabelReplaceSerializer,
    LabelSheetPrintSerializer,
)
from .services import (
    InvalidEntityIdsError,
    bulk_create_labels,
    create_label,
    record_label_print,
    replace_label,
    resolve_scan,
    revoke_label,
    serialize_label,
)


@api_view(["GET", "POST"])
def entity_labels_view(request, entity_id: int):
    entity = Entity.objects.select_related("schema", "schema__owner").filter(pk=entity_id).first()
    if entity is None:
        raise NotFound("实体不存在")

    if request.method == "GET":
        ensure_can_view_labels(request.user, entity)
        labels = EntityLabel.objects.filter(entity=entity).order_by("-issued_at", "-id")
        return Response(
            {
                "count": labels.count(),
                "results": [serialize_label(label) for label in labels],
            }
        )

    ensure_can_manage_labels(request.user, entity.schema)
    serializer = LabelCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    label = create_label(entity, request.user, **serializer.validated_data)
    return Response(serialize_label(label), status=status.HTTP_201_CREATED)


@api_view(["POST"])
def schema_labels_bulk_create_view(request, schema_id: int):
    schema = DataSchema.objects.filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("数据表不存在")
    ensure_can_manage_labels(request.user, schema)

    serializer = LabelBulkCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        payload = bulk_create_labels(schema, actor=request.user, **serializer.validated_data)
    except InvalidEntityIdsError as exc:
        return Response(
            {"invalid_entity_ids": exc.entity_ids},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def schema_label_active_samples_view(request, schema_id: int):
    schema = DataSchema.objects.filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("数据表不存在")
    ensure_can_manage_labels(request.user, schema)

    labels = list(
        EntityLabel.objects.select_related("entity", "schema", "schema__owner")
        .filter(schema=schema, status=EntityLabel.Status.ACTIVE)
        .order_by("-issued_at", "-id")[:10]
    )
    return Response(
        {
            "count": len(labels),
            "results": [serialize_label(label) for label in labels],
        }
    )


@api_view(["POST"])
def schema_labels_a4_print_view(request, schema_id: int):
    return _schema_labels_a4_svg_response(
        request,
        schema_id,
        record_print=True,
        filename="labels-a4.svg",
    )


@api_view(["POST"])
def schema_labels_a4_preview_view(request, schema_id: int):
    return _schema_labels_a4_svg_response(
        request,
        schema_id,
        record_print=False,
        filename="labels-a4-preview.svg",
    )


def _schema_labels_a4_svg_response(request, schema_id: int, *, record_print: bool, filename: str):
    schema = DataSchema.objects.filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("数据表不存在")
    ensure_can_manage_labels(request.user, schema)

    serializer = LabelSheetPrintSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    label_ids = serializer.validated_data["label_ids"]
    labels = _schema_labels_by_id(schema, label_ids)
    invalid_ids = [label_id for label_id in label_ids if label_id not in labels]
    if invalid_ids:
        return Response({"invalid_label_ids": invalid_ids}, status=status.HTTP_400_BAD_REQUEST)

    template_code = serializer.validated_data.get("template_code") or "a4_grid"
    label_items = [
        (labels[label_id], request.build_absolute_uri(f"/scan/{labels[label_id].label_code}"))
        for label_id in label_ids
    ]
    rendered = render_label_sheet_svg(label_items, template_code, request.user)
    if record_print:
        for item in rendered["snapshots"]:
            record_label_print(item["label"], request.user, template_code, item["snapshot"])

    response = HttpResponse(rendered["content"], content_type="image/svg+xml; charset=utf-8")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


@api_view(["POST"])
def label_revoke_view(request, label_id: int):
    label = _managed_label(request.user, label_id)
    serializer = LabelReasonSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    label = revoke_label(label, request.user, serializer.validated_data["reason"])
    return Response(serialize_label(label))


@api_view(["POST"])
def label_replace_view(request, label_id: int):
    label = _managed_label(request.user, label_id)
    serializer = LabelReplaceSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    new_label = replace_label(
        label,
        request.user,
        serializer.validated_data["reason"],
        serializer.validated_data.get("template_code"),
    )
    label.refresh_from_db()
    return Response(
        {
            "old_label": serialize_label(label),
            "new_label": serialize_label(new_label),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def label_print_view(request, label_id: int):
    label = _managed_label(request.user, label_id)
    serializer = LabelPrintSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    template_code = serializer.validated_data.get("template_code") or label.template_code
    scan_url = request.build_absolute_uri(f"/scan/{label.label_code}")
    rendered = render_label_svg(label, template_code, scan_url, request.user)
    record_label_print(label, request.user, template_code, rendered["snapshot"])
    response = HttpResponse(rendered["content"], content_type="image/svg+xml; charset=utf-8")
    response["Content-Disposition"] = f'inline; filename="{label.label_code}.svg"'
    return response


@api_view(["POST"])
def label_preview_view(request, label_id: int):
    label = _managed_label(request.user, label_id)
    serializer = LabelPreviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    template_code = serializer.validated_data.get("template_code") or label.template_code
    scan_url = request.build_absolute_uri(f"/scan/{label.label_code}")
    rendered = render_label_svg(
        label,
        template_code,
        scan_url,
        request.user,
        serializer.validated_data.get("label_print_config"),
    )
    response = HttpResponse(rendered["content"], content_type="image/svg+xml; charset=utf-8")
    response["Content-Disposition"] = f'inline; filename="{label.label_code}-preview.svg"'
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def label_scan_view(request, label_code: str):
    payload, response_status = resolve_scan(
        label_code,
        request.user,
        request.query_params.get("source", ""),
        request,
    )
    return Response(payload, status=response_status)


def _managed_label(user, label_id: int) -> EntityLabel:
    label = (
        EntityLabel.objects.select_related("entity", "schema", "schema__owner")
        .filter(pk=label_id)
        .first()
    )
    if label is None:
        raise NotFound("标签不存在")
    ensure_can_manage_labels(user, label.schema)
    return label


def _schema_labels_by_id(schema: DataSchema, label_ids: list[int]) -> dict[int, EntityLabel]:
    labels = EntityLabel.objects.select_related("entity", "schema", "schema__owner").filter(
        pk__in=label_ids,
        schema=schema,
    )
    return {label.id: label for label in labels}
