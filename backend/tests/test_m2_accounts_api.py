import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.audit.models import AuditLog


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def _clear_lockout_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_user_list_requires_authentication(client):
    response = client.get("/api/v1/users/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_csrf_endpoint_sets_cookie_without_authentication():
    csrf_client = APIClient(enforce_csrf_checks=True)

    response = csrf_client.get("/api/v1/auth/csrf")

    assert response.status_code == 200
    assert "csrftoken" in response.cookies


@pytest.mark.django_db
def test_user_list_returns_active_users_for_collaborator_picker(client):
    admin = User.objects.create_superuser(
        username="admin",
        email="admin@example.com",
        password="pass",
    )
    owner = User.objects.create_user(username="owner", password="pass")
    inactive = User.objects.create_user(username="inactive", password="pass", is_active=False)
    User.objects.create_user(username="editor", password="pass")
    client.force_authenticate(user=owner)

    response = client.get("/api/v1/users/")

    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [
        admin.id,
        owner.id,
        User.objects.get(username="editor").id,
    ]
    assert all(item["is_employed"] is True for item in payload)
    assert inactive.id not in [item["id"] for item in payload]


@pytest.mark.django_db
def test_login_success_writes_audit_log_and_short_session(client):
    user = User.objects.create_user(username="alice", password="pw-Strong-1")

    response = client.post(
        "/api/v1/auth/login",
        {"username": "alice", "password": "pw-Strong-1"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["username"] == "alice"
    assert response.json()["is_employed"] is True
    log = AuditLog.objects.get(action="login", actor=user)
    assert log.target_type == "user"
    assert log.detail["remember"] is False


@pytest.mark.django_db
def test_login_with_remember_extends_session(client):
    User.objects.create_user(username="bob", password="pw-Strong-1")

    response = client.post(
        "/api/v1/auth/login",
        {"username": "bob", "password": "pw-Strong-1", "remember": True},
        format="json",
    )

    assert response.status_code == 200
    # Django 把 session expiry 通过 Set-Cookie 的 Max-Age 暴露
    cookie = response.cookies.get("sessionid")
    assert cookie is not None
    assert int(cookie["max-age"]) == 60 * 60 * 24 * 7


@pytest.mark.django_db
def test_login_failed_writes_audit_log_for_existing_user(client):
    user = User.objects.create_user(username="carol", password="pw-Strong-1")

    response = client.post(
        "/api/v1/auth/login",
        {"username": "carol", "password": "wrong"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    log = AuditLog.objects.get(action="login_failed", actor=user)
    assert log.detail["remaining_attempts"] == 4


@pytest.mark.django_db
def test_login_failed_unknown_user_does_not_write_audit(client):
    response = client.post(
        "/api/v1/auth/login",
        {"username": "ghost", "password": "wrong"},
        format="json",
    )

    assert response.status_code == 400
    assert AuditLog.objects.filter(action="login_failed").count() == 0


@pytest.mark.django_db
def test_login_locks_after_five_failures(client):
    User.objects.create_user(username="dave", password="pw-Strong-1")

    for _ in range(5):
        client.post(
            "/api/v1/auth/login",
            {"username": "dave", "password": "wrong"},
            format="json",
        )

    response = client.post(
        "/api/v1/auth/login",
        {"username": "dave", "password": "pw-Strong-1"},
        format="json",
    )

    assert response.status_code == 423
    assert response.json()["error"]["code"] == "ACCOUNT_LOCKED"


@pytest.mark.django_db
def test_logout_writes_audit_log(client):
    user = User.objects.create_user(username="erin", password="pw-Strong-1")
    client.force_authenticate(user=user)

    response = client.post("/api/v1/auth/logout")

    assert response.status_code == 204
    assert AuditLog.objects.filter(action="logout", actor=user).exists()
