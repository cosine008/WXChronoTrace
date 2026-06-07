from __future__ import annotations

from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import record_audit_log
from apps.changesets.api import get_changeset_payload
from apps.changesets.entry_editor import upsert_draft_entry
from apps.changesets.models import ChangeSet
from apps.schemas.serializers import DataSchemaCreateSerializer, DataSchemaSerializer
from apps.schemas.services import create_schema_version

from .normalize import build_preview


def commit_intake(filename: str, content: bytes, user: Any, payload: dict, request=None) -> dict:
    preview = build_preview(filename, content, payload)
    invalid_rows = [row for row in preview["rows"] if row["action"] == "invalid"]
    if invalid_rows:
        raise ValidationError({"rows": invalid_rows})
    serializer = DataSchemaCreateSerializer(data=preview["schema_draft"])
    serializer.is_valid(raise_exception=True)

    with transaction.atomic():
        schema = serializer.save(owner=user, created_by=user)
        create_schema_version(schema, user, "Excel 接入初始版本")
        _audit(request, user, "schema.create", "schema", schema.id, {"schema_code": schema.schema_code})
        change_set = ChangeSet.objects.create(
            schema=schema,
            summary=_summary_text(payload),
            status=ChangeSet.Status.DRAFT,
            approval_required=schema.approval_required,
            created_by=user,
            source=ChangeSet.Source.EXCEL,
        )
        for row in preview["rows"]:
            upsert_draft_entry(change_set, user, _entry_payload(row))
        _audit(
            request,
            user,
            "data.import",
            "changeset",
            change_set.id,
            {"schema_id": schema.id, "row_count": len(preview["rows"]), "source": "excel_intake"},
        )

    return {
        "schema": DataSchemaSerializer(schema, context=_serializer_context(request)).data,
        "change_set": get_changeset_payload(schema, change_set.id),
        "import_summary": preview["summary"],
        "rows": preview["rows"],
    }


def _entry_payload(row: dict) -> dict[str, Any]:
    return {
        "action": "create",
        "valid_from": row["valid_from"],
        "data_after": row["data_after"],
    }


def _summary_text(payload: dict) -> str:
    value = payload.get("summary", "Excel 接入草稿")
    if not isinstance(value, str) or not value.strip():
        raise ValidationError({"summary": "必填"})
    return value.strip()[:200]


def _audit(request, user, action: str, target_type: str, target_id: int, detail: dict) -> None:
    record_audit_log(
        actor=user,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        ip_address=request.META.get("REMOTE_ADDR") if request is not None else None,
    )


def _serializer_context(request) -> dict:
    return {"request": request} if request is not None else {}
