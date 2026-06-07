import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import PermissionDenied

from apps.audit.models import AuditLog
from apps.changesets.models import ChangeSet
from apps.comments.models import Comment, CommentMention, CommentReadState, CommentThread
from apps.comments.permissions import can_mutate_thread_status, can_view_comment_anchor
from apps.comments.selectors import visible_threads
from apps.comments.services import (
    add_comment,
    create_thread_with_initial_comment,
    mark_thread_read,
    reopen_thread,
    resolve_thread,
)
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="comment_perm_owner", password="pass"),
        "editor": User.objects.create_user(username="comment_perm_editor", password="pass"),
        "viewer": User.objects.create_user(username="comment_perm_viewer", password="pass"),
        "outsider": User.objects.create_user(username="comment_perm_outsider", password="pass"),
        "admin": User.objects.create_superuser(
            username="comment_perm_admin",
            email="comment_perm_admin@example.com",
            password="pass",
        ),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def comment_schema(users):
    schema = DataSchema.objects.create(
        schema_code="comment_permissions_assets",
        name="评论权限测试表",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text"},
            {"key": "amount", "label": "金额", "type": "number"},
            {
                "key": "salary",
                "label": "薪资",
                "type": "number",
                "sensitive": True,
                "masking": {"mode": "full", "visible_roles": ["owner"]},
            },
            {"key": "internal_flag", "label": "内部标记", "type": "text", "hidden": True},
        ],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role=TableCollaborator.Role.EDITOR,
        added_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["owner"],
    )
    return schema


@pytest.fixture
def entity(comment_schema, users):
    return Entity.objects.create(
        schema=comment_schema,
        business_code="ASSET-001",
        created_by=users["owner"],
    )


@pytest.fixture
def other_schema(users):
    return DataSchema.objects.create(
        schema_code="comment_permissions_other",
        name="其他评论权限测试表",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[{"key": "asset_no", "label": "资产编号", "type": "text"}],
        owner=users["owner"],
        visibility=DataSchema.Visibility.PRIVATE,
        created_by=users["owner"],
    )


@pytest.fixture
def other_entity(other_schema, users):
    return Entity.objects.create(
        schema=other_schema,
        business_code="OTHER-001",
        created_by=users["owner"],
    )


@pytest.fixture
def change_set(comment_schema, users):
    return ChangeSet.objects.create(
        schema=comment_schema,
        summary="评论 service 测试批次",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )


@pytest.fixture
def temporal_record(entity, change_set, users):
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={
            "asset_no": "ASSET-001",
            "amount": 2500,
            "salary": 120000,
            "internal_flag": "private",
        },
        valid_from=dt.date(2024, 1, 1),
        valid_to=dt.date(2024, 12, 31),
        change_set=change_set,
        recorded_by=users["owner"],
    )


def create_thread(schema, entity, creator, **overrides):
    values = {
        "schema": schema,
        "anchor_type": CommentThread.AnchorType.ROW,
        "entity": entity,
        "created_by": creator,
    }
    values.update(overrides)
    return CommentThread.objects.create(**values)


@pytest.mark.django_db
def test_can_view_comment_anchor_respects_schema_and_field_permissions(
    users,
    comment_schema,
    entity,
    other_entity,
):
    assert can_view_comment_anchor(
        users["owner"],
        comment_schema,
        CommentThread.AnchorType.ROW,
        entity=entity,
        field_key="",
    )
    assert can_view_comment_anchor(
        users["owner"],
        comment_schema,
        CommentThread.AnchorType.CELL,
        entity=entity,
        field_key="salary",
    )
    assert can_view_comment_anchor(
        users["viewer"],
        comment_schema,
        CommentThread.AnchorType.CELL,
        entity=entity,
        field_key="amount",
    )
    assert can_view_comment_anchor(
        users["viewer"],
        comment_schema,
        CommentThread.AnchorType.ROW,
        entity=entity,
        field_key="salary",
    )

    assert not can_view_comment_anchor(
        users["outsider"],
        comment_schema,
        CommentThread.AnchorType.ROW,
        entity=entity,
        field_key="",
    )
    assert not can_view_comment_anchor(
        users["viewer"],
        comment_schema,
        CommentThread.AnchorType.CELL,
        entity=entity,
        field_key="salary",
    )
    assert not can_view_comment_anchor(
        users["viewer"],
        comment_schema,
        CommentThread.AnchorType.CELL,
        entity=entity,
        field_key="internal_flag",
    )
    assert not can_view_comment_anchor(
        users["viewer"],
        comment_schema,
        CommentThread.AnchorType.CELL,
        entity=entity,
        field_key="missing_field",
    )
    assert not can_view_comment_anchor(
        users["owner"],
        comment_schema,
        CommentThread.AnchorType.ROW,
        entity=other_entity,
        field_key="",
    )


@pytest.mark.django_db
def test_can_mutate_thread_status_allows_creator_editors_and_admins(
    users,
    comment_schema,
    entity,
):
    viewer_thread = create_thread(comment_schema, entity, users["viewer"])
    owner_thread = create_thread(comment_schema, entity, users["owner"])

    assert can_mutate_thread_status(users["viewer"], viewer_thread)
    assert can_mutate_thread_status(users["editor"], viewer_thread)
    assert can_mutate_thread_status(users["owner"], viewer_thread)
    assert can_mutate_thread_status(users["admin"], viewer_thread)

    assert not can_mutate_thread_status(users["viewer"], owner_thread)
    assert not can_mutate_thread_status(users["outsider"], viewer_thread)


@pytest.mark.django_db
def test_visible_threads_filters_schema_access_and_restricted_cell_fields(
    users,
    comment_schema,
    entity,
):
    row_thread = create_thread(comment_schema, entity, users["owner"])
    amount_thread = create_thread(
        comment_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="amount",
    )
    salary_thread = create_thread(
        comment_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="salary",
    )
    hidden_thread = create_thread(
        comment_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="internal_flag",
    )

    viewer_ids = set(visible_threads(users["viewer"], comment_schema).values_list("id", flat=True))
    owner_ids = set(visible_threads(users["owner"], comment_schema).values_list("id", flat=True))
    outsider_ids = set(
        visible_threads(users["outsider"], comment_schema).values_list("id", flat=True)
    )

    assert viewer_ids == {row_thread.id, amount_thread.id}
    assert salary_thread.id in owner_ids
    assert hidden_thread.id not in owner_ids
    assert outsider_ids == set()


@pytest.mark.django_db
def test_create_thread_with_initial_comment_persists_context_mentions_read_state_and_audit(
    users,
    comment_schema,
    entity,
    temporal_record,
):
    thread = create_thread_with_initial_comment(
        actor=users["viewer"],
        schema=comment_schema,
        anchor_type=CommentThread.AnchorType.CELL,
        entity=entity,
        field_key="amount",
        context_date=dt.date(2024, 6, 5),
        record_at_creation=temporal_record,
        body="请确认这个金额。",
        mention_user_ids=[users["owner"].id, users["editor"].id, users["editor"].id],
    )

    thread.refresh_from_db()
    assert thread.anchor_type == CommentThread.AnchorType.CELL
    assert thread.field_key == "amount"
    assert thread.record_at_creation == temporal_record
    assert thread.created_at_context_date == dt.date(2024, 6, 5)
    assert thread.record_valid_from_snapshot == temporal_record.valid_from
    assert thread.record_valid_to_snapshot == temporal_record.valid_to
    assert thread.value_snapshot == 2500
    assert thread.comment_count == 1
    assert thread.last_activity_at is not None

    comment = Comment.objects.get(thread=thread)
    assert comment.body == "请确认这个金额。"
    assert comment.created_by == users["viewer"]
    assert set(
        CommentMention.objects.filter(comment=comment).values_list("user_id", flat=True)
    ) == {users["owner"].id, users["editor"].id}
    assert CommentReadState.objects.filter(thread=thread, user=users["viewer"]).exists()

    audit = AuditLog.objects.get(action="comment.thread_create")
    assert audit.actor == users["viewer"]
    assert audit.target_type == "comment_thread"
    assert audit.target_id == thread.id
    assert audit.detail["schema_id"] == comment_schema.id
    assert audit.detail["mentioned_user_ids"] == [users["owner"].id, users["editor"].id]


@pytest.mark.django_db
def test_create_thread_with_initial_comment_rejects_masked_cell_for_viewer(
    users,
    comment_schema,
    entity,
    temporal_record,
):
    with pytest.raises(PermissionDenied):
        create_thread_with_initial_comment(
            actor=users["viewer"],
            schema=comment_schema,
            anchor_type=CommentThread.AnchorType.CELL,
            entity=entity,
            field_key="salary",
            context_date=dt.date(2024, 6, 5),
            record_at_creation=temporal_record,
            body="这个薪资是否正确？",
            mention_user_ids=[],
        )


@pytest.mark.django_db
def test_add_comment_updates_counts_read_state_mentions_and_audit(
    users,
    comment_schema,
    entity,
    temporal_record,
):
    thread = create_thread_with_initial_comment(
        actor=users["viewer"],
        schema=comment_schema,
        anchor_type=CommentThread.AnchorType.ROW,
        entity=entity,
        field_key="",
        context_date=dt.date(2024, 6, 5),
        record_at_creation=temporal_record,
        body="请看这条资产。",
        mention_user_ids=[],
    )
    previous_activity = thread.last_activity_at

    updated = add_comment(
        actor=users["editor"],
        thread=thread,
        body="已经确认。",
        mention_user_ids=[users["viewer"].id],
    )

    assert updated.comment_count == 2
    assert updated.last_activity_at > previous_activity
    reply = Comment.objects.get(thread=thread, body="已经确认。")
    assert reply.created_by == users["editor"]
    assert CommentMention.objects.get(comment=reply).user == users["viewer"]
    assert CommentReadState.objects.filter(thread=thread, user=users["editor"]).exists()

    audit = AuditLog.objects.filter(action="comment.reply_create").latest("id")
    assert audit.actor == users["editor"]
    assert audit.target_id == thread.id
    assert audit.detail["comment_id"] == reply.id


@pytest.mark.django_db
def test_add_comment_rejects_thread_user_cannot_view(users, comment_schema, entity):
    thread = create_thread(
        comment_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="salary",
    )

    with pytest.raises(PermissionDenied):
        add_comment(
            actor=users["viewer"],
            thread=thread,
            body="我不应该能回复。",
            mention_user_ids=[],
        )


@pytest.mark.django_db
def test_resolve_reopen_reply_and_read_follow_thread_permissions(
    users,
    comment_schema,
    entity,
):
    thread = create_thread(comment_schema, entity, users["viewer"])
    owner_thread = create_thread(comment_schema, entity, users["owner"])

    resolved = resolve_thread(actor=users["editor"], thread=thread)
    assert resolved.status == CommentThread.Status.RESOLVED
    assert resolved.resolved_by == users["editor"]
    assert resolved.resolved_at is not None

    with pytest.raises(PermissionDenied):
        resolve_thread(actor=users["viewer"], thread=owner_thread)

    replied = add_comment(
        actor=users["viewer"],
        thread=resolved,
        body="补充说明，但不自动 reopen。",
        mention_user_ids=[],
    )
    assert replied.status == CommentThread.Status.RESOLVED

    reopened = reopen_thread(actor=users["viewer"], thread=replied)
    assert reopened.status == CommentThread.Status.OPEN
    assert reopened.resolved_by is None
    assert reopened.resolved_at is None

    marked = mark_thread_read(actor=users["viewer"], thread=reopened)
    assert marked.last_read_at >= reopened.last_activity_at
    assert not AuditLog.objects.filter(action="comment.read").exists()
    assert AuditLog.objects.filter(action="comment.thread_resolve").exists()
    assert AuditLog.objects.filter(action="comment.thread_reopen").exists()


@pytest.mark.django_db
def test_comment_threads_api_creates_lists_and_summarizes_current_anchor(
    users,
    client,
    comment_schema,
    entity,
    temporal_record,
):
    api = auth(client, users["viewer"])

    create_response = api.post(
        "/api/v1/comments/threads/",
        {
            "schema_id": comment_schema.id,
            "anchor_type": "cell",
            "entity_id": entity.id,
            "field_key": "amount",
            "context_date": "2024-06-05",
            "record_id": temporal_record.id,
            "body": "请确认金额。",
            "mention_user_ids": [users["owner"].id],
        },
        format="json",
    )

    assert create_response.status_code == 201, create_response.content.decode()
    created = create_response.json()
    assert created["anchor_type"] == "cell"
    assert created["field_key"] == "amount"
    assert created["comment_count"] == 1
    assert created["context"]["record_id_at_creation"] == temporal_record.id
    assert created["context"]["value_snapshot"] == 2500
    assert created["comments"][0]["body"] == "请确认金额。"
    assert created["comments"][0]["mentions"] == [
        {"user_id": users["owner"].id, "username": users["owner"].username}
    ]
    assert created["unread"] is False

    list_response = api.get(
        "/api/v1/comments/threads/",
        {
            "schema_id": comment_schema.id,
            "anchor_type": "cell",
            "entity_id": entity.id,
            "field_key": "amount",
        },
    )
    summary_response = api.get(
        "/api/v1/comments/summary/",
        {"schema_id": comment_schema.id, "entity_ids": str(entity.id)},
    )

    assert list_response.status_code == 200, list_response.content.decode()
    assert list_response.json()["count"] == 1
    assert list_response.json()["results"][0]["id"] == created["id"]
    assert summary_response.status_code == 200, summary_response.content.decode()
    assert summary_response.json()["schema_id"] == comment_schema.id
    assert summary_response.json()["entities"][str(entity.id)]["cells"]["amount"] == {
        "open_count": 1,
        "total_count": 1,
        "unread_count": 0,
    }


@pytest.mark.django_db
def test_comment_thread_api_reply_resolve_reopen_and_read(
    users,
    client,
    comment_schema,
    entity,
):
    thread = create_thread(comment_schema, entity, users["viewer"])
    api = auth(client, users["editor"])

    reply_response = api.post(
        f"/api/v1/comments/threads/{thread.id}/comments/",
        {"body": "已确认。", "mention_user_ids": [users["viewer"].id]},
        format="json",
    )
    resolve_response = api.patch(f"/api/v1/comments/threads/{thread.id}/resolve/")
    read_response = api.post(f"/api/v1/comments/threads/{thread.id}/read/")
    reopen_response = api.patch(f"/api/v1/comments/threads/{thread.id}/reopen/")

    assert reply_response.status_code == 201, reply_response.content.decode()
    assert reply_response.json()["comment_count"] == 1
    assert reply_response.json()["comments"][0]["body"] == "已确认。"
    assert resolve_response.status_code == 200, resolve_response.content.decode()
    assert resolve_response.json()["status"] == "resolved"
    assert resolve_response.json()["resolved_by_id"] == users["editor"].id
    assert read_response.status_code == 200, read_response.content.decode()
    assert read_response.json()["unread"] is False
    assert reopen_response.status_code == 200, reopen_response.content.decode()
    assert reopen_response.json()["status"] == "open"
    assert reopen_response.json()["resolved_by_id"] is None


@pytest.mark.django_db
def test_comment_threads_api_rejects_masked_cell_creation_for_viewer(
    users,
    client,
    comment_schema,
    entity,
    temporal_record,
):
    response = auth(client, users["viewer"]).post(
        "/api/v1/comments/threads/",
        {
            "schema_id": comment_schema.id,
            "anchor_type": "cell",
            "entity_id": entity.id,
            "field_key": "salary",
            "context_date": "2024-06-05",
            "record_id": temporal_record.id,
            "body": "请确认薪资。",
            "mention_user_ids": [],
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_comment_summary_api_validates_query_params(users, client, comment_schema):
    response = auth(client, users["viewer"]).get(
        "/api/v1/comments/summary/",
        {"schema_id": comment_schema.id, "entity_ids": "1,nope"},
    )

    assert response.status_code == 400
    assert "entity_ids" in response.json()
