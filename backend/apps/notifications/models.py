from django.conf import settings
from django.db import models
from django.db.models import Q


class Notification(models.Model):
    class Type(models.TextChoices):
        COMMENT_MENTION = "comment_mention", "评论提及"
        COMMENT_REPLY = "comment_reply", "评论回复"
        APPROVAL_ASSIGNED = "approval_assigned", "审批待办"
        APPROVAL_UPDATED = "approval_updated", "审批更新"
        EXPORT_FINISHED = "export_finished", "导出完成"
        EXPORT_FAILED = "export_failed", "导出失败"
        SYSTEM_NOTICE = "system_notice", "系统通知"

    class Severity(models.TextChoices):
        INFO = "info", "信息"
        SUCCESS = "success", "成功"
        WARNING = "warning", "警告"
        ERROR = "error", "错误"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    type = models.CharField(max_length=64, choices=Type.choices)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.INFO)
    title = models.CharField(max_length=120)
    body = models.TextField(blank=True)
    target_kind = models.CharField(max_length=64, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    target_url = models.CharField(max_length=500, blank=True)
    payload = models.JSONField(default=dict)
    dedupe_key = models.CharField(max_length=191, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "站内通知"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "dedupe_key"],
                condition=~Q(dedupe_key=""),
                name="uniq_notification_recipient_dedupe",
            )
        ]
        indexes = [
            models.Index(
                fields=["recipient", "read_at", "-created_at"],
                name="idx_notification_unread",
            ),
            models.Index(
                fields=["recipient", "archived_at", "-created_at"],
                name="idx_notification_inbox",
            ),
            models.Index(fields=["type", "-created_at"], name="idx_notification_type_created"),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.type}:{self.recipient_id}:{self.title}"


class NotificationPreference(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    type = models.CharField(max_length=64, choices=Notification.Type.choices)
    in_app_enabled = models.BooleanField(default=True)
    external_enabled = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "通知偏好"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["user", "type"],
                name="uniq_notification_preference_user_type",
            )
        ]
        indexes = [
            models.Index(fields=["user", "type"], name="idx_notif_pref_user_type"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.type}"
