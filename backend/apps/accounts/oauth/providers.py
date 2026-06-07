from __future__ import annotations

from typing import Protocol

from django.conf import settings

from .errors import OAuthProviderDisabled
from .profiles import NormalizedExternalProfile


class ProviderAdapter(Protocol):
    provider: str

    def build_authorization_url(self, state: str, redirect_uri: str) -> str:
        raise NotImplementedError

    def fetch_profile_by_code(self, code: str, redirect_uri: str) -> NormalizedExternalProfile:
        raise NotImplementedError


class CodeSessionProviderAdapter(Protocol):
    provider: str

    def fetch_profile_by_login_code(
        self, code: str, public_profile: dict | None = None
    ) -> NormalizedExternalProfile:
        raise NotImplementedError


def get_web_provider(provider: str) -> ProviderAdapter:
    _ensure_enabled(provider)
    if provider == "github":
        from .github import GitHubOAuthAdapter

        return GitHubOAuthAdapter()
    if provider == "wechat_web":
        from .wechat_web import WeChatWebOAuthAdapter

        return WeChatWebOAuthAdapter()
    if provider == "dingtalk":
        from .dingtalk import DingTalkOAuthAdapter

        return DingTalkOAuthAdapter()
    if provider == "qq_web":
        from .qq import QQWebOAuthAdapter

        return QQWebOAuthAdapter()
    raise OAuthProviderDisabled()


def get_code_session_provider(provider: str) -> CodeSessionProviderAdapter:
    _ensure_enabled(provider)
    if provider == "wechat_miniprogram":
        from .wechat_miniprogram import WeChatMiniProgramAdapter

        return WeChatMiniProgramAdapter()
    if provider == "qq_miniprogram":
        from .qq import QQMiniProgramAdapter

        return QQMiniProgramAdapter()
    raise OAuthProviderDisabled()


def _ensure_enabled(provider: str) -> None:
    if provider not in getattr(settings, "OAUTH_ENABLED_PROVIDERS", set()):
        raise OAuthProviderDisabled()
