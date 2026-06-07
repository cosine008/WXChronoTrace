import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import ExternalIdentity, OAuthLoginIntent


@pytest.mark.django_db
def test_external_identity_unique_by_provider_tenant_and_account_id():
    user = User.objects.create_user(username="alice")
    ExternalIdentity.objects.create(
        user=user,
        provider="github",
        tenant_id=None,
        provider_account_id="1001",
        raw_profile={"id": 1001},
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        ExternalIdentity.objects.create(
            user=user,
            provider="github",
            tenant_id=None,
            provider_account_id="1001",
            raw_profile={"id": 1001},
        )


@pytest.mark.django_db
def test_external_identity_unique_by_union_id_when_present():
    user = User.objects.create_user(username="alice")
    ExternalIdentity.objects.create(
        user=user,
        provider="wechat_miniprogram",
        tenant_id="wx-app-1",
        provider_account_id="union-1",
        union_id="union-1",
        open_id="openid-1",
        raw_profile={"unionid": "union-1"},
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        ExternalIdentity.objects.create(
            user=user,
            provider="wechat_miniprogram",
            tenant_id="wx-app-1",
            provider_account_id="another-stable-id",
            union_id="union-1",
            open_id="openid-2",
            raw_profile={"unionid": "union-1"},
        )


@pytest.mark.django_db
def test_oauth_login_intent_tracks_state_mode_and_consumption():
    now = timezone.now()
    intent = OAuthLoginIntent.objects.create(
        state="state-abc",
        provider="github",
        mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
        next_path="/dashboard",
        expires_at=now + timezone.timedelta(minutes=10),
    )

    assert intent.consumed_at is None
    assert intent.requested_by is None
    assert str(intent) == "github:register_login:state-abc"
