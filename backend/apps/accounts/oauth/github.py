from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings

from .errors import OAuthCodeExchangeFailed, OAuthProfileIncomplete
from .http import get_json, post_form_json
from .profiles import NormalizedExternalProfile


class GitHubOAuthAdapter:
    provider = "github"

    def build_authorization_url(self, state: str, redirect_uri: str) -> str:
        query = urlencode(
            {
                "client_id": settings.OAUTH_GITHUB_CLIENT_ID,
                "redirect_uri": redirect_uri,
                "state": state,
                "scope": "read:user",
            }
        )
        return f"https://github.com/login/oauth/authorize?{query}"

    def fetch_profile_by_code(self, code: str, redirect_uri: str) -> NormalizedExternalProfile:
        token_payload = post_form_json(
            "https://github.com/login/oauth/access_token",
            {
                "client_id": settings.OAUTH_GITHUB_CLIENT_ID,
                "client_secret": settings.OAUTH_GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        access_token = token_payload.get("access_token")
        if not access_token:
            raise OAuthCodeExchangeFailed()

        user_payload = get_json(
            "https://api.github.com/user",
            params={},
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {access_token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        github_id = user_payload.get("id")
        if github_id is None:
            raise OAuthProfileIncomplete()
        return NormalizedExternalProfile(
            provider=self.provider,
            tenant_id=None,
            provider_account_id=str(github_id),
            union_id=None,
            open_id=None,
            external_username=user_payload.get("login") or None,
            nickname=user_payload.get("name") or user_payload.get("login") or None,
            avatar_url=user_payload.get("avatar_url") or None,
            email=user_payload.get("email") or None,
            phone=None,
            raw_profile={**user_payload, "token_response": token_payload},
        )
