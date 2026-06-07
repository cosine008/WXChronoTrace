from __future__ import annotations

import copy
from typing import Any

from rest_framework.exceptions import NotFound, ValidationError

from apps.schemas.identity import (
    IDENTITY_CODE_FIELD_KEY,
    IdentityResolutionError,
    auto_number_sequence_prefix,
    auto_number_start_sequence,
    format_auto_number_value,
    identity_auto_number_field,
    resolve_business_code,
    schema_identity_field_keys,
    schema_identity_mode,
)
from apps.schemas.models import DataSchema
from apps.temporal.models import Entity, TemporalRecord

from .api import _current_record, _parse_date, _validate_payload
from .models import ChangeEntry, ChangeSet


def upsert_draft_entry(draft: ChangeSet, user: Any, payload: dict) -> ChangeEntry:
    action = _entry_action(payload)
    if action == ChangeEntry.Action.CREATE:
        return _create_entry(draft, user, payload)
    if action == ChangeEntry.Action.UPDATE:
        return _update_entry(draft, payload)
    return _terminate_entry(draft, payload)


def delete_draft_entry_record(draft: ChangeSet, entry_id: int) -> None:
    entry = ChangeEntry.objects.select_for_update().filter(change_set=draft, pk=entry_id).first()
    if entry is None:
        raise NotFound("变更明细不存在")
    entity = entry.entity
    action = entry.action
    entry.delete()
    if action == ChangeEntry.Action.CREATE:
        _delete_empty_draft_entity(entity)


def _create_entry(draft: ChangeSet, user: Any, payload: dict) -> ChangeEntry:
    valid_from = _parse_date(payload.get("valid_from"))
    valid_to = _optional_date(payload.get("valid_to"))
    data_after = _data_after(payload)
    business_code = _business_code(
        draft.schema, data_after, payload.get("business_code"), valid_from
    )
    _validate_payload(draft.schema, data_after)
    entity = _draft_create_entity(draft.schema, business_code, user)
    _ensure_no_entry_conflict(draft, entity, valid_from)
    return ChangeEntry.objects.create(
        change_set=draft,
        entity=entity,
        action=ChangeEntry.Action.CREATE,
        data_after=copy.deepcopy(data_after),
        valid_from=valid_from,
        valid_to=valid_to,
    )


def _update_entry(draft: ChangeSet, payload: dict) -> ChangeEntry:
    valid_from = _parse_date(payload.get("valid_from"))
    entity = _lock_entry_entity(draft.schema, payload.get("entity_id"))
    current = _current_record(entity, valid_from)
    data_after = copy.deepcopy(current.data_payload)
    data_after.update(_data_after(payload))
    _ensure_identity_unchanged(draft.schema, entity, data_after)
    _validate_payload(draft.schema, data_after)
    existing = _draft_entry(draft, entity, valid_from, ChangeEntry.Action.UPDATE)
    _ensure_no_entry_conflict(draft, entity, valid_from, allowed=existing)
    if existing is None:
        return ChangeEntry.objects.create(
            change_set=draft,
            entity=entity,
            action=ChangeEntry.Action.UPDATE,
            data_before=copy.deepcopy(current.data_payload),
            data_after=data_after,
            valid_from=valid_from,
            valid_to=current.valid_to,
        )
    existing.data_after = data_after
    existing.valid_to = current.valid_to
    existing.save(update_fields=["data_after", "valid_to"])
    return existing


def _terminate_entry(draft: ChangeSet, payload: dict) -> ChangeEntry:
    valid_from = _parse_date(payload.get("valid_from"))
    entity = _lock_entry_entity(draft.schema, payload.get("entity_id"))
    current = _current_record(entity, valid_from)
    existing = _draft_entry(draft, entity, valid_from, ChangeEntry.Action.TERMINATE)
    _ensure_no_entry_conflict(draft, entity, valid_from, allowed=existing)
    if existing is None:
        return ChangeEntry.objects.create(
            change_set=draft,
            entity=entity,
            action=ChangeEntry.Action.TERMINATE,
            data_before=copy.deepcopy(current.data_payload),
            valid_from=valid_from,
        )
    existing.data_before = copy.deepcopy(current.data_payload)
    existing.save(update_fields=["data_before"])
    return existing


def _entry_action(payload: dict) -> str:
    action = payload.get("action")
    if action not in ChangeEntry.Action.values:
        raise ValidationError({"action": "必须是 create / update / terminate"})
    return action


def _data_after(payload: dict) -> dict[str, Any]:
    value = payload.get("data_after")
    if not isinstance(value, dict):
        raise ValidationError({"data_after": "必须是对象"})
    return copy.deepcopy(value)


def _business_code(
    schema: DataSchema, data_after: dict, explicit: object, valid_from: object
) -> str:
    if schema_identity_mode(schema) != "composite" and explicit not in (None, ""):
        data_after[schema.identity_field_key] = explicit
    _fill_auto_number_identity(schema, data_after, valid_from)
    try:
        return resolve_business_code(schema, data_after)
    except IdentityResolutionError as exc:
        raise ValidationError({exc.field_key: exc.message}) from exc


def _fill_auto_number_identity(schema: DataSchema, data_after: dict, valid_from: object) -> None:
    field = identity_auto_number_field(schema)
    if field is None or data_after.get(schema.identity_field_key) not in (None, ""):
        return
    locked_schema = DataSchema.objects.select_for_update().get(pk=schema.pk)
    locked_field = identity_auto_number_field(locked_schema)
    if locked_field is None:
        return
    data_after[locked_schema.identity_field_key] = _next_auto_number_identity(
        locked_schema, locked_field, valid_from
    )


def _next_auto_number_identity(schema: DataSchema, field: dict, valid_from: object) -> str:
    prefix = auto_number_sequence_prefix(schema.schema_code, field, valid_from)
    max_sequence = auto_number_start_sequence(field) - 1
    values = (
        Entity.objects.select_for_update()
        .filter(schema=schema, business_code__startswith=prefix)
        .values_list("business_code", flat=True)
    )
    for value in values:
        suffix = value[len(prefix) :]
        if suffix.isdigit():
            max_sequence = max(max_sequence, int(suffix))
    return format_auto_number_value(schema.schema_code, field, max_sequence + 1, valid_from)


def _draft_create_entity(schema: DataSchema, business_code: str, user: Any) -> Entity:
    entity = (
        Entity.objects.select_for_update()
        .filter(schema=schema, business_code=business_code)
        .first()
    )
    if entity is None:
        return Entity.objects.create(schema=schema, business_code=business_code, created_by=user)
    if TemporalRecord.objects.filter(entity=entity, is_superseded=False).exists():
        raise ValidationError({"business_code": "实体已存在，不能作为新增条目"})
    return entity


def _lock_entry_entity(schema: DataSchema, entity_id: object) -> Entity:
    try:
        parsed = int(entity_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"entity_id": "必填"}) from exc
    entity = Entity.objects.select_for_update().filter(schema=schema, pk=parsed).first()
    if entity is None:
        raise NotFound("实体不存在")
    return entity


def _ensure_identity_unchanged(schema: DataSchema, entity: Entity, data_after: dict) -> None:
    if schema_identity_mode(schema) == "composite":
        _ensure_composite_identity_unchanged(schema, entity, data_after)
        return
    identity = schema.identity_field_key
    if identity not in data_after:
        data_after[identity] = entity.business_code
        return
    try:
        business_code = resolve_business_code(schema, data_after)
    except IdentityResolutionError as exc:
        raise ValidationError({exc.field_key: exc.message}) from exc
    if business_code != entity.business_code:
        raise ValidationError({identity: "实体标识字段不能在 ChangeSet 中修改"})
    data_after[identity] = entity.business_code


def _ensure_composite_identity_unchanged(
    schema: DataSchema,
    entity: Entity,
    data_after: dict,
) -> None:
    try:
        business_code = resolve_business_code(schema, data_after)
    except IdentityResolutionError as exc:
        raise ValidationError({exc.field_key: exc.message}) from exc
    if business_code != entity.business_code:
        fields = schema_identity_field_keys(schema)
        raise ValidationError({fields[0] if fields else IDENTITY_CODE_FIELD_KEY: "组合实体标识不能在 ChangeSet 中修改"})
    data_after[IDENTITY_CODE_FIELD_KEY] = entity.business_code


def _ensure_no_entry_conflict(
    draft: ChangeSet,
    entity: Entity,
    valid_from,
    *,
    allowed: ChangeEntry | None = None,
) -> None:
    conflict = ChangeEntry.objects.filter(
        change_set=draft,
        entity=entity,
        valid_from=valid_from,
    )
    if allowed is not None:
        conflict = conflict.exclude(pk=allowed.pk)
    if conflict.exists():
        raise ValidationError({"entry": "同一实体同一生效日已存在变更明细"})


def _draft_entry(
    draft: ChangeSet,
    entity: Entity,
    valid_from,
    action: str,
) -> ChangeEntry | None:
    return (
        ChangeEntry.objects.select_for_update()
        .filter(change_set=draft, entity=entity, valid_from=valid_from, action=action)
        .first()
    )


def _delete_empty_draft_entity(entity: Entity) -> None:
    has_records = TemporalRecord.objects.filter(entity=entity).exists()
    has_entries = ChangeEntry.objects.filter(entity=entity).exists()
    if not has_records and not has_entries:
        entity.delete()


def _optional_date(value: object):
    if value in (None, ""):
        return None
    return _parse_date(value)
