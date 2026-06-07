from __future__ import annotations

from collections import Counter
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.schemas.models import DataSchema, TableCollaborator

from .api import (
    _action_counts_by_changeset,
    _serialize_changeset_summary,
    _serialize_entry,
    get_changeset_payload,
)
from .entry_editor import delete_draft_entry_record, upsert_draft_entry
from .exceptions import ChangeSetInvalidState
from .models import ChangeSet
from .services import apply_changeset, approve_changeset, reject_changeset, revert_changeset
from .services import submit_changeset as mark_submitted


def create_draft_changeset(schema: DataSchema, user: Any, payload: dict) -> dict[str, Any]:
    summary = _summary(payload, default="批量变更草稿")
    draft = ChangeSet.objects.create(
        schema=schema,
        summary=summary,
        status=ChangeSet.Status.DRAFT,
        approval_required=schema.approval_required,
        created_by=user,
        source=ChangeSet.Source.MANUAL,
    )
    return get_changeset_payload(schema, draft.id, user)


def update_draft_changeset(change_set: ChangeSet, user: Any, payload: dict) -> dict[str, Any]:
    with transaction.atomic():
        draft = _lock_owned_draft(change_set, user)
        update_fields = []
        if "summary" in payload:
            draft.summary = _summary(payload, default=draft.summary)
            update_fields.append("summary")
        if "approver_id" in payload:
            draft.approver = _resolve_approver(draft, payload.get("approver_id"))
            update_fields.append("approver")
        if update_fields:
            draft.save(update_fields=update_fields)
    return get_changeset_payload(change_set.schema, change_set.id, user)


def add_draft_entry(change_set: ChangeSet, user: Any, payload: dict) -> dict[str, Any]:
    with transaction.atomic():
        draft = _lock_owned_draft(change_set, user)
        entry = upsert_draft_entry(draft, user, payload)
        return _serialize_entry(entry, draft.schema, user)


def delete_draft_entry(change_set: ChangeSet, user: Any, entry_id: int) -> None:
    with transaction.atomic():
        draft = _lock_owned_draft(change_set, user)
        delete_draft_entry_record(draft, entry_id)


def delete_draft_changeset(change_set: ChangeSet, user: Any) -> None:
    with transaction.atomic():
        draft = _lock_owned_draft(change_set, user)
        entry_ids = list(draft.entries.order_by("id").values_list("id", flat=True))
        for entry_id in entry_ids:
            delete_draft_entry_record(draft, entry_id)
        draft.delete()


def submit_draft_changeset(change_set: ChangeSet, user: Any, payload: dict) -> dict[str, Any]:
    with transaction.atomic():
        draft = _lock_owned_draft(change_set, user)
        if not draft.entries.exists():
            raise ValidationError({"entries": "至少需要 1 条变更明细"})
        if "summary" in payload:
            draft.summary = _summary(payload, default=draft.summary)
        draft.approval_required = draft.schema.approval_required
        if draft.approval_required:
            draft.approver = _resolve_approver(draft, payload.get("approver_id"))
        else:
            draft.approver = None
        draft.save(update_fields=["summary", "approval_required", "approver"])

        try:
            if draft.approval_required:
                result = mark_submitted(draft, user)
            else:
                result = apply_changeset(draft, user)
        except ChangeSetInvalidState as exc:
            raise ValidationError({"status": str(exc)}) from exc

    return get_changeset_payload(change_set.schema, result.id, user)


def approve_pending_changeset(change_set: ChangeSet, user: Any) -> dict[str, Any]:
    _ensure_assigned_approver(change_set, user)
    try:
        approved = approve_changeset(change_set, user)
    except ChangeSetInvalidState as exc:
        raise ValidationError({"status": str(exc)}) from exc
    return get_changeset_payload(change_set.schema, approved.id, user)


def reject_pending_changeset(change_set: ChangeSet, user: Any, payload: dict) -> dict[str, Any]:
    _ensure_assigned_approver(change_set, user)
    reason = payload.get("reason", "")
    if reason is None:
        reason = ""
    if not isinstance(reason, str):
        raise ValidationError({"reason": "必须是字符串"})
    try:
        rejected = reject_changeset(change_set, user, reason=reason)
    except ChangeSetInvalidState as exc:
        raise ValidationError({"status": str(exc)}) from exc
    return get_changeset_payload(change_set.schema, rejected.id, user)


def revert_applied_changeset(change_set: ChangeSet, user: Any) -> dict[str, Any]:
    try:
        revert_set = revert_changeset(change_set, user)
    except ChangeSetInvalidState as exc:
        raise ValidationError({"status": str(exc)}) from exc
    return get_changeset_payload(revert_set.schema, revert_set.id, user)


def pending_changesets_payload(user: Any, query_params) -> dict[str, Any]:
    schema_ids = DataSchema.objects.for_user(user).values_list("id", flat=True)
    queryset = (
        ChangeSet.objects.filter(
            schema_id__in=schema_ids,
            status=ChangeSet.Status.SUBMITTED,
            approver=user,
        )
        .select_related("schema", "created_by", "approver")
        .order_by("-created_at", "-id")
    )
    page = _positive_int(query_params.get("page"), default=1)
    page_size = min(_positive_int(query_params.get("page_size"), default=20), 100)
    total = queryset.count()
    start = (page - 1) * page_size
    items = list(queryset[start : start + page_size])
    action_counts = _action_counts_by_changeset([item.id for item in items])
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "results": [
            _serialize_changeset_summary(item, action_counts.get(item.id, Counter()))
            for item in items
        ],
    }


def _lock_owned_draft(change_set: ChangeSet, user: Any) -> ChangeSet:
    draft = ChangeSet.objects.select_for_update().select_related("schema").get(pk=change_set.pk)
    if draft.status != ChangeSet.Status.DRAFT:
        raise ValidationError({"status": "只有 draft 状态可以编辑"})
    if draft.created_by_id != user.pk:
        raise PermissionDenied("只能编辑自己创建的草稿")
    return draft


def _resolve_approver(change_set: ChangeSet, user_id: object):
    if user_id in (None, ""):
        raise ValidationError({"approver_id": "启用审批时必须指定审批人"})
    try:
        approver_id = int(user_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"approver_id": "必须是用户 ID"}) from exc
    if approver_id == change_set.created_by_id:
        raise ValidationError({"approver_id": "审批人不能是创建者本人"})
    approver = get_user_model().objects.filter(pk=approver_id, is_active=True).first()
    is_owner = change_set.schema.owner_id == approver_id
    is_editor = TableCollaborator.objects.filter(
        schema=change_set.schema,
        user_id=approver_id,
        role=TableCollaborator.Role.EDITOR,
    ).exists()
    if approver is None or not (is_owner or is_editor):
        raise ValidationError({"approver_id": "审批人必须是该表 owner 或 editor 协作者"})
    return approver


def _ensure_assigned_approver(change_set: ChangeSet, user: Any) -> None:
    if change_set.approver_id != user.pk:
        raise PermissionDenied("只有指定审批人可以处理该 ChangeSet")


def _summary(payload: dict, *, default: str) -> str:
    value = payload.get("summary", default)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError({"summary": "必填"})
    return value.strip()[:200]


def _positive_int(value: object, *, default: int) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"page": "必须是正整数"}) from exc
    if parsed < 1:
        raise ValidationError({"page": "必须是正整数"})
    return parsed
