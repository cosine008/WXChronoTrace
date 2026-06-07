from __future__ import annotations

import copy
import datetime as dt
from typing import Any

from django.db.models import Q

from apps.temporal.models import TemporalRecord

from .exceptions import ChangeSetInvalidState
from .models import ChangeEntry, ChangeSet


def apply_entries(change_set: ChangeSet, entries: list[ChangeEntry], user: Any) -> None:
    for entry in entries:
        if entry.action == ChangeEntry.Action.CREATE:
            _apply_create(entry, change_set, user)
        elif entry.action == ChangeEntry.Action.UPDATE:
            _apply_update(entry, change_set, user)
        elif entry.action == ChangeEntry.Action.TERMINATE:
            _apply_terminate(entry)


def revert_entries(entries: list[ChangeEntry], revert_set: ChangeSet, user: Any) -> None:
    for entry in reversed(entries):
        if entry.action == ChangeEntry.Action.CREATE:
            _revert_create(entry, revert_set)
        elif entry.action == ChangeEntry.Action.UPDATE:
            _revert_update(entry, revert_set, user)
        elif entry.action == ChangeEntry.Action.TERMINATE:
            _revert_terminate(entry, revert_set, user)


def _apply_create(entry: ChangeEntry, change_set: ChangeSet, user: Any) -> None:
    record = _create_temporal_record(
        entry=entry,
        change_set=change_set,
        user=user,
        payload=entry.data_after,
        valid_to=entry.valid_to,
    )
    _set_entry_new_record(entry, record)


def _apply_update(entry: ChangeEntry, change_set: ChangeSet, user: Any) -> None:
    current = _get_active_record(entry)
    _close_or_supersede(current, entry.valid_from)
    record = _create_temporal_record(
        entry=entry,
        change_set=change_set,
        user=user,
        payload=entry.data_after,
        valid_to=entry.valid_to,
    )
    _set_entry_new_record(entry, record)


def _apply_terminate(entry: ChangeEntry) -> None:
    current = _get_active_record(entry)
    _close_or_supersede(current, entry.valid_from)


def _revert_create(entry: ChangeEntry, revert_set: ChangeSet) -> None:
    original_record = _lock_new_record(entry)
    if original_record is not None:
        _mark_superseded(original_record)

    ChangeEntry.objects.create(
        change_set=revert_set,
        entity=entry.entity,
        action=ChangeEntry.Action.TERMINATE,
        data_before=_clone_json(entry.data_after),
        valid_from=entry.valid_from,
    )


def _revert_update(entry: ChangeEntry, revert_set: ChangeSet, user: Any) -> None:
    original_record = _lock_new_record(entry)
    valid_to = original_record.valid_to if original_record is not None else entry.valid_to
    if original_record is not None:
        _mark_superseded(original_record)

    restored = _create_temporal_record(
        entry=entry,
        change_set=revert_set,
        user=user,
        payload=entry.data_before,
        valid_to=valid_to,
    )
    if original_record is not None:
        original_record.superseded_by = restored
        original_record.save(update_fields=["superseded_by"])

    ChangeEntry.objects.create(
        change_set=revert_set,
        entity=entry.entity,
        action=ChangeEntry.Action.UPDATE,
        data_before=_clone_json(entry.data_after),
        data_after=_clone_json(entry.data_before),
        valid_from=entry.valid_from,
        valid_to=valid_to,
        new_record=restored,
    )


def _revert_terminate(entry: ChangeEntry, revert_set: ChangeSet, user: Any) -> None:
    restored = _create_temporal_record(
        entry=entry,
        change_set=revert_set,
        user=user,
        payload=entry.data_before,
        valid_to=_next_record_start(entry),
    )
    ChangeEntry.objects.create(
        change_set=revert_set,
        entity=entry.entity,
        action=ChangeEntry.Action.CREATE,
        data_after=_clone_json(entry.data_before),
        valid_from=entry.valid_from,
        valid_to=restored.valid_to,
        new_record=restored,
    )


def _create_temporal_record(
    *,
    entry: ChangeEntry,
    change_set: ChangeSet,
    user: Any,
    payload: dict[str, Any] | None,
    valid_to: dt.date | None,
) -> TemporalRecord:
    return TemporalRecord.objects.create(
        entity=entry.entity,
        schema_version=change_set.schema.current_version,
        data_payload=_clone_json(payload),
        valid_from=entry.valid_from,
        valid_to=valid_to,
        change_set=change_set,
        recorded_by=user,
    )


def _get_active_record(entry: ChangeEntry) -> TemporalRecord:
    record = (
        TemporalRecord.objects.select_for_update()
        .filter(entity=entry.entity, is_superseded=False, valid_from__lte=entry.valid_from)
        .filter(Q(valid_to__isnull=True) | Q(valid_to__gt=entry.valid_from))
        .order_by("-valid_from", "-id")
        .first()
    )
    if record is None:
        raise ChangeSetInvalidState("No active temporal record found for the change entry.")
    return record


def _next_record_start(entry: ChangeEntry) -> dt.date | None:
    next_record = (
        TemporalRecord.objects.select_for_update()
        .filter(entity=entry.entity, is_superseded=False, valid_from__gt=entry.valid_from)
        .order_by("valid_from", "id")
        .first()
    )
    return next_record.valid_from if next_record is not None else entry.valid_to


def _close_or_supersede(record: TemporalRecord, valid_from: dt.date) -> None:
    if record.valid_from == valid_from:
        _mark_superseded(record)
        return

    record.valid_to = valid_from
    record.save(update_fields=["valid_to"])


def _mark_superseded(record: TemporalRecord) -> None:
    record.is_superseded = True
    record.save(update_fields=["is_superseded"])


def _set_entry_new_record(entry: ChangeEntry, record: TemporalRecord) -> None:
    entry.new_record = record
    entry.save(update_fields=["new_record"])


def _lock_new_record(entry: ChangeEntry) -> TemporalRecord | None:
    if entry.new_record_id is None:
        return None
    return TemporalRecord.objects.select_for_update().filter(pk=entry.new_record_id).first()


def _clone_json(value: dict[str, Any] | None) -> dict[str, Any]:
    return copy.deepcopy(value or {})
