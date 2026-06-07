from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from django.utils import timezone
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from .models import FieldFileAsset

DOCX_PREVIEW_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
DOCX_EXTRACTED_TEXT_MAX_CHARS = 50_000
DOCX_PREVIEW_RESPONSE_MAX_CHARS = 20_000
DOCX_INVALID_ERROR = "invalid docx package"
DOCX_SIZE_LIMIT_ERROR = "docx preview size limit exceeded"

_DOCX_REQUIRED_PARTS = {"[Content_Types].xml", "word/document.xml"}


@dataclass(frozen=True)
class DocxExtractionResult:
    status: str
    text: str = ""
    error: str = ""
    truncated: bool = False


class InvalidDocxPackageError(ValueError):
    pass


def is_docx_asset(asset: FieldFileAsset) -> bool:
    return Path(asset.original_name).suffix.lower() == ".docx"


def update_docx_extraction(asset: FieldFileAsset) -> None:
    result = extract_docx_text(asset)
    asset.extraction_status = result.status
    asset.extracted_text = result.text
    asset.extraction_error = result.error
    asset.extraction_truncated = result.truncated
    asset.extracted_at = timezone.now()
    asset.save(
        update_fields=[
            "extraction_status",
            "extracted_text",
            "extraction_error",
            "extraction_truncated",
            "extracted_at",
        ]
    )


def extract_docx_text(asset: FieldFileAsset) -> DocxExtractionResult:
    if not is_docx_asset(asset):
        return DocxExtractionResult(status=FieldFileAsset.ExtractionStatus.UNSUPPORTED)
    if asset.size > DOCX_PREVIEW_MAX_FILE_SIZE_BYTES:
        return DocxExtractionResult(
            status=FieldFileAsset.ExtractionStatus.UNSUPPORTED,
            error=DOCX_SIZE_LIMIT_ERROR,
        )
    if not asset.file:
        return DocxExtractionResult(
            status=FieldFileAsset.ExtractionStatus.FAILED,
            error="file content not found",
        )

    try:
        content = _read_asset(asset)
        _validate_docx_package(content)
        text = _extract_text(content)
    except (BadZipFile, InvalidDocxPackageError, KeyError, ValueError):
        return DocxExtractionResult(
            status=FieldFileAsset.ExtractionStatus.FAILED,
            error=DOCX_INVALID_ERROR,
        )

    text, truncated = _truncate_text(text)
    return DocxExtractionResult(
        status=FieldFileAsset.ExtractionStatus.READY,
        text=text,
        truncated=truncated,
    )


def _read_asset(asset: FieldFileAsset) -> bytes:
    with asset.file.open("rb") as file_obj:
        return file_obj.read()


def _validate_docx_package(content: bytes) -> None:
    if not content.startswith(b"PK"):
        raise InvalidDocxPackageError
    with ZipFile(BytesIO(content)) as archive:
        names = set(archive.namelist())
    if not _DOCX_REQUIRED_PARTS <= names:
        raise InvalidDocxPackageError


def _extract_text(content: bytes) -> str:
    document = Document(BytesIO(content))
    blocks = []
    for block in document.iter_inner_content():
        if isinstance(block, Paragraph):
            text = _normalize_text(block.text)
            if text:
                blocks.append(text)
        elif isinstance(block, Table):
            blocks.extend(_table_rows(block))
    return "\n".join(blocks)


def _table_rows(table: Table) -> list[str]:
    rows = []
    for row in table.rows:
        cells = [_normalize_text(cell.text) for cell in row.cells]
        line = "\t".join(cell for cell in cells if cell)
        if line:
            rows.append(line)
    return rows


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def _truncate_text(value: str) -> tuple[str, bool]:
    if len(value) <= DOCX_EXTRACTED_TEXT_MAX_CHARS:
        return value, False
    return value[:DOCX_EXTRACTED_TEXT_MAX_CHARS], True
