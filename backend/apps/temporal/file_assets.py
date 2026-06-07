from __future__ import annotations

from pathlib import Path
from typing import Any

from django.http import HttpResponse
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.schemas.field_security import can_view_field_value
from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_edit_data, can_view_schema

from .docx_preview import DOCX_PREVIEW_RESPONSE_MAX_CHARS, is_docx_asset, update_docx_extraction
from .models import FieldFileAsset

IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "svg"}


def upload_field_file(schema_id: int, field_key: str, user: Any, file_obj) -> dict[str, Any]:
    schema = _visible_schema(user, schema_id)
    if not can_edit_data(user, schema):
        raise PermissionDenied("no data edit permission")
    field = _file_field(schema, field_key)
    if not can_view_field_value(user, schema, field):
        raise PermissionDenied("no field permission")
    _validate_upload(field, file_obj)
    asset = FieldFileAsset.objects.create(
        schema=schema,
        field_key=field_key,
        file=file_obj,
        original_name=Path(file_obj.name).name,
        content_type=getattr(file_obj, "content_type", "") or "",
        size=getattr(file_obj, "size", 0) or 0,
        uploaded_by=user,
    )
    if is_docx_asset(asset):
        update_docx_extraction(asset)
    return serialize_file_asset(asset)


def download_field_file(asset_id: int, user: Any) -> HttpResponse:
    asset = _authorized_asset(asset_id, user)
    if not asset.file:
        raise NotFound("file content not found")
    with asset.file.open("rb") as file_obj:
        response = HttpResponse(file_obj.read(), content_type=asset.content_type or "application/octet-stream")
    response["Content-Disposition"] = f'attachment; filename="{asset.original_name}"'
    return response


def preview_field_file(asset_id: int, user: Any) -> dict[str, Any]:
    asset = _authorized_asset(asset_id, user)
    if not is_docx_asset(asset):
        return _preview_payload(asset, preview_type="none", text="", truncated=False)

    status = asset.extraction_status
    text = asset.extracted_text if status == FieldFileAsset.ExtractionStatus.READY else ""
    text, response_truncated = _truncate_preview_text(text)
    return _preview_payload(
        asset,
        preview_type="text",
        text=text,
        truncated=asset.extraction_truncated or response_truncated,
    )


def serialize_file_asset(asset: FieldFileAsset) -> dict[str, Any]:
    download_url = f"/api/v1/files/{asset.id}/download"
    payload = {
        "id": asset.id,
        "schema_id": asset.schema_id,
        "field_key": asset.field_key,
        "name": asset.original_name,
        "content_type": asset.content_type,
        "size": asset.size,
        "download_url": download_url,
        "preview_url": None,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "uploaded_by_id": asset.uploaded_by_id,
    }
    if _is_image_asset(asset):
        payload["preview_url"] = download_url
    return payload


def _authorized_asset(asset_id: int, user: Any) -> FieldFileAsset:
    asset = FieldFileAsset.objects.select_related("schema").filter(pk=asset_id).first()
    if asset is None or not can_view_schema(user, asset.schema):
        raise NotFound("file asset not found")
    field = _file_field(asset.schema, asset.field_key)
    if not can_view_field_value(user, asset.schema, field):
        raise PermissionDenied("no field permission")
    return asset


def _preview_payload(
    asset: FieldFileAsset,
    *,
    preview_type: str,
    text: str,
    truncated: bool,
) -> dict[str, Any]:
    return {
        "asset_id": asset.id,
        "filename": asset.original_name,
        "content_type": asset.content_type,
        "preview_type": preview_type,
        "status": asset.extraction_status,
        "text": text,
        "truncated": truncated,
        "extracted_at": asset.extracted_at.isoformat() if asset.extracted_at else None,
        "download_url": f"/api/v1/files/{asset.id}/download",
    }


def _truncate_preview_text(text: str) -> tuple[str, bool]:
    if len(text) <= DOCX_PREVIEW_RESPONSE_MAX_CHARS:
        return text, False
    return text[:DOCX_PREVIEW_RESPONSE_MAX_CHARS], True


def _visible_schema(user: Any, schema_id: int) -> DataSchema:
    schema = DataSchema.objects.for_user(user).filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("schema not found")
    return schema


def _file_field(schema: DataSchema, field_key: str) -> dict[str, Any]:
    for field in schema.fields_config:
        if field.get("key") == field_key and not field.get("deprecated", False):
            if field.get("type") not in {"attachment", "image"}:
                raise ValidationError({"field_key": "field is not attachment or image"})
            return field
    raise NotFound("field not found")


def _validate_upload(field: dict[str, Any], file_obj) -> None:
    if file_obj is None:
        raise ValidationError({"file": "file is required"})
    validators = field.get("validators") if isinstance(field.get("validators"), dict) else {}
    extension = Path(file_obj.name).suffix.lower().lstrip(".")
    allowed = validators.get("allowed_extensions")
    if field.get("type") == "image":
        allowed = allowed or sorted(IMAGE_EXTENSIONS)
        content_type = getattr(file_obj, "content_type", "") or ""
        if not content_type.startswith("image/"):
            raise ValidationError({"file": "image field only accepts image files"})
    if allowed and extension not in allowed:
        raise ValidationError({"file": "file extension is not allowed"})
    max_file_size = validators.get("max_file_size")
    if isinstance(max_file_size, int) and getattr(file_obj, "size", 0) > max_file_size:
        raise ValidationError({"file": "file is larger than max_file_size"})


def _is_image_asset(asset: FieldFileAsset) -> bool:
    extension = Path(asset.original_name).suffix.lower().lstrip(".")
    return asset.content_type.startswith("image/") or extension in IMAGE_EXTENSIONS
