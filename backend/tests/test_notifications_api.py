import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone

from apps.notifications.models import Notification


@pytest.mark.django_db
def test_notification_summary_returns_only_current_user_unread(client):
    alice = User.objects.create_user(username="alice", password="pw")
    bob = User.objects.create_user(username="bob", password="pw")
    Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Alice unread",
    )
    Notification.objects.create(
        recipient=bob,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Bob unread",
    )

    client.force_login(alice)
    response = client.get("/api/v1/notifications/summary")

    assert response.status_code == 200
    assert response.json()["unread_count"] == 1


@pytest.mark.django_db
def test_notification_list_filters_unread_and_excludes_archived(client):
    alice = User.objects.create_user(username="alice", password="pw")
    unread = Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Unread",
    )
    Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Read",
        read_at=timezone.now(),
    )
    Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Archived",
        archived_at=timezone.now(),
    )

    client.force_login(alice)
    response = client.get("/api/v1/notifications", {"status": "unread"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == unread.id


@pytest.mark.django_db
def test_mark_notification_read_requires_owner(client):
    alice = User.objects.create_user(username="alice", password="pw")
    bob = User.objects.create_user(username="bob", password="pw")
    notification = Notification.objects.create(
        recipient=bob,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Bob notification",
    )

    client.force_login(alice)
    response = client.post(f"/api/v1/notifications/{notification.id}/read")

    assert response.status_code == 404


@pytest.mark.django_db
def test_mark_all_notifications_read_updates_current_user_only(client):
    alice = User.objects.create_user(username="alice", password="pw")
    bob = User.objects.create_user(username="bob", password="pw")
    Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Alice",
    )
    bob_notification = Notification.objects.create(
        recipient=bob,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Bob",
    )

    client.force_login(alice)
    response = client.post(
        "/api/v1/notifications/mark-read", data={}, content_type="application/json"
    )

    bob_notification.refresh_from_db()
    assert response.status_code == 200
    assert response.json()["updated_count"] == 1
    assert bob_notification.read_at is None


@pytest.mark.django_db
def test_expired_notifications_are_hidden_from_summary_and_default_list(client):
    alice = User.objects.create_user(username="alice", password="pw")
    Notification.objects.create(
        recipient=alice,
        type=Notification.Type.SYSTEM_NOTICE,
        title="Expired",
        expires_at=timezone.now() - dt.timedelta(seconds=1),
    )

    client.force_login(alice)
    summary = client.get("/api/v1/notifications/summary")
    inbox = client.get("/api/v1/notifications")

    assert summary.status_code == 200
    assert inbox.status_code == 200
    assert summary.json()["unread_count"] == 0
    assert inbox.json()["count"] == 0
