from __future__ import annotations

from django.conf import settings
from django.contrib.auth import login
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import ExternalIdentity, UserProfile
from apps.audit.services import record_audit_log

from .errors import (
    AccountDisabled,
    AutoRegisterDisabled,
    LastLoginMethod,
    OAuthIdentityAlreadyBound,
)
from .profiles import (
    NormalizedExternalProfile,
    generate_external_username,
    hash_identifier,
    scrub_raw_profile,
)


@transaction.atomic
def register_or_login_by_external(*, profile: NormalizedExternalProfile, request):
    identity = find_existing_identity(profile)
    if identity is not None:
        ensure_user_can_login(identity.user)
        update_identity_from_profile(identity, profile, mark_login=True)
        _login_if_possible(request, identity.user)
        audit("oauth.login", identity.user, profile, request)
        return identity.user, False

    if not settings.OAUTH_AUTO_REGISTER_ENABLED:
        raise AutoRegisterDisabled()

    try:
        user = create_external_user(profile)
        create_external_identity(user, profile, mark_login=True)
    except IntegrityError:
        identity = find_existing_identity(profile)
        if identity is None:
            raise
        ensure_user_can_login(identity.user)
        update_identity_from_profile(identity, profile, mark_login=True)
        _login_if_possible(request, identity.user)
        audit("oauth.login", identity.user, profile, request)
        return identity.user, False

    _login_if_possible(request, user)
    audit("oauth.register", user, profile, request)
    return user, True


@transaction.atomic
def bind_external_identity(*, user: User, profile: NormalizedExternalProfile, request):
    identity = find_existing_identity(profile)
    if identity is not None and identity.user_id != user.id:
        audit("oauth.identity_conflict", user, profile, request)
        raise OAuthIdentityAlreadyBound()
    if identity is not None:
        update_identity_from_profile(identity, profile, mark_login=False)
        audit("oauth.bind", user, profile, request)
        return identity, False
    identity = create_external_identity(user, profile, mark_login=False)
    audit("oauth.bind", user, profile, request)
    return identity, True


@transaction.atomic
def unbind_external_identity(*, user: User, identity_id: int, request):
    identity = ExternalIdentity.objects.filter(id=identity_id, user=user).first()
    if identity is None:
        return False
    if not user.has_usable_password() and user.external_identities.count() <= 1:
        raise LastLoginMethod()
    detail_profile = NormalizedExternalProfile(
        provider=identity.provider,
        tenant_id=identity.tenant_id,
        provider_account_id=identity.provider_account_id,
        union_id=identity.union_id,
        open_id=identity.open_id,
        external_username=identity.external_username,
        nickname=identity.nickname,
        avatar_url=identity.avatar_url,
        email=identity.email,
        phone=identity.phone,
        raw_profile={},
    )
    identity.delete()
    audit("oauth.unbind", user, detail_profile, request)
    return True


def find_existing_identity(profile: NormalizedExternalProfile) -> ExternalIdentity | None:
    identity = (
        ExternalIdentity.objects.filter(
            provider=profile.provider,
            tenant_id=profile.tenant_id,
            provider_account_id=profile.provider_account_id,
        )
        .select_related("user", "user__profile")
        .first()
    )
    if identity is not None:
        return identity
    if profile.union_id:
        return (
            ExternalIdentity.objects.filter(
                provider=profile.provider,
                tenant_id=profile.tenant_id,
                union_id=profile.union_id,
            )
            .select_related("user", "user__profile")
            .first()
        )
    return None


def create_external_user(profile: NormalizedExternalProfile) -> User:
    user = User.objects.create_user(
        username=generate_external_username(profile),
        email=profile.email or "",
        password=None,
    )
    user.set_unusable_password()
    user.is_staff = False
    user.is_superuser = False
    user.is_active = True
    user.save(update_fields=["password", "is_staff", "is_superuser", "is_active"])
    UserProfile.objects.create(user=user, display_name=profile.display_name)
    return user


def create_external_identity(
    user: User, profile: NormalizedExternalProfile, *, mark_login: bool
) -> ExternalIdentity:
    return ExternalIdentity.objects.create(
        user=user,
        provider=profile.provider,
        tenant_id=profile.tenant_id,
        provider_account_id=profile.provider_account_id,
        union_id=profile.union_id,
        open_id=profile.open_id,
        external_username=profile.external_username or "",
        nickname=profile.nickname or "",
        avatar_url=profile.avatar_url or "",
        email=profile.email or "",
        phone=profile.phone or "",
        raw_profile=scrub_raw_profile(profile.raw_profile),
        last_login_at=timezone.now() if mark_login else None,
    )


def update_identity_from_profile(
    identity: ExternalIdentity, profile: NormalizedExternalProfile, *, mark_login: bool
) -> None:
    identity.external_username = profile.external_username or ""
    identity.nickname = profile.nickname or ""
    identity.avatar_url = profile.avatar_url or ""
    identity.email = profile.email or ""
    identity.phone = profile.phone or ""
    identity.raw_profile = scrub_raw_profile(profile.raw_profile)
    update_fields = [
        "external_username",
        "nickname",
        "avatar_url",
        "email",
        "phone",
        "raw_profile",
        "updated_at",
    ]
    if mark_login:
        identity.last_login_at = timezone.now()
        update_fields.append("last_login_at")
    identity.save(update_fields=update_fields)


def ensure_user_can_login(user: User) -> None:
    profile = getattr(user, "profile", None)
    if not user.is_active or (profile is not None and (not profile.is_active or profile.left_at)):
        raise AccountDisabled()


def audit(action: str, user: User, profile: NormalizedExternalProfile, request) -> None:
    record_audit_log(
        actor=user,
        action=action,
        target_type="user",
        target_id=user.id,
        detail={
            "provider": profile.provider,
            "tenant_id": profile.tenant_id,
            "provider_account_id_hash": hash_identifier(profile.provider_account_id),
            "union_id_hash": hash_identifier(profile.union_id),
        },
        ip_address=_client_ip(request) if request is not None else None,
    )


def _login_if_possible(request, user: User) -> None:
    if request is not None and hasattr(request, "session"):
        login(request, user)


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None
