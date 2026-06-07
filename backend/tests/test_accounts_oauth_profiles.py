import pytest

from apps.accounts.oauth.errors import OAuthProfileIncomplete
from apps.accounts.oauth.profiles import (
    NormalizedExternalProfile,
    generate_external_username,
    hash_identifier,
    scrub_raw_profile,
)


def test_generate_external_username_is_stable_and_provider_scoped():
    profile = NormalizedExternalProfile(
        provider="github",
        tenant_id=None,
        provider_account_id="1001",
        union_id=None,
        open_id=None,
        external_username="octocat",
        nickname="Octo Cat",
        avatar_url="https://example.test/avatar.png",
        email="",
        phone="",
        raw_profile={"id": 1001},
    )

    assert generate_external_username(profile) == generate_external_username(profile)
    assert generate_external_username(profile).startswith("ext_github_")
    assert len(generate_external_username(profile)) <= 150


def test_profile_requires_stable_provider_account_id():
    with pytest.raises(OAuthProfileIncomplete):
        NormalizedExternalProfile(
            provider="github",
            tenant_id=None,
            provider_account_id="",
            union_id=None,
            open_id=None,
            external_username=None,
            nickname=None,
            avatar_url=None,
            email=None,
            phone=None,
            raw_profile={},
        )


def test_scrub_raw_profile_removes_tokens_and_session_key():
    scrubbed = scrub_raw_profile(
        {
            "id": "1001",
            "access_token": "secret-access",
            "refresh_token": "secret-refresh",
            "session_key": "secret-session",
            "nested": {"token": "secret-token", "nickname": "Alice"},
        }
    )

    assert scrubbed == {"id": "1001", "nested": {"nickname": "Alice"}}


def test_scrub_raw_profile_recurses_lists():
    scrubbed = scrub_raw_profile(
        {
            "items": [
                {"access_token": "secret-access", "name": "safe"},
                {"nested": [{"session_key": "secret-session", "value": "kept"}]},
            ],
        }
    )

    assert str(scrubbed).find("secret-access") == -1
    assert str(scrubbed).find("secret-session") == -1
    assert scrubbed == {"items": [{"name": "safe"}, {"nested": [{"value": "kept"}]}]}


def test_hash_identifier_is_prefixed_and_does_not_leak_value():
    digest = hash_identifier("openid-123")

    assert digest.startswith("sha256:")
    assert "openid-123" not in digest
