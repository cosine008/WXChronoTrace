import datetime as dt

import pytest
from django.contrib.auth.models import User

from apps.changesets.models import ChangeSet
from apps.comments.models import Comment
from apps.comments.services import add_comment, create_thread_with_initial_comment
from apps.notifications.models import Notification
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="notification_comment_owner", password="pass"),
        "editor": User.objects.create_user(username="notification_comment_editor", password="pass"),
        "viewer": User.objects.create_user(username="notification_comment_viewer", password="pass"),
        "reviewer": User.objects.create_user(
            username="notification_comment_reviewer", password="pass"
        ),
    }


@pytest.fixture
def comment_schema(users):
    schema = DataSchema.objects.create(
        schema_code="notification_comment_schema",
        name="Notification comment schema",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "Asset No", "type": "text"},
            {"key": "amount", "label": "Amount", "type": "number"},
            {
                "key": "salary",
                "label": "Salary",
                "type": "number",
                "sensitive": True,
                "masking": {"mode": "full", "visible_roles": ["owner"]},
            },
        ],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    for user in (users["editor"], users["viewer"], users["reviewer"]):
        TableCollaborator.objects.create(
            schema=schema,
            user=user,
            role=TableCollaborator.Role.EDITOR,
            added_by=users["owner"],
        )
    return schema


@pytest.fixture
def entity(comment_schema, users):
    return Entity.objects.create(
        schema=comment_schema,
        business_code="NOTIFICATION-ASSET-001",
        created_by=users["owner"],
    )


@pytest.fixture
def change_set(comment_schema, users):
    return ChangeSet.objects.create(
        schema=comment_schema,
        summary="Notification comment test change set",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
    )


@pytest.fixture
def temporal_record(entity, change_set, users):
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": "NOTIFICATION-ASSET-001", "amount": 2500},
        valid_from=dt.date(2024, 1, 1),
        valid_to=dt.date(2024, 12, 31),
        change_set=change_set,
        recorded_by=users["owner"],
    )


@pytest.mark.django_db(transaction=True)
def test_comment_mentions_create_notifications_and_never_notify_actor(
    users,
    comment_schema,
    entity,
    temporal_record,
):
    actor = users["viewer"]

    thread = create_thread_with_initial_comment(
        actor=actor,
        schema=comment_schema,
        anchor_type="row",
        entity=entity,
        field_key="",
        context_date=dt.date(2024, 6, 5),
        record_at_creation=temporal_record,
        body="Please review this asset.",
        mention_user_ids=[users["owner"].id, users["editor"].id, actor.id],
    )

    comment = Comment.objects.get(thread=thread)
    notifications = Notification.objects.filter(type=Notification.Type.COMMENT_MENTION)

    assert set(notifications.values_list("recipient_id", flat=True)) == {
        users["owner"].id,
        users["editor"].id,
    }
    assert (
        Notification.objects.filter(
            recipient=users["owner"],
            type=Notification.Type.COMMENT_MENTION,
            target_kind="comment_thread",
        ).count()
        == 1
    )
    assert (
        Notification.objects.filter(
            recipient=users["editor"],
            type=Notification.Type.COMMENT_MENTION,
            target_kind="comment_thread",
        ).count()
        == 1
    )
    assert Notification.objects.filter(recipient=actor).count() == 0

    for notification in notifications:
        assert notification.actor == actor
        assert notification.target_id == str(thread.id)
        assert (
            notification.target_url == f"/schemas/{comment_schema.id}/records?"
            f"comment_thread={thread.id}&comment_anchor=row&entity_id={entity.id}"
        )
        assert notification.payload == {
            "schema_id": comment_schema.id,
            "thread_id": thread.id,
            "comment_id": comment.id,
        }
        assert (
            notification.dedupe_key == f"comment_mention:{comment.id}:{notification.recipient_id}"
        )


@pytest.mark.django_db(transaction=True)
def test_comment_replies_notify_prior_participants_excluding_actor_and_mentioned_users(
    users,
    comment_schema,
    entity,
    temporal_record,
):
    thread = create_thread_with_initial_comment(
        actor=users["owner"],
        schema=comment_schema,
        anchor_type="row",
        entity=entity,
        field_key="",
        context_date=dt.date(2024, 6, 5),
        record_at_creation=temporal_record,
        body="Initial comment.",
        mention_user_ids=[],
    )
    add_comment(
        actor=users["reviewer"],
        thread=thread,
        body="Prior reviewer reply.",
        mention_user_ids=[],
    )
    add_comment(
        actor=users["editor"],
        thread=thread,
        body="Prior editor reply.",
        mention_user_ids=[],
    )
    Notification.objects.all().delete()

    updated = add_comment(
        actor=users["viewer"],
        thread=thread,
        body="Final viewer reply.",
        mention_user_ids=[users["editor"].id],
    )

    final_comment = Comment.objects.get(thread=thread, body="Final viewer reply.")
    reply_notifications = Notification.objects.filter(type=Notification.Type.COMMENT_REPLY)

    assert updated.id == thread.id
    assert set(reply_notifications.values_list("recipient_id", flat=True)) == {
        users["owner"].id,
        users["reviewer"].id,
    }
    assert (
        Notification.objects.filter(
            recipient=thread.created_by,
            type=Notification.Type.COMMENT_REPLY,
            target_id=str(thread.id),
        ).count()
        == 1
    )
    assert not Notification.objects.filter(
        recipient=users["editor"],
        type=Notification.Type.COMMENT_REPLY,
    ).exists()
    assert not Notification.objects.filter(recipient=users["viewer"]).exists()
    assert (
        Notification.objects.filter(
            recipient=users["editor"],
            type=Notification.Type.COMMENT_MENTION,
            target_kind="comment_thread",
        ).count()
        == 1
    )

    for notification in reply_notifications:
        assert notification.actor == users["viewer"]
        assert notification.target_kind == "comment_thread"
        assert notification.target_id == str(thread.id)
        assert (
            notification.target_url == f"/schemas/{comment_schema.id}/records?"
            f"comment_thread={thread.id}&comment_anchor=row&entity_id={entity.id}"
        )
        assert notification.payload == {
            "schema_id": comment_schema.id,
            "thread_id": thread.id,
            "comment_id": final_comment.id,
        }
        assert (
            notification.dedupe_key
            == f"comment_reply:{final_comment.id}:{notification.recipient_id}"
        )


@pytest.mark.django_db(transaction=True)
def test_comment_mentions_skip_users_without_anchor_visibility(
    users,
    comment_schema,
    entity,
    temporal_record,
):
    thread = create_thread_with_initial_comment(
        actor=users["owner"],
        schema=comment_schema,
        anchor_type="cell",
        entity=entity,
        field_key="salary",
        context_date=dt.date(2024, 6, 5),
        record_at_creation=temporal_record,
        body="Please review this salary value.",
        mention_user_ids=[users["viewer"].id, users["editor"].id],
    )

    notification_recipients = set(
        Notification.objects.filter(
            type=Notification.Type.COMMENT_MENTION,
            target_id=str(thread.id),
        ).values_list("recipient_id", flat=True)
    )

    assert users["viewer"].id not in notification_recipients
    assert users["editor"].id not in notification_recipients
