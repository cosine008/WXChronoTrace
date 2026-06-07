# ruff: noqa: N818

class OAuthError(Exception):
    code = "OAUTH_ERROR"
    message = "第三方登录失败"
    status_code = 400

    def __init__(self, message: str | None = None):
        super().__init__(message or self.message)
        self.message = message or self.message


class OAuthProviderDisabled(OAuthError):
    code = "OAUTH_PROVIDER_DISABLED"
    message = "第三方登录方式未启用"
    status_code = 404


class OAuthStateInvalid(OAuthError):
    code = "OAUTH_STATE_INVALID"
    message = "OAuth state 无效"


class OAuthStateExpired(OAuthError):
    code = "OAUTH_STATE_EXPIRED"
    message = "OAuth state 已过期"


class OAuthStateConsumed(OAuthError):
    code = "OAUTH_STATE_CONSUMED"
    message = "OAuth state 已被使用"


class OAuthCodeExchangeFailed(OAuthError):
    code = "OAUTH_CODE_EXCHANGE_FAILED"
    message = "第三方授权码交换失败"


class OAuthProfileFetchFailed(OAuthError):
    code = "OAUTH_PROFILE_FETCH_FAILED"
    message = "第三方用户资料获取失败"
    status_code = 502


class OAuthProfileIncomplete(OAuthError):
    code = "OAUTH_PROFILE_INCOMPLETE"
    message = "第三方用户资料缺少稳定身份字段"


class OAuthIdentityAlreadyBound(OAuthError):
    code = "OAUTH_IDENTITY_ALREADY_BOUND"
    message = "该第三方账号已绑定其他 ChronoTrace 用户"
    status_code = 409


class AccountDisabled(OAuthError):
    code = "ACCOUNT_DISABLED"
    message = "账号已停用，请联系管理员"
    status_code = 403


class AutoRegisterDisabled(OAuthError):
    code = "AUTO_REGISTER_DISABLED"
    message = "第三方自动注册已关闭"
    status_code = 403


class LastLoginMethod(OAuthError):
    code = "LAST_LOGIN_METHOD"
    message = "当前账号没有本地密码，不能解绑最后一个第三方登录方式"
    status_code = 409
