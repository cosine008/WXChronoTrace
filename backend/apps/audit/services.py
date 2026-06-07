from __future__ import annotations

from typing import Any

from .models import AuditLog

ALWAYS_SENSITIVE_ACTIONS = {
    "schema.handover",
    "changeset.revert",
    "admin.impersonate",
    "admin.password_reset",
    "audit.export",
}


def record_audit_log(
    *,
    actor,
    action: str,
    target_type: str,
    target_id: int | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    detail = detail or {}
    return AuditLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        ip_address=ip_address,
        is_sensitive=is_sensitive_action(action, detail),
    )


def is_sensitive_action(action: str, detail: dict[str, Any] | None = None) -> bool:
    detail = detail or {}
    if action in ALWAYS_SENSITIVE_ACTIONS:
        return True
    if action == "schema.visibility_change":
        return _is_public_upgrade(detail)
    if action == "schema.update_fields":
        return _has_destructive_field_change(detail)
    if action == "data.export":
        return int(detail.get("row_count", 0)) > 500
    if action.startswith("workbench."):
        return bool(detail.get("is_sensitive"))
    return False


def _is_public_upgrade(detail: dict[str, Any]) -> bool:
    return detail.get("to_visibility") == "public" and detail.get("from_visibility") != "public"


def _has_destructive_field_change(detail: dict[str, Any]) -> bool:
    return bool(
        detail.get("destructive")
        or detail.get("removed_field_keys")
        or detail.get("changed_field_types")
    )
