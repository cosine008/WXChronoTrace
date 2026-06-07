import pytest
from django.contrib.auth.models import User

from apps.notifications.models import Notification
from apps.notifications.services import (
    archive_notification,
    emit_notification,
    emit_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)


@pytest.mark.django_db
def test_emit_notification_creates_notification_with_safe_target_url():
    user = User.objects.create_user(username="alice")

    notification = emit_notification(
        recipient=user,
        type=Notification.Type.SYSTEM_NOTICE,
        title="系统通知",
        target_url="/workbench",
        payload={"source": "test"},
    )

    assert notification is not None
    assert notification.recipient == user
    assert notification.target_url == "/workbench"
    assert notification.payload == {"source": "test"}


@pytest.mark.django_db
def test_emit_notification_rejects_external_target_url():
    user = User.objects.create_user(username="alice")

    with pytest.raises(ValueError):
        emit_notification(
            recipient=user,
            type=Notification.Type.SYSTEM_NOTICE,
            title="恶意链接",
            target_url="https://example.com",
        )


@pytest.mark.django_db
def test_emit_notification_rejects_protocol_relative_target_url():
    user = User.objects.create_user(username="alice")

    with pytest.raises(ValueError):
        emit_notification(
            recipient=user,
            type=Notification.Type.SYSTEM_NOTICE,
            title="恶意链接",
            target_url="//example.com",
        )


@pytest.mark.django_db
def test_emit_notification_dedupes_same_event_for_same_recipient():
    user = User.objects.create_user(username="alice")

    first = emit_notification(
        recipient=user,
        type=Notification.Type.SYSTEM_NOTICE,
        title="第一条",
        dedupe_key="event-1",
    )
    second = emit_notification(
        recipient=user,
        type=Notification.Type.SYSTEM_NOTICE,
        title="第二条",
        dedupe_key="event-1",
    )

    assert first is not None
    assert second == first
    assert Notification.objects.filter(recipient=user, dedupe_key="event-1").count() == 1


@pytest.mark.django_db
def test_emit_notifications_excludes_actor_and_dedupes_recipients():
    actor = User.objects.create_user(username="actor")
    alice = User.objects.create_user(username="alice")

    created = emit_notifications(
        recipients=[actor, alice, alice],
        actor=actor,
        type=Notification.Type.SYSTEM_NOTICE,
        title="批量通知",
        dedupe_key_builder=lambda recipient: f"batch:{recipient.id}",
    )

    assert len(created) == 1
    assert created[0].recipient == alice


@pytest.mark.django_db
def test_mark_read_and_archive_only_affect_actor_notifications():
    alice = User.objects.create_user(username="alice")
    bob = User.objects.create_user(username="bob")
    alice_notification = Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Alice",
    )
    bob_notification = Notification.objects.create(
        recipient=bob,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Bob",
    )

    marked = mark_notification_read(actor=alice, notification_id=alice_notification.id)
    archived = archive_notification(actor=alice, notification_id=alice_notification.id)
    updated_count = mark_all_notifications_read(actor=alice)

    bob_notification.refresh_from_db()
    assert marked.read_at is not None
    assert archived.archived_at is not None
    assert updated_count == 0
    assert bob_notification.read_at is None


@pytest.mark.django_db
def test_mark_all_notifications_read_ignores_expired_notifications():
    import datetime as dt

    from django.utils import timezone

    alice = User.objects.create_user(username="alice")
    Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Expired",
        expires_at=timezone.now() - dt.timedelta(seconds=1),
    )

    updated_count = mark_all_notifications_read(actor=alice)

    assert updated_count == 0
    assert Notification.objects.get(recipient=alice).read_at is None
