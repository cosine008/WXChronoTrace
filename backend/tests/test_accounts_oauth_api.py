import pytest
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ExternalIdentity, OAuthLoginIntent, UserProfile
from apps.accounts.oauth.errors import AccountDisabled, OAuthCodeExchangeFailed
from apps.accounts.oauth.profiles import NormalizedExternalProfile
from apps.audit.models import AuditLog


@pytest.fixture
def client():
    return APIClient()


def fake_github_profile():
    return NormalizedExternalProfile(
        provider="github",
        tenant_id=None,
        provider_account_id="1001",
        union_id=None,
        open_id=None,
        external_username="octocat",
        nickname="Octo Cat",
        avatar_url="https://example.test/avatar.png",
        email="octo@example.test",
        phone=None,
        raw_profile={"id": 1001, "login": "octocat"},
    )


def fake_wechat_miniprogram_profile():
    return NormalizedExternalProfile(
        provider="wechat_miniprogram",
        tenant_id="wx-app-1",
        provider_account_id="union-1",
        union_id="union-1",
        open_id="openid-1",
        external_username=None,
        nickname="WeChat User A",
        avatar_url="https://example.test/wx.png",
        email=None,
        phone=None,
        raw_profile={"openid": "openid-1", "unionid": "union-1", "session_key": "secret"},
    )


def create_oauth_callback_intent(state="state-123"):
    return OAuthLoginIntent.objects.create(
        state=state,
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )


def patch_github_adapter(monkeypatch):
    class FakeGitHubAdapter:
        provider = "github"

        def fetch_profile_by_code(self, code, redirect_uri):
            return fake_github_profile()

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_web_provider",
        lambda provider: FakeGitHubAdapter(),
    )


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"}, OAUTH_GITHUB_CLIENT_ID="client-123")
def test_oauth_start_creates_intent_and_returns_authorization_url(client):
    response = client.get("/api/v1/auth/oauth/github/start?next=/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "github"
    assert payload["authorization_url"].startswith("https://github.com/login/oauth/authorize?")
    assert OAuthLoginIntent.objects.filter(
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/dashboard",
        state=payload["state"],
    ).exists()


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"}, OAUTH_GITHUB_CLIENT_ID="client-123")
def test_oauth_start_sanitizes_external_next_path(client):
    response = client.get("/api/v1/auth/oauth/github/start?next=https://evil.test/x")

    assert response.status_code == 200
    assert OAuthLoginIntent.objects.get(state=response.json()["state"]).next_path == "/"


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"}, OAUTH_AUTO_REGISTER_ENABLED=True)
def test_oauth_callback_registers_user_logs_in_and_returns_me_payload(client, monkeypatch):
    intent = OAuthLoginIntent.objects.create(
        state="state-123",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/dashboard",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    class FakeGitHubAdapter:
        provider = "github"

        def fetch_profile_by_code(self, code, redirect_uri):
            assert code == "code-123"
            return fake_github_profile()

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_web_provider",
        lambda provider: FakeGitHubAdapter(),
    )

    response = client.get("/api/v1/auth/oauth/github/callback?code=code-123&state=state-123")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "registered"
    assert payload["is_new_user"] is True
    assert payload["next"] == "/dashboard"
    assert payload["csrf_token"]
    assert payload["user"]["display_name"] == "Octo Cat"
    assert ExternalIdentity.objects.filter(provider="github", provider_account_id="1001").exists()
    intent.refresh_from_db()
    assert intent.consumed_at is not None
    assert AuditLog.objects.filter(action="oauth.register").exists()


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_oauth_callback_rejects_consumed_state(client):
    OAuthLoginIntent.objects.create(
        state="state-used",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/",
        consumed_at=timezone.now(),
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    response = client.get("/api/v1/auth/oauth/github/callback?code=code-123&state=state-used")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OAUTH_STATE_CONSUMED"


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github", "wechat_web"})
def test_oauth_callback_rejects_provider_mismatched_state(client, monkeypatch):
    OAuthLoginIntent.objects.create(
        state="state-123",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    class FakeAdapter:
        provider = "wechat_web"

        def fetch_profile_by_code(self, code, redirect_uri):
            return fake_github_profile()

    monkeypatch.setattr("apps.accounts.oauth.views.get_web_provider", lambda provider: FakeAdapter())

    response = client.get("/api/v1/auth/oauth/wechat_web/callback?code=code-123&state=state-123")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OAUTH_STATE_INVALID"


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_oauth_callback_error_response_does_not_leak_token_values(client, monkeypatch):
    OAuthLoginIntent.objects.create(
        state="state-123",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    class FakeGitHubAdapter:
        provider = "github"

        def fetch_profile_by_code(self, code, redirect_uri):
            raise OAuthCodeExchangeFailed("access_token secret-token-123")

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_web_provider",
        lambda provider: FakeGitHubAdapter(),
    )

    response = client.get("/api/v1/auth/oauth/github/callback?code=code-123&state=state-123")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OAUTH_CODE_EXCHANGE_FAILED"
    assert "secret-token-123" not in str(response.json())


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_oauth_callback_rejects_disabled_existing_user(client, monkeypatch):
    user = User.objects.create_user(username="disabled", is_active=False)
    ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )
    OAuthLoginIntent.objects.create(
        state="state-123",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    class FakeGitHubAdapter:
        provider = "github"

        def fetch_profile_by_code(self, code, redirect_uri):
            return fake_github_profile()

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_web_provider",
        lambda provider: FakeGitHubAdapter(),
    )

    response = client.get("/api/v1/auth/oauth/github/callback?code=code-123&state=state-123")

    assert response.status_code == 403
    assert response.json()["error"] == {
        "code": "ACCOUNT_DISABLED",
        "message": AccountDisabled.message,
    }


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_oauth_callback_rejects_profile_inactive_existing_user(client, monkeypatch):
    user = User.objects.create_user(username="profile-inactive")
    UserProfile.objects.create(user=user, is_active=False)
    ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )
    create_oauth_callback_intent()
    patch_github_adapter(monkeypatch)

    response = client.get("/api/v1/auth/oauth/github/callback?code=code-123&state=state-123")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_oauth_callback_rejects_left_existing_user(client, monkeypatch):
    user = User.objects.create_user(username="left-user")
    UserProfile.objects.create(user=user, left_at=timezone.now().date())
    ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )
    create_oauth_callback_intent()
    patch_github_adapter(monkeypatch)

    response = client.get("/api/v1/auth/oauth/github/callback?code=code-123&state=state-123")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_bind_callback_binds_identity_to_authenticated_user(client, monkeypatch):
    user = User.objects.create_user(username="alice", password="pw-Strong-1")
    client.force_authenticate(user=user)
    OAuthLoginIntent.objects.create(
        state="bind-state",
        provider="github",
        mode=OAuthLoginIntent.Mode.BIND,
        requested_by=user,
        next_path="/settings/account",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    class FakeGitHubAdapter:
        provider = "github"

        def fetch_profile_by_code(self, code, redirect_uri):
            return fake_github_profile()

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_web_provider",
        lambda provider: FakeGitHubAdapter(),
    )

    response = client.get("/api/v1/auth/oauth/github/bind/callback?code=code-123&state=bind-state")

    assert response.status_code == 200
    assert response.json()["status"] == "bound"
    assert ExternalIdentity.objects.get(provider="github", provider_account_id="1001").user == user


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_bind_callback_rejects_state_requested_by_another_user(client, monkeypatch):
    owner = User.objects.create_user(username="owner", password="pw-Strong-1")
    attacker = User.objects.create_user(username="attacker", password="pw-Strong-1")
    client.force_authenticate(user=attacker)
    OAuthLoginIntent.objects.create(
        state="bind-state",
        provider="github",
        mode=OAuthLoginIntent.Mode.BIND,
        requested_by=owner,
        next_path="/settings/account",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    class FakeGitHubAdapter:
        provider = "github"

        def fetch_profile_by_code(self, code, redirect_uri):
            return fake_github_profile()

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_web_provider",
        lambda provider: FakeGitHubAdapter(),
    )

    response = client.get("/api/v1/auth/oauth/github/bind/callback?code=code-123&state=bind-state")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OAUTH_STATE_INVALID"
    assert ExternalIdentity.objects.filter(provider="github", provider_account_id="1001").exists() is False


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_anonymous_bind_start_is_forbidden(client):
    response = client.get("/api/v1/auth/oauth/github/bind/start")

    assert response.status_code == 403


@pytest.mark.django_db
def test_identity_list_returns_current_user_identities(client):
    user = User.objects.create_user(username="alice")
    client.force_authenticate(user=user)
    ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        nickname="Octo Cat",
        avatar_url="https://example.test/avatar.png",
        raw_profile={"id": 1001},
    )

    response = client.get("/api/v1/auth/oauth/identities")

    assert response.status_code == 200
    assert response.json()[0]["provider"] == "github"
    assert response.json()[0]["nickname"] == "Octo Cat"
    assert "provider_account_id" not in response.json()[0]
    assert "union_id" not in response.json()[0]
    assert "open_id" not in response.json()[0]


@pytest.mark.django_db
def test_unbind_removes_identity_when_user_has_local_password(client):
    user = User.objects.create_user(username="alice", password="pw-Strong-1")
    client.force_authenticate(user=user)
    identity = ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )

    response = client.delete(f"/api/v1/auth/oauth/identities/{identity.id}")

    assert response.status_code == 204
    assert ExternalIdentity.objects.filter(id=identity.id).exists() is False
    assert AuditLog.objects.filter(action="oauth.unbind", actor=user).exists()


@pytest.mark.django_db
def test_unbind_rejects_last_passwordless_login_method(client):
    user = User.objects.create_user(username="external-only")
    user.set_unusable_password()
    user.save(update_fields=["password"])
    client.force_authenticate(user=user)
    identity = ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )

    response = client.delete(f"/api/v1/auth/oauth/identities/{identity.id}")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAST_LOGIN_METHOD"


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"wechat_miniprogram"}, OAUTH_AUTO_REGISTER_ENABLED=True)
def test_wechat_miniprogram_register_endpoint_creates_or_reuses_user(client, monkeypatch):
    class FakeWeChatAdapter:
        provider = "wechat_miniprogram"

        def fetch_profile_by_login_code(self, code, public_profile=None):
            assert code == "wx-code-123"
            return NormalizedExternalProfile(
                provider="wechat_miniprogram",
                tenant_id="wx-app-1",
                provider_account_id="union-1",
                union_id="union-1",
                open_id="openid-1",
                external_username=None,
                nickname=(public_profile or {}).get("nickname"),
                avatar_url=(public_profile or {}).get("avatar_url"),
                email=None,
                phone=None,
                raw_profile={
                    "openid": "openid-1",
                    "unionid": "union-1",
                    "session_key": "secret",
                },
            )

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_code_session_provider",
        lambda provider: FakeWeChatAdapter(),
    )

    request_payload = {
        "code": "wx-code-123",
        "profile": {
            "nickname": "WeChat User A",
            "avatar_url": "https://example.test/wx.png",
        },
    }

    response = client.post(
        "/api/v1/auth/oauth/wechat_miniprogram/register",
        request_payload,
        format="json",
    )
    second = client.post(
        "/api/v1/auth/oauth/wechat_miniprogram/register",
        request_payload,
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["status"] == "registered"
    assert response.json()["csrf_token"]
    assert response.json()["user"]["display_name"] == "WeChat User A"
    assert second.status_code == 200
    assert second.json()["status"] == "logged_in"
    assert ExternalIdentity.objects.filter(provider="wechat_miniprogram").count() == 1


@pytest.mark.django_db
@override_settings(OAUTH_ENABLED_PROVIDERS={"wechat_miniprogram"}, OAUTH_AUTO_REGISTER_ENABLED=True)
def test_code_session_register_rejects_disabled_existing_identity(client, monkeypatch):
    user = User.objects.create_user(username="disabled-mini", is_active=False)
    ExternalIdentity.objects.create(
        user=user,
        provider="wechat_miniprogram",
        tenant_id="wx-app-1",
        provider_account_id="union-1",
        union_id="union-1",
        open_id="openid-1",
        raw_profile={"unionid": "union-1"},
    )

    class FakeWeChatAdapter:
        provider = "wechat_miniprogram"

        def fetch_profile_by_login_code(self, code, public_profile=None):
            return fake_wechat_miniprogram_profile()

    monkeypatch.setattr(
        "apps.accounts.oauth.views.get_code_session_provider",
        lambda provider: FakeWeChatAdapter(),
    )

    response = client.post(
        "/api/v1/auth/oauth/wechat_miniprogram/register",
        {"code": "wx-code-123", "profile": {}},
        format="json",
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"
