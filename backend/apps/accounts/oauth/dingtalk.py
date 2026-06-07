from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings

from .errors import OAuthCodeExchangeFailed, OAuthProfileIncomplete, OAuthProviderDisabled
from .http import get_json, post_json
from .profiles import NormalizedExternalProfile


class DingTalkOAuthAdapter:
    provider = "dingtalk"

    def build_authorization_url(self, state: str, redirect_uri: str) -> str:
        callback_url = settings.OAUTH_DINGTALK_CALLBACK_URL or redirect_uri
        query = urlencode(
            {
                "redirect_uri": callback_url,
                "response_type": "code",
                "client_id": settings.OAUTH_DINGTALK_CLIENT_ID,
                "scope": "openid",
                "state": state,
                "prompt": "consent",
            }
        )
        return f"https://login.dingtalk.com/oauth2/auth?{query}"

    def fetch_profile_by_code(self, code: str, redirect_uri: str) -> NormalizedExternalProfile:
        token_payload = post_json(
            "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
            {
                "clientId": settings.OAUTH_DINGTALK_CLIENT_ID,
                "clientSecret": settings.OAUTH_DINGTALK_CLIENT_SECRET,
                "code": code,
                "grantType": "authorization_code",
            },
        )
        access_token = token_payload.get("accessToken")
        if not access_token:
            raise OAuthCodeExchangeFailed()

        user_payload = get_json(
            "https://api.dingtalk.com/v1.0/contact/users/me",
            params={},
            headers={"x-acs-dingtalk-access-token": access_token},
        )
        return self._normalize_profile(user_payload, token_payload)

    def _normalize_profile(self, user_payload: dict, token_payload: dict) -> NormalizedExternalProfile:
        unionid = user_payload.get("unionId") or user_payload.get("unionid") or None
        user_id = user_payload.get("userId") or user_payload.get("userid") or None
        corp_id = user_payload.get("corpId") or user_payload.get("corpid") or None
        allowed_corps = getattr(settings, "OAUTH_DINGTALK_ALLOWED_CORP_IDS", set())
        if allowed_corps and corp_id not in allowed_corps:
            raise OAuthProviderDisabled()

        stable_id = unionid or user_id
        if not stable_id or not corp_id:
            raise OAuthProfileIncomplete()

        return NormalizedExternalProfile(
            provider=self.provider,
            tenant_id=corp_id,
            provider_account_id=str(stable_id),
            union_id=unionid,
            open_id=user_id,
            external_username=user_id,
            nickname=user_payload.get("nick") or user_payload.get("name") or None,
            avatar_url=user_payload.get("avatarUrl") or user_payload.get("avatar") or None,
            email=user_payload.get("email") or None,
            phone=user_payload.get("mobile") or None,
            raw_profile={**user_payload, "token_response": token_payload},
        )
