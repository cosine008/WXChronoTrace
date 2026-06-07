from __future__ import annotations

import hashlib
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import record_audit_log
from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_view_schema
from apps.temporal.models import Entity

from .codegen import generate_label_code, normalize_label_code
from .models import EntityLabel, LabelScanEvent
from .template_config import (
    LabelPrintConfigError,
    label_print_config_validation_error,
    resolve_label_template,
)

MAX_LABEL_CODE_ATTEMPTS = 8


class InvalidEntityIdsError(ValueError):
    def __init__(self, entity_ids: list[int]) -> None:
        super().__init__("无效实体 ID")
        self.entity_ids = entity_ids


def resolve_scan(raw_label_code: str, user, source: str = "", request: Any = None) -> tuple[dict[str, Any], int]:
    from .api import build_resolved_scan_payload

    scan_source = _scan_source(source)
    raw_input_kind = _raw_input_kind(raw_label_code)
    try:
        label_code = normalize_label_code(raw_label_code)
    except ValueError:
        _record_scan_event(None, raw_label_code, user, LabelScanEvent.Outcome.INVALID, scan_source, raw_input_kind)
        return {"outcome": LabelScanEvent.Outcome.INVALID, "message": "无效标签码"}, 400

    label = _find_label(label_code)
    if label is None:
        _record_scan_event(None, label_code, user, LabelScanEvent.Outcome.NOT_FOUND, scan_source, raw_input_kind)
        return {"outcome": LabelScanEvent.Outcome.NOT_FOUND, "message": "标签不存在"}, 404

    if not getattr(user, "is_authenticated", False):
        _record_scan_event(label, label_code, None, LabelScanEvent.Outcome.LOGIN_REQUIRED, scan_source, raw_input_kind)
        return {"outcome": LabelScanEvent.Outcome.LOGIN_REQUIRED, "message": "请先登录"}, 401
    if not can_view_schema(user, label.schema):
        _record_scan_event(label, label_code, user, LabelScanEvent.Outcome.DENIED, scan_source, raw_input_kind)
        return {"outcome": LabelScanEvent.Outcome.DENIED, "message": "无权查看该标签"}, 403
    if label.status == EntityLabel.Status.REVOKED:
        _record_scan_event(label, label_code, user, LabelScanEvent.Outcome.REVOKED, scan_source, raw_input_kind)
        return _status_payload(label, LabelScanEvent.Outcome.REVOKED, "标签已作废"), 410
    if label.status == EntityLabel.Status.REPLACED:
        _record_scan_event(label, label_code, user, LabelScanEvent.Outcome.REPLACED, scan_source, raw_input_kind)
        return _replaced_payload(label), 409

    _mark_scan_success(label)
    label.refresh_from_db()
    _record_scan_event(label, label_code, user, LabelScanEvent.Outcome.RESOLVED, scan_source, raw_input_kind)
    return build_resolved_scan_payload(label, user), 200


def serialize_label(label: EntityLabel) -> dict[str, Any]:
    return {
        "id": label.id,
        "label_code": label.label_code,
        "entity_id": label.entity_id,
        "schema_id": label.schema_id,
        "status": label.status,
        "template_code": label.template_code,
        "issued_at": label.issued_at.isoformat(),
        "issued_by_id": label.issued_by_id,
        "printed_at": label.printed_at.isoformat() if label.printed_at else None,
        "printed_by_id": label.printed_by_id,
        "revoked_at": label.revoked_at.isoformat() if label.revoked_at else None,
        "revoked_by_id": label.revoked_by_id,
        "revoked_reason": label.revoked_reason,
        "replaced_by_id": label.replaced_by_id,
        "last_scanned_at": label.last_scanned_at.isoformat() if label.last_scanned_at else None,
        "scan_count": label.scan_count,
    }


@transaction.atomic
def create_label(
    entity: Entity,
    actor,
    template_code: str | None = None,
    replace_existing_active: bool = False,
    reason: str = "",
) -> EntityLabel:
    resolved_template_code = _resolved_template_code(entity.schema, template_code)
    active_label = _active_label(entity)
    if active_label is not None:
        if replace_existing_active:
            return replace_label(
                active_label,
                actor,
                reason or "替换已有 active 标签",
                resolved_template_code,
            )
        raise ValidationError({"active_label": "该实体已有 active 标签"})

    label = _create_label_record(entity, actor, resolved_template_code)
    _record_label_audit(actor, "label.create", label, {"template_code": resolved_template_code})
    return label


@transaction.atomic
def bulk_create_labels(
    schema: DataSchema,
    entity_ids: list[int],
    actor,
    template_code: str | None = None,
    skip_existing_active: bool = True,
    create_missing: bool = True,
) -> dict[str, Any]:
    resolved_template_code = _resolved_template_code(schema, template_code)
    entities = Entity.objects.select_related("schema").filter(pk__in=entity_ids)
    entity_by_id = {entity.id: entity for entity in entities}
    invalid_ids = [
        entity_id
        for entity_id in entity_ids
        if entity_id not in entity_by_id or entity_by_id[entity_id].schema_id != schema.id
    ]
    if invalid_ids:
        raise InvalidEntityIdsError(invalid_ids)

    created: list[EntityLabel] = []
    skipped = []
    for entity_id in entity_ids:
        entity = entity_by_id[entity_id]
        active_label = _active_label(entity)
        if active_label is not None:
            if skip_existing_active:
                skipped.append(
                    {
                        "entity_id": entity.id,
                        "reason": "active_label_exists",
                        "label": serialize_label(active_label),
                    }
                )
                continue
            raise ValidationError({"active_label": f"实体 {entity.id} 已有 active 标签"})
        if not create_missing:
            skipped.append({"entity_id": entity.id, "reason": "active_label_missing"})
            continue
        created.append(_create_label_record(entity, actor, resolved_template_code))

    record_audit_log(
        actor=actor,
        action="label.bulk_create",
        target_type="schema",
        target_id=schema.id,
        detail={
            "schema_id": schema.id,
            "entity_ids": entity_ids,
            "created_label_ids": [label.id for label in created],
            "skipped": skipped,
            "template_code": resolved_template_code,
            "create_missing": create_missing,
        },
    )
    return {
        "created": [serialize_label(label) for label in created],
        "skipped": skipped,
    }


@transaction.atomic
def revoke_label(label: EntityLabel, actor, reason: str) -> EntityLabel:
    if label.status != EntityLabel.Status.ACTIVE:
        raise ValidationError({"status": "只有 active 标签可以作废"})
    label.status = EntityLabel.Status.REVOKED
    label.revoked_at = timezone.now()
    label.revoked_by = actor
    label.revoked_reason = reason
    label.save(update_fields=["status", "revoked_at", "revoked_by", "revoked_reason", "updated_at"])
    _record_label_audit(actor, "label.revoke", label, {"reason": reason})
    return label


@transaction.atomic
def replace_label(label: EntityLabel, actor, reason: str, template_code: str | None = None) -> EntityLabel:
    if label.status != EntityLabel.Status.ACTIVE:
        raise ValidationError({"status": "只有 active 标签可以替换"})

    label.status = EntityLabel.Status.REPLACED
    label.revoked_at = timezone.now()
    label.revoked_by = actor
    label.revoked_reason = reason
    label.save(update_fields=["status", "revoked_at", "revoked_by", "revoked_reason", "updated_at"])

    resolved_template_code = _resolved_template_code(label.schema, template_code or label.template_code)
    new_label = _create_label_record(label.entity, actor, resolved_template_code)
    label.replaced_by = new_label
    label.save(update_fields=["replaced_by", "updated_at"])
    _record_label_audit(
        actor,
        "label.replace",
        label,
        {
            "reason": reason,
            "new_label_id": new_label.id,
            "new_label_code": new_label.label_code,
            "template_code": resolved_template_code,
        },
    )
    return new_label


@transaction.atomic
def record_label_print(
    label: EntityLabel,
    actor,
    template_code: str,
    print_snapshot: dict[str, Any],
) -> EntityLabel:
    label.printed_at = timezone.now()
    label.printed_by = actor
    label.print_snapshot = print_snapshot
    label.save(update_fields=["printed_at", "printed_by", "print_snapshot", "updated_at"])
    _record_label_audit(
        actor,
        "label.print",
        label,
        {
            "template_code": template_code,
            "print_snapshot": print_snapshot,
        },
    )
    return label


def _active_label(entity: Entity) -> EntityLabel | None:
    return EntityLabel.objects.filter(entity=entity, status=EntityLabel.Status.ACTIVE).first()


def _resolved_template_code(schema: DataSchema, template_code: str | None) -> str:
    try:
        return resolve_label_template(schema, template_code).code
    except LabelPrintConfigError as exc:
        raise label_print_config_validation_error(exc) from exc


def _create_label_record(entity: Entity, actor, template_code: str) -> EntityLabel:
    for _ in range(MAX_LABEL_CODE_ATTEMPTS):
        label_code = generate_label_code()
        if EntityLabel.objects.filter(label_code=label_code).exists():
            continue
        try:
            with transaction.atomic():
                return EntityLabel.objects.create(
                    label_code=label_code,
                    entity=entity,
                    schema=entity.schema,
                    template_code=template_code,
                    issued_by=actor,
                )
        except IntegrityError:
            continue
    raise ValidationError({"label_code": "标签码生成冲突，请重试"})


def _record_label_audit(actor, action: str, label: EntityLabel, detail: dict[str, Any]) -> None:
    record_audit_log(
        actor=actor,
        action=action,
        target_type="label",
        target_id=label.id,
        detail={
            "label_id": label.id,
            "label_code": label.label_code,
            "entity_id": label.entity_id,
            "schema_id": label.schema_id,
            **detail,
        },
    )


def _find_label(label_code: str) -> EntityLabel | None:
    return (
        EntityLabel.objects.select_related("entity", "schema", "schema__owner", "replaced_by")
        .filter(label_code=label_code)
        .first()
    )


def _record_scan_event(
    label: EntityLabel | None,
    label_code: str,
    actor,
    outcome: str,
    source: str,
    raw_input_kind: str,
) -> None:
    LabelScanEvent.objects.create(
        label=label,
        label_code_hash=_hash_label_code(label_code),
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        entity=label.entity if label else None,
        schema=label.schema if label else None,
        outcome=outcome,
        source=source,
        raw_input_kind=raw_input_kind,
    )


def _mark_scan_success(label: EntityLabel) -> None:
    EntityLabel.objects.filter(pk=label.pk).update(
        scan_count=F("scan_count") + 1,
        last_scanned_at=timezone.now(),
        updated_at=timezone.now(),
    )


def _status_payload(label: EntityLabel, outcome: str, message: str) -> dict[str, Any]:
    return {
        "outcome": outcome,
        "message": message,
        "label": serialize_label(label),
    }


def _replaced_payload(label: EntityLabel) -> dict[str, Any]:
    payload = _status_payload(label, LabelScanEvent.Outcome.REPLACED, "标签已替换")
    payload["replacement"] = serialize_label(label.replaced_by) if label.replaced_by else None
    return payload


def _scan_source(value: str) -> str:
    allowed = {choice.value for choice in LabelScanEvent.Source}
    return value if value in allowed else LabelScanEvent.Source.API


def _raw_input_kind(value: str) -> str:
    text = str(value or "")
    if "/scan/" in text.lower() or text.lower().startswith(("http://", "https://")):
        return LabelScanEvent.RawInputKind.URL
    if text.upper().startswith("CT-L"):
        return LabelScanEvent.RawInputKind.CODE
    return LabelScanEvent.RawInputKind.UNKNOWN


def _hash_label_code(value: str) -> str:
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"
