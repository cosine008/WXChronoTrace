from __future__ import annotations

from pathlib import Path

from rest_framework.exceptions import ValidationError

from .constants import (
    ALLOWED_MATERIAL_EXTENSIONS,
    IMAGE_MATERIAL_EXTENSIONS,
    MAX_MATERIAL_FILE_SIZE_BYTES,
)
from .models import WorkbenchMaterialDetail


def validate_material_file(file_obj) -> str:
    if file_obj is None:
        raise ValidationError({"file": "file is required"})

    original_name = getattr(file_obj, "name", "") or ""
    if not original_name:
        raise ValidationError({"file": "file name is required"})

    extension = Path(original_name).suffix.lower().lstrip(".")
    if extension not in ALLOWED_MATERIAL_EXTENSIONS:
        raise ValidationError({"file": "file extension is not allowed"})

    if getattr(file_obj, "size", 0) > MAX_MATERIAL_FILE_SIZE_BYTES:
        raise ValidationError({"file": "file is larger than max material file size"})

    return extension


def preview_status_for(extension: str, content_type: str) -> str:
    normalized_content_type = (content_type or "").lower()
    if extension in IMAGE_MATERIAL_EXTENSIONS or normalized_content_type.startswith("image/"):
        return WorkbenchMaterialDetail.PreviewStatus.IMAGE
    return WorkbenchMaterialDetail.PreviewStatus.NONE
