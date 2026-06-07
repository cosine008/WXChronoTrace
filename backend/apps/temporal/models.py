from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeBoundary, RangeOperators
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import F, Func, Q

from .managers import TemporalRecordQuerySet


class DateRange(Func):
    """PostgreSQL daterange(valid_from, valid_to, '[)') 表达式。"""

    function = "DATERANGE"
    output_field = DateRangeField()


class Entity(models.Model):
    """业务实体的稳定锚点。"""

    schema = models.ForeignKey("schemas.DataSchema", on_delete=models.PROTECT)
    business_code = models.CharField(max_length=128, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        verbose_name = "实体"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["schema", "business_code"],
                name="uniq_entity_schema_business_code",
            )
        ]
        indexes = [
            models.Index(fields=["schema", "business_code"], name="idx_entity_schema_code"),
        ]

    def __str__(self) -> str:
        return f"{self.schema.schema_code}:{self.business_code}"


class TemporalRecord(models.Model):
    """某个 Entity 在一段有效时间内的数据快照。"""

    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name="records")
    schema_version = models.PositiveIntegerField()
    data_payload = models.JSONField(default=dict)

    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)

    change_set = models.ForeignKey("changesets.ChangeSet", on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    is_superseded = models.BooleanField(default=False)
    superseded_by = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )

    objects = TemporalRecordQuerySet.as_manager()

    class Meta:
        verbose_name = "时态记录"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["entity", "valid_from"], name="idx_tr_entity_vfrom"),
            models.Index(fields=["entity", "-valid_from"], name="idx_tr_entity_vfrom_desc"),
            GinIndex(fields=["data_payload"], name="idx_tr_data_payload_gin"),
        ]
        constraints = [
            models.CheckConstraint(
                name="valid_range_ok",
                condition=Q(valid_to__isnull=True) | Q(valid_to__gt=F("valid_from")),
            ),
            models.CheckConstraint(
                name="temporal_record_schema_version_positive",
                condition=Q(schema_version__gte=1),
            ),
            ExclusionConstraint(
                name="exclude_active_temporal_overlap",
                expressions=[
                    ("entity", RangeOperators.EQUAL),
                    (DateRange("valid_from", "valid_to", RangeBoundary()), RangeOperators.OVERLAPS),
                ],
                condition=Q(is_superseded=False),
            ),
        ]

    def __str__(self) -> str:
        end = self.valid_to.isoformat() if self.valid_to else "∞"
        return f"{self.entity.business_code} [{self.valid_from.isoformat()}, {end})"


def field_asset_upload_path(instance: "FieldFileAsset", filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return f"field_assets/schema_{instance.schema_id}/{instance.field_key}/{uuid4().hex}{suffix}"


class FieldFileAsset(models.Model):
    class ExtractionStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        READY = "ready", "Ready"
        UNSUPPORTED = "unsupported", "Unsupported"
        FAILED = "failed", "Failed"

    schema = models.ForeignKey(
        "schemas.DataSchema",
        on_delete=models.PROTECT,
        related_name="field_file_assets",
    )
    field_key = models.CharField(max_length=64, db_index=True)
    file = models.FileField(upload_to=field_asset_upload_path, blank=True)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    checksum = models.CharField(max_length=128, blank=True)
    extracted_text = models.TextField(blank=True)
    extracted_at = models.DateTimeField(null=True, blank=True)
    extraction_status = models.CharField(
        max_length=20,
        choices=ExtractionStatus.choices,
        default=ExtractionStatus.UNSUPPORTED,
    )
    extraction_error = models.CharField(max_length=255, blank=True)
    extraction_truncated = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "字段文件资产"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["schema", "field_key"], name="idx_file_asset_schema_field"),
            models.Index(fields=["uploaded_by", "-created_at"], name="idx_file_asset_uploader"),
        ]

    def __str__(self) -> str:
        return f"{self.schema_id}:{self.field_key}:{self.original_name}"
