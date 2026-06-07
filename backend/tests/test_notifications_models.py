import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError

from apps.notifications.models import Notification


@pytest.mark.django_db
def test_notification_defaults_to_unread_and_unarchived():
    user = User.objects.create_user(username="alice")

    notification = Notification.objects.create(
        recipient=user,
        type=Notification.Type.SYSTEM_NOTICE,
        title="系统通知",
    )

    assert notification.severity == Notification.Severity.INFO
    assert notification.body == ""
    assert notification.read_at is None
    assert notification.archived_at is None
    assert notification.payload == {}


@pytest.mark.django_db
def test_notification_dedupe_key_is_unique_per_recipient_when_present():
    alice = User.objects.create_user(username="alice")
    bob = User.objects.create_user(username="bob")

    Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="第一条",
        dedupe_key="same-event",
    )
    Notification.objects.create(
        recipient=bob,
        type=Notification.Type.SYSTEM_NOTICE,
        title="另一个用户的同事件",
        dedupe_key="same-event",
    )

    with pytest.raises(IntegrityError):
        Notification.objects.create(
            recipient=alice,
            type=Notification.Type.SYSTEM_NOTICE,
            title="重复事件",
            dedupe_key="same-event",
        )


@pytest.mark.django_db
def test_blank_dedupe_key_allows_multiple_notifications_for_same_user():
    user = User.objects.create_user(username="alice")

    Notification.objects.create(
        recipient=user,
        type=Notification.Type.SYSTEM_NOTICE,
        title="第一条",
    )
    Notification.objects.create(
        recipient=user,
        type=Notification.Type.SYSTEM_NOTICE,
        title="第二条",
    )

    assert Notification.objects.filter(recipient=user).count() == 2
