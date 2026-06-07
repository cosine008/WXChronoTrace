from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.audit.services import record_audit_log
from apps.notifications.models import Notification
from apps.notifications.services import schedule_notification_on_commit
from apps.temporal.models import Entity

from .exceptions import ChangeSetInvalidState
from .models import ChangeEntry, ChangeSet
from .record_ops import apply_entries, revert_entries


def submit_changeset(change_set: ChangeSet, user: Any) -> ChangeSet:
    with transaction.atomic():
        locked = _lock_change_set(change_set)
        if locked.status != ChangeSet.Status.DRAFT:
            raise ChangeSetInvalidState("Only draft changesets can be submitted.")
        if locked.approval_required and locked.approver_id is None:
            raise ChangeSetInvalidState("Approval-required changesets need an approver.")

        locked.status = ChangeSet.Status.SUBMITTED
        locked.save(update_fields=["status"])
        if locked.approver_id is not None:
            _schedule_approval_assigned_notification(
                change_set=locked,
                approver=locked.approver,
                actor=user,
            )
        return locked


def approve_changeset(change_set: ChangeSet, user: Any) -> ChangeSet:
    with transaction.atomic():
        locked = _lock_change_set(change_set)
        if locked.status != ChangeSet.Status.SUBMITTED:
            raise ChangeSetInvalidState("Only submitted changesets can be approved.")
        _ensure_can_approve(locked, user)

        locked.status = ChangeSet.Status.APPROVED
        locked.approved_at = timezone.now()
        locked.save(update_fields=["status", "approved_at"])
        _schedule_approval_updated_notification(
            change_set=locked,
            actor=user,
            status_label="通过",
            severity=Notification.Severity.SUCCESS,
        )
        return _apply_locked_changeset(locked, user)


def reject_changeset(change_set: ChangeSet, user: Any, *, reason: str = "") -> ChangeSet:
    with transaction.atomic():
        locked = _lock_change_set(change_set)
        if locked.status != ChangeSet.Status.SUBMITTED:
            raise ChangeSetInvalidState("Only submitted changesets can be rejected.")
        _ensure_can_approve(locked, user)

        locked.status = ChangeSet.Status.REJECTED
        locked.rejected_reason = reason
        locked.save(update_fields=["status", "rejected_reason"])
        _schedule_approval_updated_notification(
            change_set=locked,
            actor=user,
            status_label="驳回",
            severity=Notification.Severity.WARNING,
        )
        return locked


def apply_changeset(change_set: ChangeSet, user: Any) -> ChangeSet:
    with transaction.atomic():
        locked = _lock_change_set(change_set)
        return _apply_locked_changeset(locked, user)


def revert_changeset(change_set: ChangeSet, user: Any) -> ChangeSet:
    with transaction.atomic():
        original = _lock_change_set(change_set)
        if original.status != ChangeSet.Status.APPLIED:
            raise ChangeSetInvalidState("Only applied changesets can be reverted.")

        entries = _lock_entries(original)
        _lock_entities(entries)
        revert_set = ChangeSet.objects.create(
            schema=original.schema,
            summary=f"Revert: {original.summary}",
            status=ChangeSet.Status.APPLIED,
            created_by=user,
            applied_at=timezone.now(),
            revert_of=original,
            source=ChangeSet.Source.REVERT,
        )
        revert_entries(entries, revert_set, user)

        original.status = ChangeSet.Status.REVERTED
        original.save(update_fields=["status"])
        _audit_change(user, "changeset.revert", original, {"revert_changeset_id": revert_set.id})
        return revert_set


def _apply_locked_changeset(change_set: ChangeSet, user: Any) -> ChangeSet:
    _ensure_can_apply(change_set)
    entries = _lock_entries(change_set)
    _lock_entities(entries)
    apply_entries(change_set, entries, user)

    change_set.status = ChangeSet.Status.APPLIED
    change_set.applied_at = timezone.now()
    change_set.save(update_fields=["status", "applied_at"])
    _audit_change(user, "changeset.apply", change_set, {"entry_count": len(entries)})
    return change_set


def _ensure_can_apply(change_set: ChangeSet) -> None:
    if change_set.status == ChangeSet.Status.DRAFT and not change_set.approval_required:
        return
    if change_set.status == ChangeSet.Status.APPROVED:
        return
    if change_set.status == ChangeSet.Status.SUBMITTED and change_set.approved_at is not None:
        return

    raise ChangeSetInvalidState("Changeset is not in an applyable state.")


def _ensure_can_approve(change_set: ChangeSet, user: Any) -> None:
    if change_set.approver_id is not None and change_set.approver_id != user.pk:
        raise ChangeSetInvalidState("Only the configured approver can approve or reject.")


def _lock_change_set(change_set: ChangeSet) -> ChangeSet:
    return ChangeSet.objects.select_for_update().select_related("schema").get(pk=change_set.pk)


def _lock_entries(change_set: ChangeSet) -> list[ChangeEntry]:
    return list(
        ChangeEntry.objects.select_for_update()
        .select_related("entity")
        .filter(change_set=change_set)
        .order_by("valid_from", "id")
    )


def _lock_entities(entries: list[ChangeEntry]) -> None:
    entity_ids = sorted({entry.entity_id for entry in entries})
    if entity_ids:
        list(Entity.objects.select_for_update().filter(pk__in=entity_ids).order_by("pk"))


def _audit_change(user: Any, action: str, change_set: ChangeSet, detail: dict[str, Any]) -> None:
    record_audit_log(
        actor=user,
        action=action,
        target_type="changeset",
        target_id=change_set.id,
        detail=detail,
    )


def _schedule_approval_assigned_notification(
    *,
    change_set: ChangeSet,
    approver: Any,
    actor: Any,
) -> None:
    schedule_notification_on_commit(
        recipient=approver,
        actor=actor,
        type=Notification.Type.APPROVAL_ASSIGNED,
        severity=Notification.Severity.WARNING,
        title="有新的变更待审批",
        body=f"{change_set.schema.name} 有一批变更等待你审批。",
        target_kind="changeset",
        target_id=str(change_set.id),
        target_url=f"/approvals?changeset_id={change_set.id}",
        payload={
            "schema_id": change_set.schema_id,
            "change_set_id": change_set.id,
            "status": change_set.status,
        },
        dedupe_key=f"approval_assigned:{change_set.id}:{approver.id}",
    )


def _schedule_approval_updated_notification(
    *,
    change_set: ChangeSet,
    actor: Any,
    status_label: str,
    severity: str,
) -> None:
    schedule_notification_on_commit(
        recipient=change_set.created_by,
        actor=actor,
        type=Notification.Type.APPROVAL_UPDATED,
        severity=severity,
        title="变更审批状态已更新",
        body=f"{change_set.schema.name} 的变更已{status_label}。",
        target_kind="changeset",
        target_id=str(change_set.id),
        target_url=f"/schemas/{change_set.schema_id}/records?change_set={change_set.id}",
        payload={
            "schema_id": change_set.schema_id,
            "change_set_id": change_set.id,
            "status": change_set.status,
        },
        dedupe_key=f"approval_updated:{change_set.id}:{change_set.status}",
    )
