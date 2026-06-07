from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models


class AuditLog(models.Model):
    """操作日志。数据库触发器保证插入后不可修改、不可删除。"""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=64)
    target_type = models.CharField(max_length=32)
    target_id = models.BigIntegerField(null=True, blank=True)
    detail = models.JSONField(default=dict)
    is_sensitive = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "审计日志"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["actor", "-created_at"], name="idx_audit_actor_created"),
            models.Index(fields=["target_type", "target_id"], name="idx_audit_target"),
            models.Index(fields=["is_sensitive", "-created_at"], name="idx_audit_sensitive"),
            GinIndex(fields=["detail"], name="idx_audit_detail_gin"),
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.target_type}#{self.target_id}"
