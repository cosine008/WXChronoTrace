from django.conf import settings
from django.db import models
from django.db.models import Q


class ChangeSet(models.Model):
    """一次提交的变更集合。"""

    class Status(models.TextChoices):
        DRAFT = "draft", "起草中"
        SUBMITTED = "submitted", "已提交"
        APPROVED = "approved", "已审批"
        REJECTED = "rejected", "已驳回"
        APPLIED = "applied", "已生效"
        REVERTED = "reverted", "已撤销"

    class Source(models.TextChoices):
        MANUAL = "manual", "手工"
        EXCEL = "excel", "导入"
        API = "api", "API"
        REVERT = "revert", "撤销"

    schema = models.ForeignKey("schemas.DataSchema", on_delete=models.PROTECT)
    summary = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    approval_required = models.BooleanField(default=False)
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_changesets",
    )
    applied_at = models.DateTimeField(null=True, blank=True)

    revert_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="reverted_by_sets",
        on_delete=models.SET_NULL,
    )
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)

    class Meta:
        verbose_name = "变更批次"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["schema", "-applied_at"], name="idx_changeset_schema_applied"),
            models.Index(fields=["created_by", "-created_at"], name="idx_changeset_creator"),
            models.Index(fields=["status", "-created_at"], name="idx_changeset_status"),
        ]

    def __str__(self) -> str:
        return f"CS#{self.pk} {self.status}"


class ChangeEntry(models.Model):
    """ChangeSet 下的单条变更明细。"""

    class Action(models.TextChoices):
        CREATE = "create", "新增"
        UPDATE = "update", "修改"
        TERMINATE = "terminate", "终止"

    change_set = models.ForeignKey(ChangeSet, on_delete=models.CASCADE, related_name="entries")
    entity = models.ForeignKey("temporal.Entity", on_delete=models.PROTECT)
    action = models.CharField(max_length=20, choices=Action.choices)

    data_before = models.JSONField(null=True, blank=True)
    data_after = models.JSONField(null=True, blank=True)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)

    new_record = models.ForeignKey(
        "temporal.TemporalRecord",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name = "变更明细"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["change_set", "action"], name="idx_changeentry_set_action"),
            models.Index(fields=["entity", "valid_from"], name="idx_changeentry_entity_vfrom"),
        ]
        constraints = [
            models.CheckConstraint(
                name="changeentry_valid_range_ok",
                condition=Q(valid_to__isnull=True) | Q(valid_to__gt=models.F("valid_from")),
            ),
            models.CheckConstraint(
                name="changeentry_payload_matches_action",
                condition=(
                    Q(action="create", data_before__isnull=True, data_after__isnull=False)
                    | Q(action="update", data_before__isnull=False, data_after__isnull=False)
                    | Q(action="terminate", data_before__isnull=False, data_after__isnull=True)
                ),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.entity.business_code}"
