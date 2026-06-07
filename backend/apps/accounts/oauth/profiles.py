from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from .constants import PROVIDER_DEFAULT_DISPLAY_NAMES
from .errors import OAuthProfileIncomplete

SENSITIVE_PROFILE_KEYS = {
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "session_key",
    "sessionKey",
    "token",
    "secret",
}


@dataclass(frozen=True)
class NormalizedExternalProfile:
    provider: str
    tenant_id: str | None
    provider_account_id: str
    union_id: str | None
    open_id: str | None
    external_username: str | None
    nickname: str | None
    avatar_url: str | None
    email: str | None
    phone: str | None
    raw_profile: dict[str, Any]

    def __post_init__(self):
        if not self.provider_account_id:
            raise OAuthProfileIncomplete()

    @property
    def display_name(self) -> str:
        return (
            self.nickname
            or self.external_username
            or PROVIDER_DEFAULT_DISPLAY_NAMES.get(self.provider, "第三方用户")
        )


def generate_external_username(profile: NormalizedExternalProfile) -> str:
    tenant = profile.tenant_id or ""
    digest = hashlib.sha256(
        f"{profile.provider}:{tenant}:{profile.provider_account_id}".encode()
    ).hexdigest()[:12]
    provider_short = profile.provider.split("_", maxsplit=1)[0]
    return f"ext_{provider_short}_{digest}"


def hash_identifier(value: str | None) -> str | None:
    if not value:
        return None
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def scrub_raw_profile(raw_profile: dict[str, Any]) -> dict[str, Any]:
    scrubbed: dict[str, Any] = {}
    for key, value in raw_profile.items():
        if key in SENSITIVE_PROFILE_KEYS:
            continue
        nested = _scrub_raw_value(value)
        if nested not in ({}, []):
            scrubbed[key] = nested
    return scrubbed


def _scrub_raw_value(value: Any) -> Any:
    if isinstance(value, dict):
        return scrub_raw_profile(value)
    if isinstance(value, list):
        return [_scrub_raw_value(item) for item in value]
    return value
