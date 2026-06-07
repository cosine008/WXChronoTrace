from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class EntityLabel(models.Model):
    """实体在物理世界中的入口标签。"""

    class Status(models.TextChoices):
        ACTIVE = "active", "有效"
        REVOKED = "revoked", "作废"
        LOST = "lost", "遗失"
        REPLACED = "replaced", "已替换"

    label_code = models.CharField(max_length=32, unique=True)
    entity = models.ForeignKey("temporal.Entity", on_delete=models.CASCADE, related_name="labels")
    schema = models.ForeignKey("schemas.DataSchema", on_delete=models.PROTECT, related_name="labels")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    template_code = models.CharField(max_length=64, default="asset_standard")

    issued_at = models.DateTimeField(default=timezone.now)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="issued_entity_labels",
    )
    printed_at = models.DateTimeField(null=True, blank=True)
    printed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="printed_entity_labels",
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="revoked_entity_labels",
    )
    revoked_reason = models.TextField(blank=True)
    replaced_by = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replaces",
    )

    last_scanned_at = models.DateTimeField(null=True, blank=True)
    scan_count = models.PositiveIntegerField(default=0)
    print_snapshot = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "实体物理标签"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["entity", "status"], name="idx_label_entity_status"),
            models.Index(fields=["schema", "status"], name="idx_label_schema_status"),
            models.Index(fields=["label_code"], name="idx_label_code"),
            models.Index(fields=["last_scanned_at"], name="idx_label_last_scan"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["entity"],
                condition=Q(status="active"),
                name="uniq_active_label_per_entity",
            )
        ]

    def __str__(self) -> str:
        return f"{self.label_code} -> {self.entity_id}"


class LabelScanEvent(models.Model):
    """一次标签扫码尝试。"""

    class Outcome(models.TextChoices):
        RESOLVED = "resolved", "已解析"
        LOGIN_REQUIRED = "login_required", "需要登录"
        DENIED = "denied", "无权限"
        REVOKED = "revoked", "已作废"
        REPLACED = "replaced", "已替换"
        NOT_FOUND = "not_found", "未找到"
        INVALID = "invalid", "无效"

    class Source(models.TextChoices):
        QR_URL = "qr_url", "二维码 URL"
        BARCODE_INPUT = "barcode_input", "一维码输入"
        SCANNER_CONSOLE = "scanner_console", "扫码工作台"
        MOBILE_CAMERA = "mobile_camera", "手机相机"
        API = "api", "API"

    class RawInputKind(models.TextChoices):
        CODE = "code", "标签码"
        URL = "url", "URL"
        UNKNOWN = "unknown", "未知"

    label = models.ForeignKey(
        EntityLabel,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="scan_events",
    )
    label_code_hash = models.CharField(max_length=80, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="label_scan_events",
    )
    entity = models.ForeignKey(
        "temporal.Entity",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="label_scan_events",
    )
    schema = models.ForeignKey(
        "schemas.DataSchema",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="label_scan_events",
    )
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    source = models.CharField(max_length=32, choices=Source.choices, default=Source.API)
    ip_hash = models.CharField(max_length=80, blank=True)
    user_agent = models.TextField(blank=True)
    raw_input_kind = models.CharField(
        max_length=20,
        choices=RawInputKind.choices,
        default=RawInputKind.UNKNOWN,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "标签扫码事件"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["label", "-created_at"], name="idx_scan_label_created"),
            models.Index(fields=["schema", "-created_at"], name="idx_scan_schema_created"),
            models.Index(fields=["outcome", "-created_at"], name="idx_scan_outcome_created"),
        ]

    def __str__(self) -> str:
        return f"{self.outcome} {self.label_code_hash}"
