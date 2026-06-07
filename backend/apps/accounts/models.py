from django.db import models


class UserProfile(models.Model):
    """扩展 User 基础信息。详见 SRS 3.9。"""

    user = models.OneToOneField(
        "auth.User", on_delete=models.CASCADE, related_name="profile"
    )
    display_name = models.CharField(max_length=64, blank=True)
    is_active = models.BooleanField(default=True, verbose_name="是否在职")
    left_at = models.DateField(null=True, blank=True, verbose_name="离职日期")

    class Meta:
        verbose_name = "用户扩展信息"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return self.display_name or self.user.username


class ExternalIdentity(models.Model):
    """第三方身份绑定记录。第三方平台只作为认证来源，本地 User 仍是权限主体。"""

    class Provider(models.TextChoices):
        GITHUB = "github", "GitHub"
        WECHAT_WEB = "wechat_web", "微信网站"
        WECHAT_MINIPROGRAM = "wechat_miniprogram", "微信小程序"
        DINGTALK = "dingtalk", "钉钉"
        QQ_WEB = "qq_web", "QQ 网站"
        QQ_MINIPROGRAM = "qq_miniprogram", "QQ 小程序"

    user = models.ForeignKey(
        "auth.User", on_delete=models.CASCADE, related_name="external_identities"
    )
    provider = models.CharField(max_length=32, choices=Provider.choices)
    tenant_id = models.CharField(max_length=128, null=True, blank=True)
    provider_account_id = models.CharField(max_length=191)
    union_id = models.CharField(max_length=191, null=True, blank=True)
    open_id = models.CharField(max_length=191, null=True, blank=True)
    external_username = models.CharField(max_length=191, blank=True)
    nickname = models.CharField(max_length=191, blank=True)
    avatar_url = models.URLField(max_length=500, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    raw_profile = models.JSONField(default=dict)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "第三方身份"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "tenant_id", "provider_account_id"],
                name="uniq_external_identity_stable_account",
                nulls_distinct=False,
            ),
            models.UniqueConstraint(
                fields=["provider", "tenant_id", "union_id"],
                condition=models.Q(union_id__isnull=False),
                name="uniq_external_identity_union_id",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "provider"], name="idx_ext_identity_user_provider"),
            models.Index(fields=["provider", "tenant_id", "open_id"], name="idx_ext_identity_openid"),
            models.Index(fields=["last_login_at"], name="idx_ext_identity_last_login"),
        ]

    def __str__(self) -> str:
        label = self.nickname or self.external_username or self.provider_account_id
        return f"{self.provider}:{label}"


class OAuthLoginIntent(models.Model):
    """OAuth start 和 callback 之间的短期服务端 state。"""

    class Mode(models.TextChoices):
        REGISTER_LOGIN = "register_login", "注册或登录"
        BIND = "bind", "绑定"

    state = models.CharField(max_length=128, unique=True)
    provider = models.CharField(max_length=32, choices=ExternalIdentity.Provider.choices)
    mode = models.CharField(max_length=32, choices=Mode.choices)
    next_path = models.CharField(max_length=500, default="/")
    requested_by = models.ForeignKey(
        "auth.User",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="oauth_login_intents",
    )
    created_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "OAuth 登录意图"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["provider", "mode", "created_at"], name="idx_oauth_intent_lookup"),
            models.Index(fields=["expires_at"], name="idx_oauth_intent_expires"),
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.mode}:{self.state}"
