from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q

from .managers import PermissionManager


class DataSchema(models.Model):
    """动态业务表定义。"""

    class TemporalMode(models.TextChoices):
        CONTINUOUS = "continuous", "连续型"
        PERIODIC = "periodic", "周期型"

    class PeriodUnit(models.TextChoices):
        DAY = "day", "日"
        WEEK = "week", "周"
        MONTH = "month", "月"
        QUARTER = "quarter", "季"
        HALF_YEAR = "half_year", "半年"
        YEAR = "year", "年"

    class Visibility(models.TextChoices):
        PRIVATE = "private", "私有"
        SHARED = "shared", "共享"
        PUBLIC = "public", "公共"

    schema_code = models.CharField(
        max_length=64,
        unique=True,
        validators=[
            RegexValidator(
                regex=r"^[a-z][a-z0-9_]*$",
                message="schema_code 只能使用小写字母、数字和下划线，且必须以字母开头",
            )
        ],
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon = models.TextField(blank=True)

    temporal_mode = models.CharField(
        max_length=20,
        choices=TemporalMode.choices,
        default=TemporalMode.CONTINUOUS,
    )
    period_unit = models.CharField(
        max_length=20,
        choices=PeriodUnit.choices,
        null=True,
        blank=True,
    )
    identity_field_key = models.CharField(max_length=64)

    fields_config = models.JSONField(default=list)
    label_print_config = models.JSONField(default=dict)
    current_version = models.PositiveIntegerField(default=1)
    config_migrated_at = models.DateTimeField(auto_now=True)

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="owned_schemas",
    )
    visibility = models.CharField(
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
    )
    approval_required = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.PROTECT,
    )
    is_archived = models.BooleanField(default=False)

    objects = PermissionManager()

    class Meta:
        verbose_name = "数据表"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["owner", "visibility"], name="idx_schema_owner_visibility"),
            models.Index(fields=["schema_code"], name="idx_schema_code"),
        ]
        constraints = [
            models.CheckConstraint(
                name="schema_period_unit_matches_mode",
                condition=(
                    Q(temporal_mode="continuous", period_unit__isnull=True)
                    | Q(temporal_mode="periodic", period_unit__isnull=False)
                ),
            ),
            models.CheckConstraint(
                name="schema_current_version_positive",
                condition=Q(current_version__gte=1),
            ),
            models.CheckConstraint(
                name="schema_code_format",
                condition=Q(schema_code__regex=r"^[a-z][a-z0-9_]*$"),
            ),
        ]

    def __str__(self) -> str:
        return self.name


class SchemaVersion(models.Model):
    """DataSchema 字段配置快照。"""

    schema = models.ForeignKey(DataSchema, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    fields_config = models.JSONField(default=list)
    changelog = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        verbose_name = "Schema 版本"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["schema", "version"],
                name="uniq_schema_version",
            ),
            models.CheckConstraint(
                name="schema_version_positive",
                condition=Q(version__gte=1),
            ),
        ]
        indexes = [
            models.Index(fields=["schema", "-version"], name="idx_schema_version_desc"),
        ]

    def __str__(self) -> str:
        return f"{self.schema.schema_code} v{self.version}"


class TableCollaborator(models.Model):
    """shared 表的协作者名单。"""

    class Role(models.TextChoices):
        EDITOR = "editor", "编辑者"
        VIEWER = "viewer", "查看者"

    schema = models.ForeignKey(DataSchema, on_delete=models.CASCADE, related_name="collaborators")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=Role.choices)
    added_at = models.DateTimeField(auto_now_add=True)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.PROTECT,
    )

    class Meta:
        verbose_name = "表协作者"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["schema", "user"],
                name="uniq_table_collaborator_schema_user",
            )
        ]
        indexes = [
            models.Index(fields=["user", "role"], name="idx_collaborator_user_role"),
        ]

    def __str__(self) -> str:
        return f"{self.role} -> {self.schema.schema_code}"
