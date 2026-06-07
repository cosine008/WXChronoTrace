from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_edit_data, can_view_schema

from .api import (
    build_draft_overlay_payload,
    changeset_field_diffs_payload,
    compare_changesets_payload,
    get_changeset_payload,
    list_changesets_payload,
)
from .editor import (
    add_draft_entry,
    approve_pending_changeset,
    create_draft_changeset,
    delete_draft_changeset,
    delete_draft_entry,
    pending_changesets_payload,
    reject_pending_changeset,
    revert_applied_changeset,
    submit_draft_changeset,
    update_draft_changeset,
)
from .models import ChangeSet


@api_view(["GET", "POST"])
def schema_changesets_view(request, schema_id: int):
    if request.method == "POST":
        schema = _editable_schema(request.user, schema_id)
        payload = create_draft_changeset(schema, request.user, request.data)
        return Response(payload, status=status.HTTP_201_CREATED)

    schema = _visible_schema(request.user, schema_id)
    return Response(list_changesets_payload(schema, request.query_params))


@api_view(["GET"])
def schema_changeset_detail_view(request, schema_id: int, change_set_id: int):
    schema = _visible_schema(request.user, schema_id)
    return Response(get_changeset_payload(schema, change_set_id, request.user, request.query_params))


@api_view(["GET"])
def schema_changeset_compare_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    return Response(compare_changesets_payload(schema, request.query_params))


@api_view(["GET"])
def schema_changeset_field_diffs_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    return Response(changeset_field_diffs_payload(schema, request.query_params, request.user))


@api_view(["GET"])
def schema_draft_overlay_view(request, schema_id: int):
    schema = _visible_schema(request.user, schema_id)
    return Response(build_draft_overlay_payload(schema, request.query_params, request.user))


@api_view(["GET"])
def pending_changesets_view(request):
    return Response(pending_changesets_payload(request.user, request.query_params))


@api_view(["GET", "PATCH", "DELETE"])
def changeset_detail_view(request, change_set_id: int):
    change_set = _visible_changeset(request.user, change_set_id)
    if request.method == "PATCH":
        _ensure_can_edit_changeset(request.user, change_set)
        return Response(update_draft_changeset(change_set, request.user, request.data))
    if request.method == "DELETE":
        _ensure_can_edit_changeset(request.user, change_set)
        delete_draft_changeset(change_set, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response(get_changeset_payload(change_set.schema, change_set.id, request.user))


@api_view(["POST"])
def changeset_entries_view(request, change_set_id: int):
    change_set = _editable_changeset(request.user, change_set_id)
    payload = add_draft_entry(change_set, request.user, request.data)
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
def changeset_entry_detail_view(request, change_set_id: int, entry_id: int):
    change_set = _editable_changeset(request.user, change_set_id)
    delete_draft_entry(change_set, request.user, entry_id)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
def changeset_submit_view(request, change_set_id: int):
    change_set = _editable_changeset(request.user, change_set_id)
    return Response(submit_draft_changeset(change_set, request.user, request.data))


@api_view(["POST"])
def changeset_approve_view(request, change_set_id: int):
    change_set = _visible_changeset(request.user, change_set_id)
    return Response(approve_pending_changeset(change_set, request.user))


@api_view(["POST"])
def changeset_reject_view(request, change_set_id: int):
    change_set = _visible_changeset(request.user, change_set_id)
    return Response(reject_pending_changeset(change_set, request.user, request.data))


@api_view(["POST"])
def changeset_revert_view(request, change_set_id: int):
    change_set = _editable_changeset(request.user, change_set_id)
    return Response(revert_applied_changeset(change_set, request.user))


def _visible_schema(user, schema_id: int) -> DataSchema:
    schema = DataSchema.objects.for_user(user).filter(pk=schema_id).first()
    if schema is None:
        raise NotFound("数据表不存在")
    return schema


def _editable_schema(user, schema_id: int) -> DataSchema:
    schema = _visible_schema(user, schema_id)
    if not can_edit_data(user, schema):
        raise PermissionDenied("你对该表无数据编辑权限")
    return schema


def _visible_changeset(user, change_set_id: int) -> ChangeSet:
    change_set = (
        ChangeSet.objects.select_related("schema", "created_by", "approver")
        .filter(pk=change_set_id)
        .first()
    )
    if change_set is None or not can_view_schema(user, change_set.schema):
        raise NotFound("变更批次不存在")
    return change_set


def _editable_changeset(user, change_set_id: int) -> ChangeSet:
    change_set = _visible_changeset(user, change_set_id)
    _ensure_can_edit_changeset(user, change_set)
    return change_set


def _ensure_can_edit_changeset(user, change_set: ChangeSet) -> None:
    if not can_edit_data(user, change_set.schema):
        raise PermissionDenied("你对该表无数据编辑权限")
