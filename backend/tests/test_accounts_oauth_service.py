import pytest
from django.contrib.auth.models import User
from django.test import RequestFactory, override_settings

from apps.accounts.models import ExternalIdentity, UserProfile
from apps.accounts.oauth.errors import AccountDisabled, LastLoginMethod, OAuthIdentityAlreadyBound
from apps.accounts.oauth.profiles import NormalizedExternalProfile
from apps.accounts.oauth.service import (
    bind_external_identity,
    register_or_login_by_external,
    unbind_external_identity,
)
from apps.audit.models import AuditLog


@pytest.fixture
def github_profile():
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


@pytest.mark.django_db
@override_settings(OAUTH_AUTO_REGISTER_ENABLED=True)
def test_register_or_login_creates_low_privilege_user_and_identity(github_profile):
    request = RequestFactory().get("/")

    user, is_new = register_or_login_by_external(profile=github_profile, request=request)

    assert is_new is True
    assert user.username.startswith("ext_github_")
    assert user.has_usable_password() is False
    assert user.is_staff is False
    assert user.is_superuser is False
    assert UserProfile.objects.get(user=user).display_name == "Octo Cat"
    identity = ExternalIdentity.objects.get(user=user)
    assert identity.provider == "github"
    assert identity.provider_account_id == "1001"
    assert identity.raw_profile == {"id": 1001, "login": "octocat"}
    assert AuditLog.objects.filter(action="oauth.register", actor=user).exists()


@pytest.mark.django_db
@override_settings(OAUTH_AUTO_REGISTER_ENABLED=True)
def test_register_or_login_reuses_existing_identity(github_profile):
    request = RequestFactory().get("/")
    first_user, _ = register_or_login_by_external(profile=github_profile, request=request)

    second_user, is_new = register_or_login_by_external(profile=github_profile, request=request)

    assert is_new is False
    assert second_user.id == first_user.id
    assert User.objects.count() == 1
    assert ExternalIdentity.objects.count() == 1
    assert AuditLog.objects.filter(action="oauth.login", actor=first_user).exists()


@pytest.mark.django_db
def test_register_or_login_rejects_disabled_user(github_profile):
    request = RequestFactory().get("/")
    user = User.objects.create_user(username="disabled", is_active=False)
    ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )

    with pytest.raises(AccountDisabled):
        register_or_login_by_external(profile=github_profile, request=request)


@pytest.mark.django_db
@override_settings(OAUTH_AUTO_REGISTER_ENABLED=True)
def test_register_or_login_scrubs_sensitive_profile_values_from_identity_and_audit():
    request = RequestFactory().get("/")
    profile = NormalizedExternalProfile(
        provider="wechat_miniprogram",
        tenant_id="wx-app-1",
        provider_account_id="union-1",
        union_id="union-1",
        open_id="openid-1",
        external_username=None,
        nickname="WeChat User A",
        avatar_url=None,
        email=None,
        phone=None,
        raw_profile={
            "openid": "openid-1",
            "unionid": "union-1",
            "access_token": "secret-access",
            "refresh_token": "secret-refresh",
            "session_key": "secret-session",
            "nested": {
                "token": "secret-token",
                "items": [{"session_key": "secret-list-session", "name": "safe"}],
            },
        },
    )

    user, _is_new = register_or_login_by_external(profile=profile, request=request)

    raw_profile = ExternalIdentity.objects.get(user=user).raw_profile
    raw_text = str(raw_profile)
    assert "secret-access" not in raw_text
    assert "secret-refresh" not in raw_text
    assert "secret-session" not in raw_text
    assert "secret-token" not in raw_text
    assert "secret-list-session" not in raw_text
    detail = AuditLog.objects.get(action="oauth.register", actor=user).detail
    assert detail["provider_account_id_hash"].startswith("sha256:")
    assert detail["union_id_hash"].startswith("sha256:")
    assert "union-1" not in str(detail)


@pytest.mark.django_db
def test_bind_external_identity_creates_binding_for_current_user(github_profile):
    user = User.objects.create_user(username="alice", password="pw-Strong-1")

    identity, created = bind_external_identity(user=user, profile=github_profile, request=None)

    assert created is True
    assert identity.user == user
    assert AuditLog.objects.filter(action="oauth.bind", actor=user).exists()


@pytest.mark.django_db
def test_bind_external_identity_conflict_does_not_overwrite(github_profile):
    owner = User.objects.create_user(username="owner")
    other = User.objects.create_user(username="other")
    ExternalIdentity.objects.create(
        user=owner,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )

    with pytest.raises(OAuthIdentityAlreadyBound):
        bind_external_identity(user=other, profile=github_profile, request=None)


@pytest.mark.django_db
def test_unbind_rejects_last_external_login_method_for_passwordless_user(github_profile):
    user = User.objects.create_user(username="external-only")
    user.set_unusable_password()
    user.save(update_fields=["password"])
    identity = ExternalIdentity.objects.create(
        user=user,
        provider="github",
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )

    with pytest.raises(LastLoginMethod):
        unbind_external_identity(user=user, identity_id=identity.id, request=None)
