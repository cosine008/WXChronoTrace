import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError

from apps.notifications.models import Notification, NotificationPreference
from apps.notifications.services import emit_notification


@pytest.mark.django_db
def test_notification_preference_defaults_to_enabled_in_app():
    user = User.objects.create_user(username="alice")

    preference = NotificationPreference.objects.create(
        user=user,
        type=Notification.Type.COMMENT_MENTION,
    )

    assert preference.in_app_enabled is True
    assert preference.external_enabled is False


@pytest.mark.django_db
def test_notification_preference_unique_per_user_and_type():
    user = User.objects.create_user(username="alice")
    NotificationPreference.objects.create(user=user, type=Notification.Type.COMMENT_MENTION)

    with pytest.raises(IntegrityError):
        NotificationPreference.objects.create(user=user, type=Notification.Type.COMMENT_MENTION)


@pytest.mark.django_db
def test_emit_notification_respects_disabled_in_app_preference():
    user = User.objects.create_user(username="alice")
    NotificationPreference.objects.create(
        user=user,
        type=Notification.Type.COMMENT_REPLY,
        in_app_enabled=False,
    )

    notification = emit_notification(
        recipient=user,
        type=Notification.Type.COMMENT_REPLY,
        title="Comment reply",
    )

    assert notification is None
    assert Notification.objects.filter(recipient=user).count() == 0


@pytest.mark.django_db
def test_preferences_api_lists_defaults_without_creating_rows(client):
    user = User.objects.create_user(username="alice", password="pw")
    client.force_login(user)

    response = client.get("/api/v1/notifications/preferences")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["results"]) == len(Notification.Type.choices)
    assert NotificationPreference.objects.filter(user=user).count() == 0
    comment_reply = next(item for item in payload["results"] if item["type"] == "comment_reply")
    assert comment_reply["in_app_enabled"] is True
    assert comment_reply["external_enabled"] is False
    assert comment_reply["updated_at"] is None


@pytest.mark.django_db
def test_preferences_api_updates_user_preference(client):
    user = User.objects.create_user(username="alice", password="pw")
    client.force_login(user)

    response = client.patch(
        "/api/v1/notifications/preferences/comment_reply",
        data={"in_app_enabled": False, "external_enabled": True},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["type"] == "comment_reply"
    assert response.json()["in_app_enabled"] is False
    assert response.json()["external_enabled"] is True
    assert NotificationPreference.objects.get(user=user, type="comment_reply").external_enabled is True


@pytest.mark.django_db
def test_preferences_api_rejects_unknown_type(client):
    user = User.objects.create_user(username="alice", password="pw")
    client.force_login(user)

    response = client.patch(
        "/api/v1/notifications/preferences/not_real",
        data={"in_app_enabled": False},
        content_type="application/json",
    )

    assert response.status_code == 400
