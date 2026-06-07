from __future__ import annotations

from django.conf import settings

from .errors import OAuthCodeExchangeFailed, OAuthProfileIncomplete
from .http import get_json
from .profiles import NormalizedExternalProfile


class WeChatMiniProgramAdapter:
    provider = "wechat_miniprogram"

    def fetch_profile_by_login_code(
        self, code: str, public_profile: dict | None = None
    ) -> NormalizedExternalProfile:
        payload = get_json(
            "https://api.weixin.qq.com/sns/jscode2session",
            params={
                "appid": settings.OAUTH_WECHAT_MINI_APP_ID,
                "secret": settings.OAUTH_WECHAT_MINI_APP_SECRET,
                "js_code": code,
                "grant_type": "authorization_code",
            },
        )
        if payload.get("errcode"):
            raise OAuthCodeExchangeFailed()

        unionid = payload.get("unionid") or None
        openid = payload.get("openid") or None
        stable_id = unionid or openid
        if not stable_id or not openid:
            raise OAuthProfileIncomplete()

        profile_payload = public_profile or {}
        return NormalizedExternalProfile(
            provider=self.provider,
            tenant_id=settings.OAUTH_WECHAT_MINI_APP_ID,
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
