from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings

from .errors import OAuthCodeExchangeFailed, OAuthProfileIncomplete
from .http import get_json
from .profiles import NormalizedExternalProfile


class WeChatWebOAuthAdapter:
    provider = "wechat_web"

    def build_authorization_url(self, state: str, redirect_uri: str) -> str:
        query = urlencode(
            {
                "appid": settings.OAUTH_WECHAT_WEB_APP_ID,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "snsapi_login",
                "state": state,
            }
        )
        return f"https://open.weixin.qq.com/connect/qrconnect?{query}#wechat_redirect"

    def fetch_profile_by_code(self, code: str, redirect_uri: str) -> NormalizedExternalProfile:
        token_payload = get_json(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": settings.OAUTH_WECHAT_WEB_APP_ID,
                "secret": settings.OAUTH_WECHAT_WEB_APP_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        access_token = token_payload.get("access_token")
        openid = token_payload.get("openid") or None
        if token_payload.get("errcode") or not access_token:
            raise OAuthCodeExchangeFailed()

        user_payload = get_json(
            "https://api.weixin.qq.com/sns/userinfo",
            params={"access_token": access_token, "openid": openid or "", "lang": "zh_CN"},
        )
        unionid = user_payload.get("unionid") or token_payload.get("unionid") or None
        user_openid = user_payload.get("openid") or openid
        stable_id = unionid or user_openid
        if not stable_id:
            raise OAuthProfileIncomplete()

        return NormalizedExternalProfile(
            provider=self.provider,
            tenant_id=settings.OAUTH_WECHAT_WEB_APP_ID,
            provider_account_id=str(stable_id),
            union_id=unionid,
            open_id=user_openid,
            external_username=None,
            nickname=user_payload.get("nickname") or None,
            avatar_url=user_payload.get("headimgurl") or None,
            email=None,
            phone=None,
            raw_profile={**user_payload, "token_response": token_payload},
        )
