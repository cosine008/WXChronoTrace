from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_view_schema

from .constants import DEFAULT_MATERIAL_QUOTA_BYTES


def workbench_material_upload_path(instance: WorkbenchMaterialDetail, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    owner_segment = _workbench_material_owner_segment(instance)
    return f"workbench_materials/{owner_segment}/{uuid4().hex}{suffix}"


def _workbench_material_owner_segment(instance: WorkbenchMaterialDetail) -> str:
    cached_item = instance._state.fields_cache.get("item")
    owner_id = _workbench_item_owner_id(cached_item)
    if owner_id is not None:
        return f"user_{owner_id}"

    item_id = getattr(instance, "item_id", None)
    if item_id is None:
        return "unknown"

    owner_id = WorkbenchItem.objects.filter(pk=item_id).values_list("owner_id", flat=True).first()
    if owner_id is None:
        return "unknown"
    return f"user_{owner_id}"


def _workbench_item_owner_id(item: WorkbenchItem | None) -> int | None:
    if item is None:
        return None
    return getattr(item, "owner_id", None) or getattr(getattr(item, "owner", None), "pk", None)


def _resolved_relation(instance: models.Model, field_name: str, model_class):
    cached = instance._state.fields_cache.get(field_name)
    if cached is not None:
        return cached

    related_id = getattr(instance, f"{field_name}_id", None)
    if related_id is None:
        return None
    return model_class.objects.filter(pk=related_id).first()


class FullCleanOnSaveMixin:
    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class WorkbenchItem(models.Model):
    class Type(models.TextChoices):
        DATA_CARD = "data_card", "资料卡"
        NOTE = "note", "笔记"
        MATERIAL = "material", "材料"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="workbench_items",
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    title = models.CharField(max_length=160)
    summary = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    is_pinned = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    is_sensitive = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "工作台条目"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["owner", "type", "deleted_at"], name="idx_wb_item_owner_type"),
            models.Index(fields=["owner", "is_pinned"], name="idx_wb_item_owner_pin"),
            models.Index(fields=["owner", "-last_used_at"], name="idx_wb_item_owner_last"),
            models.Index(fields=["owner", "-updated_at"], name="idx_wb_item_owner_upd"),
        ]

    def __str__(self) -> str:
        return f"WorkbenchItem<id={self.pk}, type={self.type}>"


class WorkbenchDataCardDetail(FullCleanOnSaveMixin, models.Model):
    class Category(models.TextChoices):
        ORGANIZATION = "organization", "组织"
        PEOPLE = "people", "人员"
        SOCIAL_SECURITY = "social_security", "社保"
        FINANCE = "finance", "财务"
        POLICY = "policy", "政策"
        IMPORT_TEMPLATE = "import_template", "导入模板"
        COMMON_TEXT = "common_text", "常用文本"
        OTHER = "other", "其他"

    class Status(models.TextChoices):
        DRAFT = "draft", "草稿"
        PENDING_CONFIRM = "pending_confirm", "待确认"
        CONFIRMED = "confirmed", "已确认"
        EXPIRED = "expired", "已过期"

    item = models.OneToOneField(
        WorkbenchItem,
        on_delete=models.CASCADE,
        related_name="data_card_detail",
    )
    category = models.CharField(
        max_length=32,
        choices=Category.choices,
        default=Category.OTHER,
    )
    applicable_year = models.PositiveIntegerField(null=True, blank=True)
    applicable_region = models.CharField(max_length=120, blank=True)
    applicable_subject = models.CharField(max_length=120, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    remark = models.TextField(blank=True)

    class Meta:
        verbose_name = "工作台资料卡明细"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"WorkbenchDataCardDetail<id={self.pk}, item_id={self.item_id}, category={self.category}>"

    def clean(self) -> None:
        super().clean()
        item = _resolved_relation(self, "item", WorkbenchItem)
        if item is not None and item.type != WorkbenchItem.Type.DATA_CARD:
            raise ValidationError({"item": "资料卡明细只能关联 data_card 类型条目"})


class WorkbenchDataCardField(models.Model):
    class ValueType(models.TextChoices):
        TEXT = "text", "文本"
        NUMBER = "number", "数字"
        DATE = "date", "日期"
        MONEY = "money", "金额"
        PERCENT = "percent", "百分比"
        BOOLEAN = "boolean", "布尔"
        URL = "url", "链接"
        LONGTEXT = "longtext", "长文本"

    card = models.ForeignKey(
        WorkbenchDataCardDetail,
        on_delete=models.CASCADE,
        related_name="fields",
    )
    name = models.CharField(max_length=120)
    value = models.TextField(blank=True)
    value_type = models.CharField(max_length=20, choices=ValueType.choices, default=ValueType.TEXT)
    unit = models.CharField(max_length=32, blank=True)
    remark = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "工作台资料项"
        verbose_name_plural = verbose_name
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["card", "sort_order"], name="idx_wb_field_card_sort"),
        ]

    def __str__(self) -> str:
        return f"WorkbenchDataCardField<id={self.pk}, card_id={self.card_id}, value_type={self.value_type}>"


class WorkbenchNoteDetail(FullCleanOnSaveMixin, models.Model):
    class Stage(models.TextChoices):
        PRE_SCHEMA = "pre_schema", "建表前"
        FIELD_DESIGN = "field_design", "字段设计"
        EXCEL_IMPORT = "excel_import", "Excel 导入"
        VALIDATION = "validation", "校验"
        APPROVAL = "approval", "审批"
        STATS_EXPORT = "stats_export", "统计导出"
        OTHER = "other", "其他"

    class Status(models.TextChoices):
        NORMAL = "normal", "正常"
        PENDING_CONFIRM = "pending_confirm", "待确认"
        CONFIRMED = "confirmed", "已确认"

    item = models.OneToOneField(
        WorkbenchItem,
        on_delete=models.CASCADE,
        related_name="note_detail",
    )
    markdown_content = models.TextField(blank=True)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.OTHER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NORMAL)

    class Meta:
        verbose_name = "工作台笔记明细"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return (
            f"WorkbenchNoteDetail<id={self.pk}, item_id={self.item_id}, "
            f"stage={self.stage}, status={self.status}>"
        )

    def clean(self) -> None:
        super().clean()
        item = _resolved_relation(self, "item", WorkbenchItem)
        if item is not None and item.type != WorkbenchItem.Type.NOTE:
            raise ValidationError({"item": "笔记明细只能关联 note 类型条目"})


class WorkbenchMaterialDetail(FullCleanOnSaveMixin, models.Model):
    class PreviewStatus(models.TextChoices):
        NONE = "none", "无"
        IMAGE = "image", "图片"
        TEXT = "text", "文本"
        FAILED = "failed", "失败"

    item = models.OneToOneField(
        WorkbenchItem,
        on_delete=models.CASCADE,
        related_name="material_detail",
    )
    file = models.FileField(upload_to=workbench_material_upload_path, blank=True)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    checksum = models.CharField(max_length=128, blank=True)
    description = models.TextField(blank=True)
    preview_status = models.CharField(
        max_length=20,
        choices=PreviewStatus.choices,
        default=PreviewStatus.NONE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "工作台材料明细"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["content_type"], name="idx_wb_mat_content"),
            models.Index(fields=["checksum"], name="idx_wb_mat_checksum"),
        ]

    def __str__(self) -> str:
        return (
            f"WorkbenchMaterialDetail<id={self.pk}, item_id={self.item_id}, "
            f"content_type={self.content_type}, size={self.size}>"
        )

    def clean(self) -> None:
        super().clean()
        item = _resolved_relation(self, "item", WorkbenchItem)
        if item is not None and item.type != WorkbenchItem.Type.MATERIAL:
            raise ValidationError({"item": "材料明细只能关联 material 类型条目"})


class WorkbenchMaterialChecklistItem(FullCleanOnSaveMixin, models.Model):
    class Status(models.TextChoices):
        MISSING = "missing", "未准备"
        UPLOADED = "uploaded", "已上传"
        PENDING_CONFIRM = "pending_confirm", "待确认"
        NOT_APPLICABLE = "not_applicable", "不适用"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="workbench_material_checklist_items",
    )
    schema = models.ForeignKey(
        "schemas.DataSchema",
        on_delete=models.CASCADE,
        related_name="workbench_checklist_items",
    )
    title = models.CharField(max_length=160)
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.MISSING,
    )
    linked_material = models.ForeignKey(
        WorkbenchItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="material_checklist_items",
    )
    note = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "工作台材料清单项"
        verbose_name_plural = verbose_name
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["owner", "schema", "sort_order"], name="idx_wb_chk_owner_sort"),
        ]

    def __str__(self) -> str:
        return f"WorkbenchMaterialChecklistItem<id={self.pk}, schema_id={self.schema_id}>"

    def clean(self) -> None:
        super().clean()
        linked_material = _resolved_relation(self, "linked_material", WorkbenchItem)
        if linked_material is None:
            return

        owner = self._state.fields_cache.get("owner")
        if owner is None and self.owner_id is not None:
            owner = self.owner
        owner_id = self.owner_id or getattr(owner, "pk", None)
        linked_owner_id = linked_material.owner_id or getattr(getattr(linked_material, "owner", None), "pk", None)

        if linked_material.type != WorkbenchItem.Type.MATERIAL:
            raise ValidationError({"linked_material": "linked_material must reference a material item"})
        if linked_material.deleted_at is not None:
            raise ValidationError({"linked_material": "linked_material must not be deleted"})
        if owner_id is not None and linked_owner_id is not None and owner_id != linked_owner_id:
            raise ValidationError({"linked_material": "linked_material owner must match checklist owner"})


class WorkbenchLink(FullCleanOnSaveMixin, models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="workbench_links",
    )
    source_item = models.ForeignKey(
        WorkbenchItem,
        on_delete=models.CASCADE,
        related_name="outgoing_links",
    )
    target_item = models.ForeignKey(
        WorkbenchItem,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="incoming_links",
    )
    target_schema = models.ForeignKey(
        "schemas.DataSchema",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="workbench_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "工作台关联"
        verbose_name_plural = verbose_name
        constraints = [
            models.CheckConstraint(
                name="wb_link_exactly_one_target",
                condition=(
                    Q(target_item__isnull=False, target_schema__isnull=True)
                    | Q(target_item__isnull=True, target_schema__isnull=False)
                ),
            ),
            models.UniqueConstraint(
                fields=["owner", "source_item", "target_item"],
                condition=Q(target_item__isnull=False),
                name="uniq_wb_link_item_target",
            ),
            models.UniqueConstraint(
                fields=["owner", "source_item", "target_schema"],
                condition=Q(target_schema__isnull=False),
                name="uniq_wb_link_schema_target",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "source_item"], name="idx_wb_link_owner_src"),
            models.Index(fields=["owner", "target_schema"], name="idx_wb_link_owner_sch"),
        ]

    def __str__(self) -> str:
        return (
            f"WorkbenchLink<id={self.pk}, source_item_id={self.source_item_id}, "
            f"target_item_id={self.target_item_id}, target_schema_id={self.target_schema_id}>"
        )

    def clean(self) -> None:
        super().clean()
        target_item = _resolved_relation(self, "target_item", WorkbenchItem)
        target_schema = _resolved_relation(self, "target_schema", DataSchema)
        has_target_item = self.target_item_id is not None or target_item is not None
        has_target_schema = self.target_schema_id is not None or target_schema is not None
        if has_target_item == has_target_schema:
            raise ValidationError("必须且只能设置一个关联目标")

        owner = self._state.fields_cache.get("owner")
        if owner is None and self.owner_id is not None:
            owner = self.owner
        owner_id = self.owner_id or getattr(owner, "pk", None)

        source_item = _resolved_relation(self, "source_item", WorkbenchItem)
        if source_item is not None:
            source_owner_id = source_item.owner_id or getattr(getattr(source_item, "owner", None), "pk", None)
            if owner_id is not None and source_owner_id is not None and owner_id != source_owner_id:
                raise ValidationError({"source_item": "source_item 所属 owner 与链接 owner 不一致"})

        if target_item is not None:
            target_owner_id = target_item.owner_id or getattr(getattr(target_item, "owner", None), "pk", None)
            if owner_id is not None and target_owner_id is not None and owner_id != target_owner_id:
                raise ValidationError({"target_item": "target_item 所属 owner 与链接 owner 不一致"})

        if (
            owner is not None
            and getattr(owner, "pk", None) is not None
            and target_schema is not None
            and getattr(target_schema, "pk", None) is not None
            and not can_view_schema(owner, target_schema)
        ):
            raise ValidationError({"target_schema": "target_schema 对当前链接 owner 不可见"})


class WorkbenchUserSetting(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workbench_setting",
    )
    material_quota_bytes = models.PositiveBigIntegerField(default=DEFAULT_MATERIAL_QUOTA_BYTES)
    upload_disabled = models.BooleanField(default=False)
    storage_used_bytes = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "工作台用户设置"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"WorkbenchSetting<{self.owner_id}>"
