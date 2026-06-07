import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, override_settings
from django.utils import timezone

from apps.accounts.models import OAuthLoginIntent
from apps.accounts.oauth.errors import OAuthStateConsumed, OAuthStateExpired, OAuthStateInvalid
from apps.accounts.oauth.state import consume_oauth_intent, create_oauth_intent, safe_next_path


def test_safe_next_path_accepts_internal_paths_only():
    assert safe_next_path("/dashboard") == "/dashboard"
    assert safe_next_path("/login") == "/"
    assert safe_next_path("//evil.test") == "/"
    assert safe_next_path("https://evil.test/x") == "/"
    assert safe_next_path(None) == "/"


@pytest.mark.django_db
@override_settings(OAUTH_STATE_TTL_SECONDS=600)
def test_create_oauth_intent_stores_anonymous_register_login_state():
    request = RequestFactory().get("/api/v1/auth/oauth/github/start?next=/dashboard")
    request.user = AnonymousUser()

    intent = create_oauth_intent(
        request=request,
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/dashboard",
    )

    assert intent.provider == "github"
    assert intent.requested_by is None
    assert intent.next_path == "/dashboard"
    assert intent.expires_at > timezone.now()


@pytest.mark.django_db
def test_consume_oauth_intent_marks_state_consumed_once():
    intent = OAuthLoginIntent.objects.create(
        state="state-1",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/dashboard",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    consumed = consume_oauth_intent(
        state="state-1",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
    )

    assert consumed.id == intent.id
    assert consumed.consumed_at is not None

    with pytest.raises(OAuthStateConsumed):
        consume_oauth_intent(
            state="state-1",
            provider="github",
            mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        )


@pytest.mark.django_db
def test_consume_oauth_intent_rejects_expired_state():
    OAuthLoginIntent.objects.create(
        state="state-expired",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/",
        expires_at=timezone.now() - timezone.timedelta(seconds=1),
    )

    with pytest.raises(OAuthStateExpired):
        consume_oauth_intent(
            state="state-expired",
            provider="github",
            mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        )


@pytest.mark.django_db
def test_consume_oauth_intent_rejects_provider_mismatch():
    OAuthLoginIntent.objects.create(
        state="state-provider",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/",
        expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    with pytest.raises(OAuthStateInvalid):
        consume_oauth_intent(
            state="state-provider",
            provider="wechat_web",
            mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        )
