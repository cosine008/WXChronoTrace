from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import record_audit_log
from apps.notifications.models import Notification
from apps.notifications.services import schedule_notifications_on_commit

from .models import Comment, CommentMention, CommentReadState, CommentThread
from .permissions import can_mutate_thread_status, can_view_comment_anchor


def create_thread_with_initial_comment(
    *,
    actor: Any,
    schema: Any,
    anchor_type: str,
    entity: Any,
    field_key: str,
    context_date: Any,
    record_at_creation: Any,
    body: str,
    mention_user_ids: list[int],
) -> CommentThread:
    _ensure_phase_one_anchor(anchor_type)
    field_key = _normalized_field_key(anchor_type, field_key)
    _ensure_anchor_visible(actor, schema, anchor_type, entity, field_key)
    _ensure_record_matches_anchor(record_at_creation, entity)
    _ensure_body(body)

    with transaction.atomic():
        thread = _create_thread(
            actor,
            schema,
            anchor_type,
            entity,
            field_key,
            context_date,
            record_at_creation,
        )
        comment = Comment.objects.create(thread=thread, body=body, created_by=actor)
        mentioned_users = _create_mentions(
            comment,
            schema,
            mention_user_ids,
            anchor_type=anchor_type,
            entity=entity,
            field_key=field_key,
        )
        _sync_thread_activity(thread, comment.created_at)
        _mark_read(thread, actor)
        _audit_thread("comment.thread_create", actor, thread, comment, mentioned_users)
        _schedule_comment_mention_notifications(
            actor=actor,
            thread=thread,
            comment=comment,
            mentioned_users=mentioned_users,
        )
        return thread


def add_comment(
    *,
    actor: Any,
    thread: CommentThread,
    body: str,
    mention_user_ids: list[int],
) -> CommentThread:
    _ensure_body(body)
    with transaction.atomic():
        locked = _lock_thread(thread)
        _ensure_thread_visible(actor, locked)
        comment = Comment.objects.create(thread=locked, body=body, created_by=actor)
        mentioned_users = _create_mentions(
            comment,
            locked.schema,
            mention_user_ids,
            anchor_type=locked.anchor_type,
            entity=locked.entity,
            field_key=locked.field_key,
        )
        _sync_thread_activity(locked, comment.created_at)
        _mark_read(locked, actor)
        _audit_thread("comment.reply_create", actor, locked, comment, mentioned_users)
        _schedule_comment_mention_notifications(
            actor=actor,
            thread=locked,
            comment=comment,
            mentioned_users=mentioned_users,
        )
        _schedule_comment_reply_notifications(
            actor=actor,
            thread=locked,
            comment=comment,
            excluded_users=[actor, *mentioned_users],
        )
        return locked


def resolve_thread(*, actor: Any, thread: CommentThread) -> CommentThread:
    with transaction.atomic():
        locked = _lock_thread(thread)
        _ensure_thread_status_mutable(actor, locked)
        locked.status = CommentThread.Status.RESOLVED
        locked.resolved_by = actor
        locked.resolved_at = timezone.now()
        locked.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])
        _audit_thread("comment.thread_resolve", actor, locked)
        return locked


def reopen_thread(*, actor: Any, thread: CommentThread) -> CommentThread:
    with transaction.atomic():
        locked = _lock_thread(thread)
        _ensure_thread_status_mutable(actor, locked)
        locked.status = CommentThread.Status.OPEN
        locked.resolved_by = None
        locked.resolved_at = None
        locked.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])
        _audit_thread("comment.thread_reopen", actor, locked)
        return locked


def mark_thread_read(*, actor: Any, thread: CommentThread) -> CommentReadState:
    with transaction.atomic():
        locked = _lock_thread(thread)
        _ensure_thread_visible(actor, locked)
        return _mark_read(locked, actor)


def _create_thread(
    actor: Any,
    schema: Any,
    anchor_type: str,
    entity: Any,
    field_key: str,
    context_date: Any,
    record_at_creation: Any,
) -> CommentThread:
    thread = CommentThread(
        schema=schema,
        anchor_type=anchor_type,
        entity=entity,
        field_key=field_key,
        created_at_context_date=context_date,
        record_at_creation=record_at_creation,
        record_valid_from_snapshot=_record_attr(record_at_creation, "valid_from"),
        record_valid_to_snapshot=_record_attr(record_at_creation, "valid_to"),
        value_snapshot=_value_snapshot(anchor_type, field_key, record_at_creation),
        created_by=actor,
    )
    thread.full_clean()
    thread.save()
    return thread


def _sync_thread_activity(thread: CommentThread, activity_at: Any) -> None:
    thread.comment_count = Comment.objects.filter(thread=thread).count()
    thread.last_activity_at = activity_at or timezone.now()
    thread.save(update_fields=["comment_count", "last_activity_at", "updated_at"])


def _create_mentions(
    comment: Comment,
    schema: Any,
    user_ids: list[int],
    *,
    anchor_type: str,
    entity: Any,
    field_key: str,
) -> list[Any]:
    users_by_id = _mentionable_users_by_id(
        schema,
        user_ids,
        anchor_type=anchor_type,
        entity=entity,
        field_key=field_key,
    )
    mentioned_users = [
        users_by_id[user_id] for user_id in _unique_user_ids(user_ids) if user_id in users_by_id
    ]
    CommentMention.objects.bulk_create(
        [CommentMention(comment=comment, user=user) for user in mentioned_users],
        ignore_conflicts=True,
    )
    return mentioned_users


def _mark_read(thread: CommentThread, actor: Any) -> CommentReadState:
    read_at = max(timezone.now(), thread.last_activity_at)
    read_state, _ = CommentReadState.objects.update_or_create(
        thread=thread,
        user=actor,
        defaults={"last_read_at": read_at},
    )
    return read_state


def _audit_thread(
    action: str,
    actor: Any,
    thread: CommentThread,
    comment: Comment | None = None,
    mentioned_users: list[Any] | None = None,
) -> None:
    detail = _audit_detail(thread, comment, mentioned_users or [])
    record_audit_log(
        actor=actor,
        action=action,
        target_type="comment_thread",
        target_id=thread.id,
        detail=detail,
    )


def _audit_detail(
    thread: CommentThread,
    comment: Comment | None,
    mentioned_users: list[Any],
) -> dict[str, Any]:
    detail = {
        "schema_id": thread.schema_id,
        "anchor_type": thread.anchor_type,
        "entity_id": thread.entity_id,
        "field_key": thread.field_key,
        "mentioned_user_ids": [user.id for user in mentioned_users],
    }
    if comment is not None:
        detail["comment_id"] = comment.id
    return detail


def _schedule_comment_mention_notifications(
    *,
    actor: Any,
    thread: CommentThread,
    comment: Comment,
    mentioned_users: list[Any],
) -> None:
    _schedule_comment_notifications(
        actor=actor,
        thread=thread,
        comment=comment,
        recipients=mentioned_users,
        notification_type=Notification.Type.COMMENT_MENTION,
        title="你被提及",
        body_action="在评论中提到了你",
        dedupe_prefix="comment_mention",
    )


def _schedule_comment_reply_notifications(
    *,
    actor: Any,
    thread: CommentThread,
    comment: Comment,
    excluded_users: list[Any],
) -> None:
    recipients = _comment_reply_recipients(thread, excluded_users)
    _schedule_comment_notifications(
        actor=actor,
        thread=thread,
        comment=comment,
        recipients=recipients,
        notification_type=Notification.Type.COMMENT_REPLY,
        title="评论有新回复",
        body_action="回复了你参与的评论",
        dedupe_prefix="comment_reply",
    )


def _schedule_comment_notifications(
    *,
    actor: Any,
    thread: CommentThread,
    comment: Comment,
    recipients: list[Any],
    notification_type: str,
    title: str,
    body_action: str,
    dedupe_prefix: str,
) -> None:
    payload = {"schema_id": thread.schema_id, "thread_id": thread.id, "comment_id": comment.id}
    schedule_notifications_on_commit(
        recipients=recipients,
        actor=actor,
        type=notification_type,
        title=title,
        body=_comment_notification_body(actor, thread, body_action),
        target_kind="comment_thread",
        target_id=str(thread.id),
        target_url=_comment_thread_url(thread),
        payload=payload,
        dedupe_key_builder=lambda recipient: f"{dedupe_prefix}:{comment.id}:{recipient.id}",
    )


def _comment_reply_recipients(thread: CommentThread, excluded_users: list[Any]) -> list[Any]:
    excluded_ids = {user.id for user in excluded_users if getattr(user, "id", None)}
    recipient_ids = set(
        Comment.objects.filter(thread=thread)
        .exclude(created_by_id__in=excluded_ids)
        .values_list("created_by_id", flat=True)
    )
    if thread.created_by_id:
        recipient_ids.add(thread.created_by_id)
    recipient_ids -= excluded_ids
    return list(get_user_model().objects.filter(id__in=recipient_ids).order_by("id"))


def _comment_notification_body(actor: Any, thread: CommentThread, action: str) -> str:
    actor_name = _actor_display_name(actor)
    schema_name = getattr(thread.schema, "name", "数据表")
    return f"{actor_name}{action}：{schema_name}"


def _actor_display_name(actor: Any) -> str:
    profile = getattr(actor, "profile", None)
    return (
        getattr(profile, "display_name", "")
        or actor.get_full_name()
        or getattr(actor, "username", "")
        or "系统"
    )


def _comment_thread_url(thread: CommentThread) -> str:
    params = {
        "comment_thread": thread.id,
        "comment_anchor": thread.anchor_type,
        "entity_id": thread.entity_id,
    }
    if thread.anchor_type == CommentThread.AnchorType.CELL:
        params["field_key"] = thread.field_key
    query = urlencode({key: value for key, value in params.items() if value not in (None, "")})
    return f"/schemas/{thread.schema_id}/records?{query}"


def _ensure_phase_one_anchor(anchor_type: str) -> None:
    if anchor_type not in {CommentThread.AnchorType.ROW, CommentThread.AnchorType.CELL}:
        raise ValidationError({"anchor_type": "第一期只支持 row/cell 评论。"})


def _normalized_field_key(anchor_type: str, field_key: str) -> str:
    if anchor_type == CommentThread.AnchorType.ROW:
        return ""
    return str(field_key or "").strip()


def _ensure_anchor_visible(
    actor: Any,
    schema: Any,
    anchor_type: str,
    entity: Any,
    field_key: str,
) -> None:
    if not can_view_comment_anchor(actor, schema, anchor_type, entity, field_key):
        raise PermissionDenied("你无权访问该评论锚点。")


def _ensure_thread_visible(actor: Any, thread: CommentThread) -> None:
    _ensure_anchor_visible(
        actor, thread.schema, thread.anchor_type, thread.entity, thread.field_key
    )


def _ensure_thread_status_mutable(actor: Any, thread: CommentThread) -> None:
    _ensure_thread_visible(actor, thread)
    if not can_mutate_thread_status(actor, thread):
        raise PermissionDenied("你无权变更该评论线程状态。")


def _ensure_record_matches_anchor(record: Any, entity: Any) -> None:
    if record is not None and getattr(record, "entity_id", None) != getattr(entity, "id", None):
        raise ValidationError({"record_id": "record_at_creation 必须属于当前 entity。"})


def _ensure_body(body: str) -> None:
    if not isinstance(body, str) or not body.strip():
        raise ValidationError({"body": "评论正文不能为空。"})


def _lock_thread(thread: CommentThread) -> CommentThread:
    return CommentThread.objects.select_for_update().select_related("schema").get(pk=thread.pk)


def _mentionable_users_by_id(
    schema: Any,
    user_ids: list[int],
    *,
    anchor_type: str,
    entity: Any,
    field_key: str,
) -> dict[int, Any]:
    user_model = get_user_model()
    users = user_model.objects.filter(id__in=_unique_user_ids(user_ids))
    return {
        user.id: user
        for user in users
        if can_view_comment_anchor(user, schema, anchor_type, entity, field_key)
    }


def _unique_user_ids(user_ids: list[int]) -> list[int]:
    unique_ids = []
    for user_id in user_ids or []:
        if isinstance(user_id, bool) or not isinstance(user_id, int) or user_id <= 0:
            continue
        if user_id not in unique_ids:
            unique_ids.append(user_id)
    return unique_ids


def _record_attr(record: Any, attr: str) -> Any:
    return getattr(record, attr, None) if record is not None else None


def _value_snapshot(anchor_type: str, field_key: str, record: Any) -> Any:
    if anchor_type != CommentThread.AnchorType.CELL or record is None:
        return None
    data_payload = getattr(record, "data_payload", None)
    return data_payload.get(field_key) if isinstance(data_payload, dict) else None
