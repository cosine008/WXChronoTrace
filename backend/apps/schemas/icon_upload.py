from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from .permissions import can_create_schema

ICON_MAX_LENGTH = 2048
SCHEMA_ICON_URL_PREFIX = "/api/v1/schema-icons/"

_MAX_ICON_SIZE = 1024 * 1024
_ALLOWED_EXTENSIONS = {"gif", "jpeg", "jpg", "png", "webp"}
_CONTENT_TYPES = {
    "gif": "image/gif",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


def upload_schema_icon(user, file_obj) -> dict[str, object]:
    if not can_create_schema(user):
        raise PermissionDenied("当前用户不能上传数据表图标")
    _validate_icon_file(file_obj)

    original_name = Path(file_obj.name).name
    extension = Path(original_name).suffix.lower().lstrip(".")
    storage_path = f"schema_icons/{uuid4().hex}.{extension}"
    saved_path = default_storage.save(storage_path, file_obj)
    filename = Path(saved_path).name
    return {
        "url": f"{SCHEMA_ICON_URL_PREFIX}{filename}",
        "name": original_name,
        "content_type": _CONTENT_TYPES[extension],
        "size": getattr(file_obj, "size", 0) or 0,
    }


def open_schema_icon(filename: str) -> FileResponse:
    if not _is_storage_filename(filename):
        raise NotFound("schema icon not found")

    extension = Path(filename).suffix.lower().lstrip(".")
    storage_path = f"schema_icons/{filename}"
    if not default_storage.exists(storage_path):
        raise NotFound("schema icon not found")

    return FileResponse(
        default_storage.open(storage_path, "rb"),
        content_type=_CONTENT_TYPES.get(extension, "application/octet-stream"),
    )


def _validate_icon_file(file_obj) -> None:
    if file_obj is None:
        raise ValidationError({"file": "file is required"})

    size = getattr(file_obj, "size", 0) or 0
    if size <= 0:
        raise ValidationError({"file": "file is empty"})
    if size > _MAX_ICON_SIZE:
        raise ValidationError({"file": "schema icon must be 1MB or smaller"})

    extension = Path(file_obj.name).suffix.lower().lstrip(".")
    if extension not in _ALLOWED_EXTENSIONS:
        raise ValidationError({"file": "schema icon only accepts png, jpg, jpeg, gif or webp"})

    content_type = getattr(file_obj, "content_type", "") or ""
    if content_type != _CONTENT_TYPES[extension]:
        raise ValidationError({"file": "schema icon content type does not match file extension"})

    header = file_obj.read(16)
    file_obj.seek(0)
    if not _matches_image_signature(extension, header):
        raise ValidationError({"file": "schema icon file content is not a supported image"})


def _matches_image_signature(extension: str, header: bytes) -> bool:
    if extension == "png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in {"jpg", "jpeg"}:
        return header.startswith(b"\xff\xd8\xff")
    if extension == "gif":
        return header.startswith((b"GIF87a", b"GIF89a"))
    if extension == "webp":
        return header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    return False


def _is_storage_filename(filename: str) -> bool:
    path = Path(filename)
    return (
        path.name == filename
        and path.suffix.lower().lstrip(".") in _ALLOWED_EXTENSIONS
        and all(char.isalnum() or char in {"-", "_", "."} for char in filename)
    )
