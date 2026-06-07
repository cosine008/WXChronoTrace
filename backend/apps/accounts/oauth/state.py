from __future__ import annotations

import secrets

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from apps.accounts.models import OAuthLoginIntent

from .errors import OAuthStateConsumed, OAuthStateExpired, OAuthStateInvalid


def safe_next_path(value: str | None) -> str:
    if not value or not value.startswith("/") or value.startswith("//"):
        return "/"
    if value.startswith("/login"):
        return "/"
    return value


def create_oauth_intent(
    *,
    request,
    provider: str,
    mode: str,
    next_path: str,
) -> OAuthLoginIntent:
    user = getattr(request, "user", None)
    requested_by = None if isinstance(user, AnonymousUser) or not user.is_authenticated else user
    return OAuthLoginIntent.objects.create(
        state=secrets.token_urlsafe(32),
        provider=provider,
        mode=mode,
        next_path=safe_next_path(next_path),
        requested_by=requested_by,
        created_ip=_client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
        expires_at=timezone.now()
        + timezone.timedelta(seconds=settings.OAUTH_STATE_TTL_SECONDS),
    )


def consume_oauth_intent(*, state: str, provider: str, mode: str) -> OAuthLoginIntent:
    intent = OAuthLoginIntent.objects.select_for_update().filter(state=state).first()
    if intent is None or intent.provider != provider or intent.mode != mode:
        raise OAuthStateInvalid()
    if intent.consumed_at is not None:
        raise OAuthStateConsumed()
    if intent.expires_at <= timezone.now():
        raise OAuthStateExpired()
    intent.consumed_at = timezone.now()
    intent.save(update_fields=["consumed_at"])
    return intent


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None
