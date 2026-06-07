from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings

from .errors import OAuthCodeExchangeFailed, OAuthProfileIncomplete
from .http import get_json
from .profiles import NormalizedExternalProfile


class QQWebOAuthAdapter:
    provider = "qq_web"

    def build_authorization_url(self, state: str, redirect_uri: str) -> str:
        query = urlencode(
            {
                "response_type": "code",
                "client_id": settings.OAUTH_QQ_WEB_APP_ID,
                "redirect_uri": redirect_uri,
                "state": state,
            }
        )
        return f"https://graph.qq.com/oauth2.0/authorize?{query}"

    def fetch_profile_by_code(self, code: str, redirect_uri: str) -> NormalizedExternalProfile:
        token_payload = get_json(
            "https://graph.qq.com/oauth2.0/token",
            params={
                "grant_type": "authorization_code",
                "client_id": settings.OAUTH_QQ_WEB_APP_ID,
                "client_secret": settings.OAUTH_QQ_WEB_APP_KEY,
                "code": code,
                "redirect_uri": redirect_uri,
                "fmt": "json",
            },
        )
        access_token = token_payload.get("access_token")
        if token_payload.get("error") or not access_token:
            raise OAuthCodeExchangeFailed()

        identity_payload = get_json(
            "https://graph.qq.com/oauth2.0/me",
            params={"access_token": access_token, "fmt": "json"},
        )
        openid = identity_payload.get("openid") or None
        if not openid:
            raise OAuthProfileIncomplete()

        user_payload = self._fetch_user_payload(access_token, openid)
        return NormalizedExternalProfile(
            provider=self.provider,
            tenant_id=settings.OAUTH_QQ_WEB_APP_ID,
            provider_account_id=str(openid),
            union_id=None,
            open_id=openid,
            external_username=None,
            nickname=user_payload.get("nickname") or None,
            avatar_url=user_payload.get("figureurl_qq_2") or user_payload.get("figureurl_qq_1") or None,
            email=None,
            phone=None,
            raw_profile={**user_payload, "token_response": token_payload, "openid_response": identity_payload},
        )

    def _fetch_user_payload(self, access_token: str, openid: str) -> dict:
        return get_json(
            "https://graph.qq.com/user/get_user_info",
            params={
                "access_token": access_token,
                "oauth_consumer_key": settings.OAUTH_QQ_WEB_APP_ID,
                "openid": openid,
                "fmt": "json",
            },
        )


class QQMiniProgramAdapter:
    provider = "qq_miniprogram"

    def fetch_profile_by_login_code(
        self, code: str, public_profile: dict | None = None
    ) -> NormalizedExternalProfile:
        payload = get_json(
            "https://api.q.qq.com/sns/jscode2session",
            params={
                "appid": settings.OAUTH_QQ_MINI_APP_ID,
                "secret": settings.OAUTH_QQ_MINI_APP_SECRET,
                "js_code": code,
                "grant_type": "authorization_code",
            },
        )
        if payload.get("errcode"):
            raise OAuthCodeExchangeFailed()

        unionid = payload.get("unionid") or None
        openid = payload.get("openid") or None
        stable_id = unionid or openid
        if not stable_id:
            raise OAuthProfileIncomplete()

        profile_payload = public_profile or {}
        return NormalizedExternalProfile(
            provider=self.provider,
            tenant_id=settings.OAUTH_QQ_MINI_APP_ID,
            provider_account_id=str(stable_id),
            union_id=unionid,
            open_id=openid,
            external_username=None,
            nickname=profile_payload.get("nickname") or None,
            avatar_url=profile_payload.get("avatar_url") or None,
            email=None,
            phone=None,
            raw_profile={**profile_payload, **payload},
        )
