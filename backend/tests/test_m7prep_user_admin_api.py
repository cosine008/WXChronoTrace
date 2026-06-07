"""M7-prep · 账号管理运维 API 测试。"""
import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import UserProfile
from apps.audit.models import AuditLog
from apps.schemas.models import DataSchema


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(username="admin", password="pw-Strong-1")


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(username="alice", password="pw-Strong-1")


@pytest.mark.django_db
def test_create_user_requires_superuser(client, regular_user):
    client.force_authenticate(user=regular_user)

    response = client.post(
        "/api/v1/users/",
        {
            "username": "bob",
            "password": "pw-Strong-2",
            "email": "bob@example.com",
            "display_name": "Bob",
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_create_user_creates_profile_and_audits(client, admin_user):
    client.force_authenticate(user=admin_user)

    response = client.post(
        "/api/v1/users/",
        {
            "username": "bob",
            "password": "pw-Strong-2",
            "email": "bob@example.com",
            "display_name": "Bob",
            "is_superuser": False,
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["username"] == "bob"
    assert payload["display_name"] == "Bob"
    assert payload["email"] == "bob@example.com"
    assert payload["is_superuser"] is False
    created = User.objects.get(username="bob")
    assert created.check_password("pw-Strong-2")
    assert UserProfile.objects.get(user=created).display_name == "Bob"
    log = AuditLog.objects.get(action="admin.user_create", target_id=created.id)
    assert log.actor == admin_user


@pytest.mark.django_db
def test_create_user_rejects_duplicate_username(client, admin_user, regular_user):
    client.force_authenticate(user=admin_user)

    response = client.post(
        "/api/v1/users/",
        {
            "username": regular_user.username,
            "password": "pw-Strong-2",
            "email": "alice2@example.com",
        },
        format="json",
    )

    assert response.status_code == 400
    assert User.objects.filter(username=regular_user.username).count() == 1


@pytest.mark.django_db
def test_update_user_requires_superuser(client, regular_user):
    target = User.objects.create_user(username="bob", password="pw-Strong-1")
    client.force_authenticate(user=regular_user)

    response = client.patch(
        f"/api/v1/users/{target.id}",
        {"email": "bob@example.com"},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_update_user_changes_profile_role_and_audits(client, admin_user, regular_user):
    UserProfile.objects.create(user=regular_user, display_name="Alice")
    client.force_authenticate(user=admin_user)

    response = client.patch(
        f"/api/v1/users/{regular_user.id}",
        {
            "email": "alice@example.com",
            "display_name": "Alice Zhang",
            "is_superuser": True,
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "alice@example.com"
    assert payload["display_name"] == "Alice Zhang"
    assert payload["is_superuser"] is True
    regular_user.refresh_from_db()
    assert regular_user.email == "alice@example.com"
    assert regular_user.is_superuser is True
    assert UserProfile.objects.get(user=regular_user).display_name == "Alice Zhang"
    log = AuditLog.objects.get(action="admin.user_update", target_id=regular_user.id)
    assert log.detail["changed_fields"] == ["display_name", "email", "is_superuser"]


@pytest.mark.django_db
def test_update_user_blocks_admin_from_demoting_self(client, admin_user):
    client.force_authenticate(user=admin_user)

    response = client.patch(
        f"/api/v1/users/{admin_user.id}",
        {"is_superuser": False},
        format="json",
    )

    assert response.status_code == 400
    admin_user.refresh_from_db()
    assert admin_user.is_superuser is True


@pytest.mark.django_db
def test_restore_user_reenables_account_and_audits(client, admin_user):
    target = User.objects.create_user(username="left", password="pw-Strong-1", is_active=False)
    UserProfile.objects.create(
        user=target,
        display_name="Left User",
        is_active=False,
        left_at=dt.date(2026, 5, 1),
    )
    client.force_authenticate(user=admin_user)

    response = client.post(f"/api/v1/users/{target.id}/restore")

    assert response.status_code == 204
    target.refresh_from_db()
    profile = UserProfile.objects.get(user=target)
    assert target.is_active is True
    assert profile.is_active is True
    assert profile.left_at is None
    assert AuditLog.objects.filter(action="admin.user_restore", target_id=target.id).exists()


@pytest.mark.django_db
def test_reset_password_requires_superuser(client, regular_user):
    other = User.objects.create_user(username="bob", password="pw-Strong-1")
    client.force_authenticate(user=regular_user)

    response = client.post(
        f"/api/v1/users/{other.id}/reset-password",
        {"new_password": "new-Strong-pw-2"},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_reset_password_changes_password_and_audits(client, admin_user, regular_user):
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1/users/{regular_user.id}/reset-password",
        {"new_password": "new-Strong-pw-2"},
        format="json",
    )

    assert response.status_code == 204
    regular_user.refresh_from_db()
    assert regular_user.check_password("new-Strong-pw-2")
    log = AuditLog.objects.get(action="admin.password_reset", target_id=regular_user.id)
    assert log.actor == admin_user
    assert log.is_sensitive is True


@pytest.mark.django_db
def test_reset_password_rejects_short_password(client, admin_user, regular_user):
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1/users/{regular_user.id}/reset-password",
        {"new_password": "short"},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_reset_password_404_for_unknown_user(client, admin_user):
    client.force_authenticate(user=admin_user)

    response = client.post(
        "/api/v1/users/99999/reset-password",
        {"new_password": "new-Strong-pw-2"},
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_mark_left_requires_superuser(client, regular_user):
    other = User.objects.create_user(username="bob", password="pw-Strong-1")
    client.force_authenticate(user=regular_user)

    response = client.post(f"/api/v1/users/{other.id}/mark-left")

    assert response.status_code == 403


@pytest.mark.django_db
def test_mark_left_sets_profile_and_disables_user(client, admin_user, regular_user):
    client.force_authenticate(user=admin_user)

    response = client.post(f"/api/v1/users/{regular_user.id}/mark-left")

    assert response.status_code == 204
    regular_user.refresh_from_db()
    assert regular_user.is_active is False
    profile = UserProfile.objects.get(user=regular_user)
    assert profile.is_active is False
    assert profile.left_at is not None
    assert AuditLog.objects.filter(action="admin.user_left", target_id=regular_user.id).exists()


@pytest.mark.django_db
def test_mark_left_blocks_when_user_owns_active_schemas(client, admin_user, regular_user):
    blocking_schema = DataSchema.objects.create(
        schema_code="t1",
        name="表 1",
        owner=regular_user,
        created_by=regular_user,
        identity_field_key="id",
        temporal_mode="continuous",
        visibility="private",
    )
    client.force_authenticate(user=admin_user)

    response = client.post(f"/api/v1/users/{regular_user.id}/mark-left")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "OWNS_SCHEMAS"
    assert response.json()["error"]["details"]["schemas"] == [
        {"id": blocking_schema.id, "name": "表 1"}
    ]
    regular_user.refresh_from_db()
    assert regular_user.is_active is True


@pytest.mark.django_db
def test_mark_left_allows_when_only_archived_schemas(client, admin_user, regular_user):
    DataSchema.objects.create(
        schema_code="t1",
        name="表 1",
        owner=regular_user,
        created_by=regular_user,
        identity_field_key="id",
        temporal_mode="continuous",
        visibility="private",
        is_archived=True,
    )
    client.force_authenticate(user=admin_user)

    response = client.post(f"/api/v1/users/{regular_user.id}/mark-left")

    assert response.status_code == 204


@pytest.mark.django_db
def test_mark_left_404_for_unknown_user(client, admin_user):
    client.force_authenticate(user=admin_user)

    response = client.post("/api/v1/users/99999/mark-left")

    assert response.status_code == 404
    _ = dt  # silence unused import if no date assertion above


@pytest.mark.django_db
def test_user_list_default_excludes_inactive(client, admin_user, regular_user):
    User.objects.create_user(username="left", password="pw-Strong-1", is_active=False)
    client.force_authenticate(user=regular_user)

    response = client.get("/api/v1/users/")

    assert response.status_code == 200
    usernames = {item["username"] for item in response.json()}
    assert "left" not in usernames
    assert "alice" in usernames


@pytest.mark.django_db
def test_user_list_include_inactive_returns_all_for_superuser(client, admin_user):
    User.objects.create_user(username="left", password="pw-Strong-1", is_active=False)
    client.force_authenticate(user=admin_user)

    response = client.get("/api/v1/users/?include_inactive=1")

    assert response.status_code == 200
    payload = response.json()
    usernames = {item["username"] for item in payload}
    assert "left" in usernames
    left_row = next(item for item in payload if item["username"] == "left")
    assert left_row["is_employed"] is False


@pytest.mark.django_db
def test_user_list_include_inactive_forbidden_for_non_superuser(client, regular_user):
    client.force_authenticate(user=regular_user)

    response = client.get("/api/v1/users/?include_inactive=1")

    assert response.status_code == 403
