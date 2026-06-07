from __future__ import annotations

import secrets
from pathlib import Path

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


def generate_export_job_code() -> str:
    return f"EXP-{timezone.localdate():%Y%m%d}-{secrets.token_hex(8).upper()}"


def export_job_upload_to(instance: ExportJob, filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if not extension and instance.export_format:
        extension = f".{instance.export_format}"
    created_at = instance.created_at or timezone.now()
    return (
        f"exports/user_{instance.owner_id}/"
        f"{created_at:%Y}/{created_at:%m}/{instance.job_code}{extension}"
    )


class ExportJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "排队中"
        RUNNING = "running", "生成中"
        COMPLETED = "completed", "已完成"
        FAILED = "failed", "失败"
        EXPIRED = "expired", "已过期"
        CANCELED = "canceled", "已取消"

    class Scope(models.TextChoices):
        CURRENT_VIEW = "current_view", "当前视图"

    class Format(models.TextChoices):
        CSV = "csv", "CSV"
        XLSX = "xlsx", "Excel"

    job_code = models.CharField(
        max_length=40,
        unique=True,
        default=generate_export_job_code,
        editable=False,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="export_jobs",
    )
    schema = models.ForeignKey(
        "schemas.DataSchema",
        on_delete=models.PROTECT,
        related_name="export_jobs",
    )
    export_scope = models.CharField(
        max_length=32,
        choices=Scope.choices,
        default=Scope.CURRENT_VIEW,
    )
    export_format = models.CharField(max_length=8, choices=Format.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    snapshot_key = models.CharField(max_length=64)
    query_snapshot = models.JSONField(default=dict)

    row_count_estimate = models.PositiveIntegerField(default=0)
    row_count_actual = models.PositiveIntegerField(null=True, blank=True)
    risk_flags = models.JSONField(default=list)
    risk_details = models.JSONField(default=dict)
    risk_confirmed_at = models.DateTimeField(null=True, blank=True)
    risk_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )

    file = models.FileField(upload_to=export_job_upload_to, blank=True, max_length=255)
    filename = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=127, blank=True)
    file_size_bytes = models.PositiveBigIntegerField(default=0)

    error_code = models.CharField(max_length=64, blank=True)
    error_message = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "导出任务"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["owner", "-created_at"], name="idx_export_job_owner_created"),
            models.Index(fields=["owner", "status", "-created_at"], name="idx_export_job_owner_status"),
            models.Index(fields=["schema", "-created_at"], name="idx_export_job_schema_created"),
            models.Index(fields=["status", "created_at"], name="idx_export_job_status_created"),
            models.Index(fields=["expires_at"], name="idx_export_job_expires"),
            models.Index(
                fields=["owner", "schema", "export_scope", "export_format", "snapshot_key"],
                name="idx_export_job_snapshot",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "schema", "export_scope", "export_format", "snapshot_key"],
                condition=Q(status__in=["queued", "running"]),
                name="uniq_export_job_active_snapshot",
            )
        ]

    def __str__(self) -> str:
        return f"{self.job_code} {self.status}"
