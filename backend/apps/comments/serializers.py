from __future__ import annotations

from typing import Any

from .models import Comment, CommentReadState, CommentThread


def serialize_thread(thread: CommentThread, user: Any) -> dict[str, Any]:
    return {
        "id": thread.id,
        "schema_id": thread.schema_id,
        "anchor_type": thread.anchor_type,
        "entity_id": thread.entity_id,
        "field_key": thread.field_key,
        "status": thread.status,
        "created_by_id": thread.created_by_id,
        "created_by_username": _username(thread.created_by),
        "created_at": _isoformat(thread.created_at),
        "updated_at": _isoformat(thread.updated_at),
        "last_activity_at": _isoformat(thread.last_activity_at),
        "resolved_by_id": thread.resolved_by_id,
        "resolved_by_username": _username(thread.resolved_by),
        "resolved_at": _isoformat(thread.resolved_at),
        "comment_count": thread.comment_count,
        "context": _thread_context(thread),
        "comments": [serialize_comment(comment) for comment in _thread_comments(thread)],
        "unread": thread_is_unread(thread, user),
    }


def serialize_comment(comment: Comment) -> dict[str, Any]:
    return {
        "id": comment.id,
        "body": comment.body,
        "body_format": comment.body_format,
        "created_by_id": comment.created_by_id,
        "created_by_username": _username(comment.created_by),
        "created_at": _isoformat(comment.created_at),
        "edited_at": _isoformat(comment.edited_at),
        "deleted_at": _isoformat(comment.deleted_at),
        "is_system": comment.is_system,
        "mentions": [_serialize_mention(mention) for mention in comment.mentions.all()],
    }


def thread_is_unread(thread: CommentThread, user: Any) -> bool:
    read_states = getattr(thread, "current_user_read_states", None)
    if read_states is None:
        read_states = list(CommentReadState.objects.filter(thread=thread, user=user))
    if not read_states:
        return True
    return read_states[0].last_read_at < thread.last_activity_at


def _thread_context(thread: CommentThread) -> dict[str, Any]:
    return {
        "created_at_context_date": _isoformat(thread.created_at_context_date),
        "record_id_at_creation": thread.record_at_creation_id,
        "valid_from": _isoformat(thread.record_valid_from_snapshot),
        "valid_to": _isoformat(thread.record_valid_to_snapshot),
        "value_snapshot": thread.value_snapshot,
    }


def _thread_comments(thread: CommentThread) -> list[Comment]:
    return sorted(thread.comments.all(), key=lambda comment: (comment.created_at, comment.id))


def _serialize_mention(mention: Any) -> dict[str, Any]:
    return {"user_id": mention.user_id, "username": _username(mention.user)}


def _username(user: Any) -> str:
    return getattr(user, "username", "") if user is not None else ""


def _isoformat(value: Any) -> str | None:
    return value.isoformat() if value is not None else None
