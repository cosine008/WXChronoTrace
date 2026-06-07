from urllib.parse import parse_qs, urlparse

import pytest
from django.test import override_settings

from apps.accounts.oauth.dingtalk import DingTalkOAuthAdapter
from apps.accounts.oauth.errors import (
    OAuthCodeExchangeFailed,
    OAuthProfileIncomplete,
    OAuthProviderDisabled,
)
from apps.accounts.oauth.github import GitHubOAuthAdapter
from apps.accounts.oauth.profiles import scrub_raw_profile
from apps.accounts.oauth.providers import get_code_session_provider, get_web_provider
from apps.accounts.oauth.qq import QQMiniProgramAdapter, QQWebOAuthAdapter
from apps.accounts.oauth.wechat_miniprogram import WeChatMiniProgramAdapter
from apps.accounts.oauth.wechat_web import WeChatWebOAuthAdapter


@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_get_web_provider_returns_enabled_github_adapter():
    adapter = get_web_provider("github")

    assert adapter.provider == "github"


@override_settings(OAUTH_ENABLED_PROVIDERS={"wechat_miniprogram"})
def test_get_code_session_provider_returns_enabled_wechat_adapter():
    adapter = get_code_session_provider("wechat_miniprogram")

    assert adapter.provider == "wechat_miniprogram"


@override_settings(OAUTH_ENABLED_PROVIDERS={"github"})
def test_disabled_provider_raises_standard_error():
    with pytest.raises(OAuthProviderDisabled):
        get_web_provider("wechat_web")


@override_settings(OAUTH_GITHUB_CLIENT_ID="client-123")
def test_github_authorization_url_contains_state_redirect_and_client_id():
    url = GitHubOAuthAdapter().build_authorization_url(
        state="state-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/github/callback",
    )

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "github.com"
    assert query["client_id"] == ["client-123"]
    assert query["state"] == ["state-123"]
    assert query["redirect_uri"] == ["https://chrono.test/api/v1/auth/oauth/github/callback"]


def test_github_normalizes_user_response(monkeypatch):
    def fake_post_form_json(url, data, headers=None):
        assert url == "https://github.com/login/oauth/access_token"
        return {"access_token": "token-123"}

    def fake_get_json(url, params, headers=None):
        assert url == "https://api.github.com/user"
        assert headers["Authorization"] == "Bearer token-123"
        return {
            "id": 1001,
            "login": "octocat",
            "name": "Octo Cat",
            "avatar_url": "https://example.test/avatar.png",
            "email": "octo@example.test",
        }

    monkeypatch.setattr("apps.accounts.oauth.github.post_form_json", fake_post_form_json)
    monkeypatch.setattr("apps.accounts.oauth.github.get_json", fake_get_json)

    profile = GitHubOAuthAdapter().fetch_profile_by_code(
        code="code-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/github/callback",
    )

    assert profile.provider == "github"
    assert profile.tenant_id is None
    assert profile.provider_account_id == "1001"
    assert profile.external_username == "octocat"
    assert profile.nickname == "Octo Cat"


@override_settings(OAUTH_WECHAT_MINI_APP_ID="wx-app-1", OAUTH_WECHAT_MINI_APP_SECRET="secret-1")
def test_wechat_miniprogram_uses_unionid_as_stable_id(monkeypatch):
    def fake_get_json(url, params, headers=None):
        assert url == "https://api.weixin.qq.com/sns/jscode2session"
        assert params == {
            "appid": "wx-app-1",
            "secret": "secret-1",
            "js_code": "code-123",
            "grant_type": "authorization_code",
        }
        return {"openid": "openid-1", "unionid": "union-1", "session_key": "secret-session"}

    monkeypatch.setattr("apps.accounts.oauth.wechat_miniprogram.get_json", fake_get_json)

    profile = WeChatMiniProgramAdapter().fetch_profile_by_login_code(
        "code-123",
        public_profile={"nickname": "WeChat User A", "avatar_url": "https://example.test/wx.png"},
    )

    assert profile.provider == "wechat_miniprogram"
    assert profile.tenant_id == "wx-app-1"
    assert profile.provider_account_id == "union-1"
    assert profile.union_id == "union-1"
    assert profile.open_id == "openid-1"
    assert profile.nickname == "WeChat User A"
    assert profile.avatar_url == "https://example.test/wx.png"
    assert profile.raw_profile["session_key"] == "secret-session"
    assert profile.raw_profile["nickname"] == "WeChat User A"
    assert profile.raw_profile["avatar_url"] == "https://example.test/wx.png"


@override_settings(OAUTH_WECHAT_MINI_APP_ID="wx-app-1", OAUTH_WECHAT_MINI_APP_SECRET="secret-1")
def test_wechat_miniprogram_falls_back_to_openid(monkeypatch):
    monkeypatch.setattr(
        "apps.accounts.oauth.wechat_miniprogram.get_json",
        lambda url, params, headers=None: {"openid": "openid-1", "session_key": "secret-session"},
    )

    profile = WeChatMiniProgramAdapter().fetch_profile_by_login_code("code-123")

    assert profile.provider_account_id == "openid-1"
    assert profile.union_id is None
    assert profile.open_id == "openid-1"


@override_settings(OAUTH_WECHAT_MINI_APP_ID="wx-app-1", OAUTH_WECHAT_MINI_APP_SECRET="secret-1")
def test_wechat_miniprogram_raises_code_exchange_failed_on_wechat_error(monkeypatch):
    monkeypatch.setattr(
        "apps.accounts.oauth.wechat_miniprogram.get_json",
        lambda url, params, headers=None: {"errcode": 40029, "errmsg": "invalid code"},
    )

    with pytest.raises(OAuthCodeExchangeFailed):
        WeChatMiniProgramAdapter().fetch_profile_by_login_code("code-123")


@override_settings(OAUTH_WECHAT_MINI_APP_ID="wx-app-1", OAUTH_WECHAT_MINI_APP_SECRET="secret-1")
def test_wechat_miniprogram_requires_stable_identifier(monkeypatch):
    monkeypatch.setattr(
        "apps.accounts.oauth.wechat_miniprogram.get_json",
        lambda url, params, headers=None: {"session_key": "secret-session"},
    )

    with pytest.raises(OAuthProfileIncomplete):
        WeChatMiniProgramAdapter().fetch_profile_by_login_code("code-123")


@override_settings(OAUTH_WECHAT_WEB_APP_ID="wx-web-1")
def test_wechat_web_authorization_url_contains_expected_query():
    url = WeChatWebOAuthAdapter().build_authorization_url(
        state="state-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/wechat_web/callback",
    )

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "open.weixin.qq.com"
    assert parsed.path == "/connect/qrconnect"
    assert query["appid"] == ["wx-web-1"]
    assert query["redirect_uri"] == ["https://chrono.test/api/v1/auth/oauth/wechat_web/callback"]
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["snsapi_login"]
    assert query["state"] == ["state-123"]


@override_settings(OAUTH_WECHAT_WEB_APP_ID="wx-web-1", OAUTH_WECHAT_WEB_APP_SECRET="secret-1")
def test_wechat_web_normalizes_unionid_profile(monkeypatch):
    def fake_get_json(url, params, headers=None):
        if url == "https://api.weixin.qq.com/sns/oauth2/access_token":
            assert params == {
                "appid": "wx-web-1",
                "secret": "secret-1",
                "code": "code-123",
                "grant_type": "authorization_code",
            }
            return {"access_token": "token-123", "openid": "openid-1"}
        assert url == "https://api.weixin.qq.com/sns/userinfo"
        assert params == {
            "access_token": "token-123",
            "openid": "openid-1",
            "lang": "zh_CN",
        }
        return {
            "openid": "openid-1",
            "unionid": "union-1",
            "nickname": "WeChat User",
            "headimgurl": "https://example.test/wx.png",
        }

    monkeypatch.setattr("apps.accounts.oauth.wechat_web.get_json", fake_get_json)

    profile = WeChatWebOAuthAdapter().fetch_profile_by_code(
        code="code-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/wechat_web/callback",
    )

    assert profile.provider == "wechat_web"
    assert profile.tenant_id == "wx-web-1"
    assert profile.provider_account_id == "union-1"
    assert profile.union_id == "union-1"
    assert profile.open_id == "openid-1"
    assert profile.nickname == "WeChat User"
    assert profile.avatar_url == "https://example.test/wx.png"


@override_settings(OAUTH_WECHAT_WEB_APP_ID="wx-web-1", OAUTH_WECHAT_WEB_APP_SECRET="secret-1")
def test_wechat_web_falls_back_to_openid(monkeypatch):
    def fake_get_json(url, params, headers=None):
        if url == "https://api.weixin.qq.com/sns/oauth2/access_token":
            return {"access_token": "token-123", "openid": "openid-1"}
        return {"openid": "openid-1", "nickname": "WeChat User"}

    monkeypatch.setattr("apps.accounts.oauth.wechat_web.get_json", fake_get_json)

    profile = WeChatWebOAuthAdapter().fetch_profile_by_code(
        code="code-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/wechat_web/callback",
    )

    assert profile.provider_account_id == "openid-1"
    assert profile.union_id is None
    assert profile.open_id == "openid-1"


@override_settings(OAUTH_WECHAT_WEB_APP_ID="wx-web-1", OAUTH_WECHAT_WEB_APP_SECRET="secret-1")
def test_wechat_web_raises_code_exchange_failed_on_wechat_error(monkeypatch):
    monkeypatch.setattr(
        "apps.accounts.oauth.wechat_web.get_json",
        lambda url, params, headers=None: {"errcode": 40029, "errmsg": "invalid code"},
    )

    with pytest.raises(OAuthCodeExchangeFailed):
        WeChatWebOAuthAdapter().fetch_profile_by_code(
            code="code-123",
            redirect_uri="https://chrono.test/api/v1/auth/oauth/wechat_web/callback",
        )


@override_settings(
    OAUTH_DINGTALK_CLIENT_ID="dt-client-1",
    OAUTH_DINGTALK_CALLBACK_URL="https://chrono.test/api/v1/auth/oauth/dingtalk/callback",
)
def test_dingtalk_authorization_url_uses_configured_callback():
    url = DingTalkOAuthAdapter().build_authorization_url(
        state="state-123",
        redirect_uri="https://wrong.test/callback",
    )

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "login.dingtalk.com"
    assert parsed.path == "/oauth2/auth"
    assert query["client_id"] == ["dt-client-1"]
    assert query["redirect_uri"] == ["https://chrono.test/api/v1/auth/oauth/dingtalk/callback"]
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["openid"]
    assert query["state"] == ["state-123"]


@override_settings(OAUTH_DINGTALK_CLIENT_ID="dt-client-1", OAUTH_DINGTALK_CLIENT_SECRET="secret-1")
def test_dingtalk_normalizes_unionid_and_keeps_admin_flags_in_raw_profile(monkeypatch):
    def fake_post_json(url, data, headers=None):
        assert url == "https://api.dingtalk.com/v1.0/oauth2/userAccessToken"
        assert data == {
            "clientId": "dt-client-1",
            "clientSecret": "secret-1",
            "code": "code-123",
            "grantType": "authorization_code",
        }
        return {"accessToken": "token-123"}

    def fake_get_json(url, params, headers=None):
        assert url == "https://api.dingtalk.com/v1.0/contact/users/me"
        assert params == {}
        assert headers == {"x-acs-dingtalk-access-token": "token-123"}
        return {
            "unionId": "union-1",
            "userId": "user-1",
            "corpId": "corp-1",
            "nick": "Ding User",
            "avatarUrl": "https://example.test/ding.png",
            "email": "ding@example.test",
            "mobile": "13800000000",
            "admin": True,
            "boss": True,
        }

    monkeypatch.setattr("apps.accounts.oauth.dingtalk.post_json", fake_post_json)
    monkeypatch.setattr("apps.accounts.oauth.dingtalk.get_json", fake_get_json)

    profile = DingTalkOAuthAdapter().fetch_profile_by_code(
        code="code-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/dingtalk/callback",
    )

    assert profile.provider == "dingtalk"
    assert profile.tenant_id == "corp-1"
    assert profile.provider_account_id == "union-1"
    assert profile.union_id == "union-1"
    assert profile.open_id == "user-1"
    assert profile.nickname == "Ding User"
    assert profile.email == "ding@example.test"
    assert profile.phone == "13800000000"
    assert profile.raw_profile["admin"] is True
    assert profile.raw_profile["boss"] is True


@override_settings(OAUTH_DINGTALK_CLIENT_ID="dt-client-1", OAUTH_DINGTALK_CLIENT_SECRET="secret-1")
def test_dingtalk_falls_back_to_userid(monkeypatch):
    monkeypatch.setattr(
        "apps.accounts.oauth.dingtalk.post_json",
        lambda url, data, headers=None: {"accessToken": "token-123"},
    )
    monkeypatch.setattr(
        "apps.accounts.oauth.dingtalk.get_json",
        lambda url, params, headers=None: {"userId": "user-1", "corpId": "corp-1"},
    )

    profile = DingTalkOAuthAdapter().fetch_profile_by_code(
        code="code-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/dingtalk/callback",
    )

    assert profile.provider_account_id == "user-1"
    assert profile.union_id is None
    assert profile.open_id == "user-1"


@override_settings(
    OAUTH_DINGTALK_CLIENT_ID="dt-client-1",
    OAUTH_DINGTALK_CLIENT_SECRET="secret-1",
    OAUTH_DINGTALK_ALLOWED_CORP_IDS={"corp-allowed"},
)
def test_dingtalk_rejects_unallowed_corp(monkeypatch):
    monkeypatch.setattr(
        "apps.accounts.oauth.dingtalk.post_json",
        lambda url, data, headers=None: {"accessToken": "token-123"},
    )
    monkeypatch.setattr(
        "apps.accounts.oauth.dingtalk.get_json",
        lambda url, params, headers=None: {
            "unionId": "union-1",
            "userId": "user-1",
            "corpId": "corp-denied",
        },
    )

    with pytest.raises(OAuthProviderDisabled):
        DingTalkOAuthAdapter().fetch_profile_by_code(
            code="code-123",
            redirect_uri="https://chrono.test/api/v1/auth/oauth/dingtalk/callback",
        )


@override_settings(OAUTH_QQ_WEB_APP_ID="qq-web-1")
def test_qq_web_authorization_url_contains_expected_query():
    url = QQWebOAuthAdapter().build_authorization_url(
        state="state-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/qq_web/callback",
    )

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "graph.qq.com"
    assert parsed.path == "/oauth2.0/authorize"
    assert query["client_id"] == ["qq-web-1"]
    assert query["redirect_uri"] == ["https://chrono.test/api/v1/auth/oauth/qq_web/callback"]
    assert query["response_type"] == ["code"]
    assert query["state"] == ["state-123"]


@override_settings(OAUTH_QQ_WEB_APP_ID="qq-web-1", OAUTH_QQ_WEB_APP_KEY="secret-1")
def test_qq_web_normalizes_openid_profile(monkeypatch):
    def fake_get_json(url, params, headers=None):
        if url == "https://graph.qq.com/oauth2.0/token":
            assert params == {
                "grant_type": "authorization_code",
                "client_id": "qq-web-1",
                "client_secret": "secret-1",
                "code": "code-123",
                "redirect_uri": "https://chrono.test/api/v1/auth/oauth/qq_web/callback",
                "fmt": "json",
            }
            return {"access_token": "token-123"}
        if url == "https://graph.qq.com/oauth2.0/me":
            assert params == {"access_token": "token-123", "fmt": "json"}
            return {"openid": "openid-1", "client_id": "qq-web-1"}
        assert url == "https://graph.qq.com/user/get_user_info"
        assert params == {
            "access_token": "token-123",
            "oauth_consumer_key": "qq-web-1",
            "openid": "openid-1",
            "fmt": "json",
        }
        return {"nickname": "QQ User", "figureurl_qq_2": "https://example.test/qq.png"}

    monkeypatch.setattr("apps.accounts.oauth.qq.get_json", fake_get_json)

    profile = QQWebOAuthAdapter().fetch_profile_by_code(
        code="code-123",
        redirect_uri="https://chrono.test/api/v1/auth/oauth/qq_web/callback",
    )

    assert profile.provider == "qq_web"
    assert profile.tenant_id == "qq-web-1"
    assert profile.provider_account_id == "openid-1"
    assert profile.open_id == "openid-1"
    assert profile.nickname == "QQ User"
    assert profile.avatar_url == "https://example.test/qq.png"


@override_settings(OAUTH_QQ_MINI_APP_ID="qq-mini-1", OAUTH_QQ_MINI_APP_SECRET="secret-1")
def test_qq_miniprogram_uses_unionid_and_scrubs_session_key(monkeypatch):
    def fake_get_json(url, params, headers=None):
        assert url == "https://api.q.qq.com/sns/jscode2session"
        assert params == {
            "appid": "qq-mini-1",
            "secret": "secret-1",
            "js_code": "code-123",
            "grant_type": "authorization_code",
        }
        return {"openid": "openid-1", "unionid": "union-1", "session_key": "secret-session"}

    monkeypatch.setattr("apps.accounts.oauth.qq.get_json", fake_get_json)

    profile = QQMiniProgramAdapter().fetch_profile_by_login_code(
        "code-123",
        public_profile={"nickname": "QQ Mini User", "avatar_url": "https://example.test/qq.png"},
    )

    assert profile.provider == "qq_miniprogram"
    assert profile.tenant_id == "qq-mini-1"
    assert profile.provider_account_id == "union-1"
    assert profile.union_id == "union-1"
    assert profile.open_id == "openid-1"
    assert profile.raw_profile["session_key"] == "secret-session"
    assert "session_key" not in scrub_raw_profile(profile.raw_profile)


@override_settings(OAUTH_QQ_MINI_APP_ID="qq-mini-1", OAUTH_QQ_MINI_APP_SECRET="secret-1")
def test_qq_miniprogram_falls_back_to_openid(monkeypatch):
    monkeypatch.setattr(
        "apps.accounts.oauth.qq.get_json",
        lambda url, params, headers=None: {
            "openid": "openid-1",
            "session_key": "secret-session",
        },
    )

    profile = QQMiniProgramAdapter().fetch_profile_by_login_code("code-123")

    assert profile.provider_account_id == "openid-1"
    assert profile.union_id is None
    assert profile.open_id == "openid-1"
