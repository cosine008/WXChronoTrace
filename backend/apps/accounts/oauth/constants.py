WEB_OAUTH_PROVIDERS = {"github", "wechat_web", "dingtalk", "qq_web"}
CODE_SESSION_PROVIDERS = {"wechat_miniprogram", "qq_miniprogram"}
ALL_OAUTH_PROVIDERS = WEB_OAUTH_PROVIDERS | CODE_SESSION_PROVIDERS

PROVIDER_DEFAULT_DISPLAY_NAMES = {
    "github": "GitHub 用户",
    "wechat_web": "微信用户",
    "wechat_miniprogram": "微信用户",
    "dingtalk": "钉钉用户",
    "qq_web": "QQ 用户",
    "qq_miniprogram": "QQ 用户",
}
