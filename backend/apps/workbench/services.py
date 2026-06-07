from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit.services import record_audit_log
from apps.schemas.models import DataSchema

from .materials import preview_status_for, validate_material_file
from .models import (
    WorkbenchDataCardDetail,
    WorkbenchDataCardField,
    WorkbenchItem,
    WorkbenchLink,
    WorkbenchMaterialChecklistItem,
    WorkbenchMaterialDetail,
    WorkbenchNoteDetail,
    WorkbenchUserSetting,
)
from .selectors import owned_item

logger = logging.getLogger(__name__)


def soft_delete_item(user, item_id: int, request=None) -> WorkbenchItem:
    item = owned_item(user, item_id)
    if item is None:
        raise NotFound("item does not exist")

    now = timezone.now()
    with transaction.atomic():
        item.deleted_at = now
        item.updated_at = now
        item.save(update_fields=["deleted_at", "updated_at"])
        if item.type == WorkbenchItem.Type.MATERIAL:
            WorkbenchMaterialChecklistItem.objects.filter(linked_material_id=item.id).update(
                linked_material=None,
                updated_at=now,
            )
        _audit(
            user,
            action="workbench.item.delete",
            target_type="workbench_item",
            target_id=item.id,
            detail={"is_sensitive": item.is_sensitive},
            request=request,
        )
    return item


def restore_item(user, item_id: int, request=None) -> WorkbenchItem:
    item = owned_item(user, item_id, include_deleted=True)
    if item is None or item.deleted_at is None:
        raise NotFound("deleted item does not exist")

    item.deleted_at = None
    item.updated_at = timezone.now()
    item.save(update_fields=["deleted_at", "updated_at"])
    _audit(
        user,
        action="workbench.item.restore",
        target_type="workbench_item",
        target_id=item.id,
        detail={"is_sensitive": item.is_sensitive},
        request=request,
    )
    return item


def purge_item(user, item_id: int, request=None) -> None:
    item = owned_item(user, item_id, include_deleted=True)
    if item is None or item.deleted_at is None:
        raise NotFound("deleted item does not exist")

    file_name = ""
    file_storage = None
    if item.type == WorkbenchItem.Type.MATERIAL:
        material_detail = WorkbenchMaterialDetail.objects.filter(item_id=item.id).first()
        if material_detail is not None and material_detail.file:
            file_name = material_detail.file.name or ""
            file_storage = material_detail.file.storage

    with transaction.atomic():
        _audit(
            user,
            action="workbench.item.purge",
            target_type="workbench_item",
            target_id=item.id,
            detail={"is_sensitive": item.is_sensitive},
            request=request,
        )
        item.delete()
    if file_name and file_storage is not None:
        file_storage.delete(file_name)


_DATA_CARD_DETAIL_FIELDS = (
    "category",
    "applicable_year",
    "applicable_region",
    "applicable_subject",
    "effective_from",
    "effective_to",
    "status",
    "remark",
)
_DATA_CARD_ITEM_FIELDS = (
    "title",
    "summary",
    "tags",
    "is_pinned",
    "is_sensitive",
)
_NOTE_ITEM_FIELDS = (
    "title",
    "summary",
    "tags",
    "is_pinned",
    "is_sensitive",
)
_MATERIAL_ITEM_FIELDS = (
    "title",
    "summary",
    "tags",
    "is_pinned",
    "is_sensitive",
)
_NOTE_DETAIL_FIELDS = (
    "markdown_content",
    "stage",
    "status",
)


def create_data_card(user, payload: dict[str, Any], request=None) -> WorkbenchItem:
    with transaction.atomic():
        item = WorkbenchItem.objects.create(
            owner=user,
            type=WorkbenchItem.Type.DATA_CARD,
            title=payload["title"],
            summary=payload.get("summary", ""),
            tags=payload.get("tags", []),
            is_pinned=payload.get("is_pinned", False),
            is_sensitive=payload.get("is_sensitive", False),
        )
        detail = WorkbenchDataCardDetail.objects.create(
            item=item,
            category=payload.get("category", WorkbenchDataCardDetail.Category.OTHER),
            applicable_year=payload.get("applicable_year"),
            applicable_region=payload.get("applicable_region", ""),
            applicable_subject=payload.get("applicable_subject", ""),
            effective_from=payload.get("effective_from"),
            effective_to=payload.get("effective_to"),
            status=payload.get("status", WorkbenchDataCardDetail.Status.DRAFT),
            remark=payload.get("remark", ""),
        )
        _rebuild_data_card_fields(detail, payload.get("fields", []))
        _audit(
            user,
            action="workbench.item.create",
            target_type="workbench_item",
            target_id=item.id,
            detail={"type": WorkbenchItem.Type.DATA_CARD, "is_sensitive": item.is_sensitive},
            request=request,
        )
    return item


def update_data_card(user, item_id: int, payload: dict[str, Any], request=None) -> WorkbenchItem:
    item = _owned_data_card_item(user, item_id)
    detail = _owned_data_card_detail(item)
    was_sensitive = item.is_sensitive

    with transaction.atomic():
        item_update_fields: list[str] = []
        for field in _DATA_CARD_ITEM_FIELDS:
            if field in payload:
                setattr(item, field, payload[field])
                item_update_fields.append(field)
        if item_update_fields:
            item_update_fields.append("updated_at")
            item.save(update_fields=item_update_fields)

        detail_update_fields: list[str] = []
        for field in _DATA_CARD_DETAIL_FIELDS:
            if field in payload:
                setattr(detail, field, payload[field])
                detail_update_fields.append(field)
        if detail_update_fields:
            detail.save(update_fields=detail_update_fields)

        fields_updated = "fields" in payload
        if fields_updated:
            detail.fields.all().delete()
            _rebuild_data_card_fields(detail, payload["fields"])

        if detail_update_fields or fields_updated:
            if "updated_at" not in item_update_fields:
                item.updated_at = timezone.now()
                item.save(update_fields=["updated_at"])

        _audit(
            user,
            action="workbench.item.update",
            target_type="workbench_item",
            target_id=item.id,
            detail={"type": WorkbenchItem.Type.DATA_CARD, "is_sensitive": was_sensitive or item.is_sensitive},
            request=request,
        )

    return item


def create_note(user, payload: dict[str, Any], request=None) -> WorkbenchItem:
    with transaction.atomic():
        item = WorkbenchItem.objects.create(
            owner=user,
            type=WorkbenchItem.Type.NOTE,
            title=payload["title"],
            summary=payload.get("summary", ""),
            tags=payload.get("tags", []),
            is_pinned=payload.get("is_pinned", False),
            is_sensitive=payload.get("is_sensitive", False),
        )
        WorkbenchNoteDetail.objects.create(
            item=item,
            markdown_content=payload.get("markdown_content", ""),
            stage=payload.get("stage", WorkbenchNoteDetail.Stage.OTHER),
            status=payload.get("status", WorkbenchNoteDetail.Status.NORMAL),
        )
        _audit(
            user,
            action="workbench.item.create",
            target_type="workbench_item",
            target_id=item.id,
            detail={"type": WorkbenchItem.Type.NOTE, "is_sensitive": item.is_sensitive},
            request=request,
        )
    return item


def update_note(user, item_id: int, payload: dict[str, Any], request=None) -> WorkbenchItem:
    item = _owned_note_item(user, item_id)
    detail = _owned_note_detail(item)
    was_sensitive = item.is_sensitive

    with transaction.atomic():
        item_update_fields: list[str] = []
        for field in _NOTE_ITEM_FIELDS:
            if field in payload:
                setattr(item, field, payload[field])
                item_update_fields.append(field)
        if item_update_fields:
            item_update_fields.append("updated_at")
            item.save(update_fields=item_update_fields)

        detail_update_fields: list[str] = []
        for field in _NOTE_DETAIL_FIELDS:
            if field in payload:
                setattr(detail, field, payload[field])
                detail_update_fields.append(field)
        if detail_update_fields:
            detail.save(update_fields=detail_update_fields)
            if "updated_at" not in item_update_fields:
                item.updated_at = timezone.now()
                item.save(update_fields=["updated_at"])

        _audit(
            user,
            action="workbench.item.update",
            target_type="workbench_item",
            target_id=item.id,
            detail={"type": WorkbenchItem.Type.NOTE, "is_sensitive": was_sensitive or item.is_sensitive},
            request=request,
        )
    return item


def upload_material(user, payload: dict[str, Any], request=None) -> WorkbenchItem:
    file_obj = payload.get("file")
    extension = validate_material_file(file_obj)
    content_type = getattr(file_obj, "content_type", "") or ""
    size = int(getattr(file_obj, "size", 0) or 0)

    original_name = Path(getattr(file_obj, "name", "") or "").name
    title = payload.get("title") or original_name
    saved_file_name = ""
    saved_file_storage = None

    try:
        with transaction.atomic():
            setting, _ = WorkbenchUserSetting.objects.select_for_update().get_or_create(owner=user)

            if setting.upload_disabled:
                raise DRFValidationError({"file": "material upload is disabled"})

            used_size = (
                WorkbenchMaterialDetail.objects.filter(
                    item__owner=user,
                    item__deleted_at__isnull=True,
                ).aggregate(total=Coalesce(Sum("size"), 0))["total"]
                or 0
            )
            if used_size + size > setting.material_quota_bytes:
                raise DRFValidationError({"file": "material quota exceeded"})

            item = WorkbenchItem.objects.create(
                owner=user,
                type=WorkbenchItem.Type.MATERIAL,
                title=title,
                summary=payload.get("summary", ""),
                tags=payload.get("tags", []),
                is_pinned=payload.get("is_pinned", False),
                is_sensitive=payload.get("is_sensitive", False),
            )
            detail = WorkbenchMaterialDetail.objects.create(
                item=item,
                original_name=original_name,
                content_type=content_type,
                size=size,
                description=payload.get("description", ""),
                preview_status=preview_status_for(extension, content_type),
            )

            file_storage = detail.file.storage
            generated_name = detail.file.field.generate_filename(detail, original_name)
            saved_file_name = file_storage.save(generated_name, file_obj)
            saved_file_storage = file_storage
            detail.file.name = saved_file_name
            detail.save(update_fields=["file"])

            _audit(
                user,
                action="workbench.material.upload",
                target_type="workbench_item",
                target_id=item.id,
                detail={
                    "is_sensitive": item.is_sensitive,
                    "size": size,
                    "content_type": content_type,
                },
                request=request,
            )
        return item
    except Exception:
        if saved_file_name and saved_file_storage is not None:
            try:
                saved_file_storage.delete(saved_file_name)
            except Exception as cleanup_exc:
                logger.warning(
                    "failed to cleanup rolled-back material file %s: %s",
                    saved_file_name,
                    cleanup_exc,
                )
        raise


def update_material(user, item_id: int, payload: dict[str, Any], request=None) -> WorkbenchItem:
    item = _owned_material_item(user, item_id)
    detail = _owned_material_detail(item)
    was_sensitive = item.is_sensitive

    with transaction.atomic():
        item_update_fields: list[str] = []
        for field in _MATERIAL_ITEM_FIELDS:
            if field in payload:
                setattr(item, field, payload[field])
                item_update_fields.append(field)
        if item_update_fields:
            item_update_fields.append("updated_at")
            item.save(update_fields=item_update_fields)

        detail_updated = False
        if "description" in payload:
            detail.description = payload["description"]
            detail.save(update_fields=["description"])
            detail_updated = True

        if detail_updated and "updated_at" not in item_update_fields:
            item.updated_at = timezone.now()
            item.save(update_fields=["updated_at"])

        _audit(
            user,
            action="workbench.item.update",
            target_type="workbench_item",
            target_id=item.id,
            detail={"type": WorkbenchItem.Type.MATERIAL, "is_sensitive": was_sensitive or item.is_sensitive},
            request=request,
        )

    return item


def download_material(user, item_id: int, request=None) -> HttpResponse:
    item = _owned_material_item(user, item_id)
    detail = _owned_material_detail(item)
    if not detail.file:
        raise NotFound("material file does not exist")

    try:
        with detail.file.open("rb") as file_obj:
            file_bytes = file_obj.read()
    except FileNotFoundError as exc:
        raise NotFound("material file does not exist") from exc

    response = HttpResponse(file_bytes, content_type=detail.content_type or "application/octet-stream")
    response["Content-Disposition"] = f'attachment; filename="{_safe_download_filename(detail.original_name)}"'
    _audit(
        user,
        action="workbench.material.download",
        target_type="workbench_item",
        target_id=item.id,
        detail={
            "is_sensitive": item.is_sensitive,
            "size": detail.size,
            "content_type": detail.content_type,
        },
        request=request,
    )
    return response


def quick_capture_note(user, payload: dict[str, Any], request=None) -> tuple[WorkbenchItem, str | None]:
    content = payload.get("markdown_content")
    if content is None:
        content = payload.get("content", "")
    title = _quick_capture_title(content)

    item = create_note(
        user,
        {
            "title": title,
            "markdown_content": content,
            "stage": WorkbenchNoteDetail.Stage.OTHER,
            "status": WorkbenchNoteDetail.Status.NORMAL,
            "tags": [],
        },
        request=request,
    )

    warning = None
    target_schema_id = payload.get("target_schema_id")
    if target_schema_id is not None:
        try:
            create_link(
                user,
                source_item_id=item.id,
                target_schema_id=target_schema_id,
                request=request,
            )
        except (NotFound, DRFValidationError, APIException, DjangoValidationError, IntegrityError) as exc:
            warning = f"create link failed: {_api_exception_message(exc)}"
    return item, warning


def copy_data_card_text(user, item_id: int) -> str:
    item = _owned_data_card_item(user, item_id)
    detail = _owned_data_card_detail(item)

    lines = [item.title]
    for field in detail.fields.order_by("sort_order", "id"):
        line = f"{field.name}：{field.value}"
        if field.value and field.unit:
            line = f"{line} {field.unit}"
        lines.append(line)
    return "\n".join(lines)


def create_link(
    user,
    *,
    source_item_id: int,
    target_item_id: int | None = None,
    target_schema_id: int | None = None,
    request=None,
) -> tuple[WorkbenchLink, bool]:
    source_item = owned_item(user, source_item_id)
    if source_item is None:
        raise NotFound("source item does not exist")

    has_target_item = target_item_id is not None
    has_target_schema = target_schema_id is not None
    if has_target_item == has_target_schema:
        raise DRFValidationError("target_item_id and target_schema_id must provide exactly one")

    kwargs: dict[str, Any] = {"owner": user, "source_item": source_item}
    if has_target_item:
        target_item = owned_item(user, target_item_id)
        if target_item is None:
            raise NotFound("target item does not exist")
        kwargs["target_item"] = target_item
    else:
        target_schema = DataSchema.objects.for_user(user).filter(pk=target_schema_id).first()
        if target_schema is None:
            raise NotFound("target schema does not exist")
        kwargs["target_schema"] = target_schema

    with transaction.atomic():
        link, created = WorkbenchLink.objects.get_or_create(**kwargs)
        if created:
            _audit(
                user,
                action="workbench.link.create",
                target_type="workbench_link",
                target_id=link.id,
                detail={
                    "source_item_id": source_item.id,
                    "target_item_id": link.target_item_id,
                    "target_schema_id": link.target_schema_id,
                    "is_sensitive": source_item.is_sensitive,
                },
                request=request,
            )
    return link, created


def delete_link(user, link_id: int, request=None) -> None:
    link = WorkbenchLink.objects.filter(owner=user, pk=link_id).first()
    if link is None:
        raise NotFound("link does not exist")

    _audit(
        user,
        action="workbench.link.delete",
        target_type="workbench_link",
        target_id=link.id,
        detail={
            "source_item_id": link.source_item_id,
            "target_item_id": link.target_item_id,
            "target_schema_id": link.target_schema_id,
            "is_sensitive": link.source_item.is_sensitive,
        },
        request=request,
    )
    link.delete()


def _owned_data_card_item(user, item_id: int) -> WorkbenchItem:
    item = owned_item(user, item_id)
    if item is None or item.type != WorkbenchItem.Type.DATA_CARD:
        raise NotFound("data card does not exist")
    return item


def _owned_data_card_detail(item: WorkbenchItem) -> WorkbenchDataCardDetail:
    try:
        return item.data_card_detail
    except ObjectDoesNotExist as exc:
        raise NotFound("data card does not exist") from exc


def _owned_note_item(user, item_id: int) -> WorkbenchItem:
    item = owned_item(user, item_id)
    if item is None or item.type != WorkbenchItem.Type.NOTE:
        raise NotFound("note does not exist")
    return item


def _owned_note_detail(item: WorkbenchItem) -> WorkbenchNoteDetail:
    try:
        return item.note_detail
    except ObjectDoesNotExist as exc:
        raise NotFound("note does not exist") from exc


def _owned_material_item(user, item_id: int) -> WorkbenchItem:
    item = owned_item(user, item_id)
    if item is None or item.type != WorkbenchItem.Type.MATERIAL:
        raise NotFound("material does not exist")
    return item


def _owned_material_detail(item: WorkbenchItem) -> WorkbenchMaterialDetail:
    try:
        return item.material_detail
    except ObjectDoesNotExist as exc:
        raise NotFound("material does not exist") from exc


def _rebuild_data_card_fields(card: WorkbenchDataCardDetail, fields_payload: list[dict[str, Any]]) -> None:
    ordered_fields: list[dict[str, Any]] = []
    for index, field_payload in enumerate(fields_payload):
        sort_order = field_payload.get("sort_order")
        if sort_order is None:
            sort_order = index
        ordered_fields.append(
            {
                "name": field_payload["name"],
                "value": field_payload.get("value", ""),
                "value_type": field_payload.get("value_type", WorkbenchDataCardField.ValueType.TEXT),
                "unit": field_payload.get("unit", ""),
                "remark": field_payload.get("remark", ""),
                "sort_order": sort_order,
                "_index": index,
            }
        )
    ordered_fields.sort(key=lambda field: (field["sort_order"], field["_index"]))
    for field in ordered_fields:
        field.pop("_index", None)
        WorkbenchDataCardField.objects.create(card=card, **field)


def _audit(
    user,
    *,
    action: str,
    target_type: str,
    target_id: int | None,
    detail: dict[str, Any] | None = None,
    request=None,
) -> None:
    record_audit_log(
        actor=user,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail or {},
        ip_address=_ip(request),
    )


def _quick_capture_title(content: str) -> str:
    for line in content.splitlines():
        normalized = line.strip()
        if normalized:
            return normalized[:30]
    return "未命名笔记"


def _api_exception_message(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    if detail is None:
        return str(exc)
    return str(detail)


def _ip(request) -> str | None:
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def _safe_download_filename(filename: str) -> str:
    safe = filename.replace("\\", "_").replace('"', "_").replace("\r", "_").replace("\n", "_").strip()
    return safe or "material.bin"
