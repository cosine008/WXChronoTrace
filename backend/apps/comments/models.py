from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class CommentThread(models.Model):
    class AnchorType(models.TextChoices):
        SCHEMA = "schema", "表"
        ROW = "row", "行"
        CELL = "cell", "单元格"
        CHANGESET_ENTRY = "changeset_entry", "变更明细"

    class Status(models.TextChoices):
        OPEN = "open", "未解决"
        RESOLVED = "resolved", "已解决"

    schema = models.ForeignKey("schemas.DataSchema", on_delete=models.PROTECT)
    anchor_type = models.CharField(max_length=32, choices=AnchorType.choices)
    entity = models.ForeignKey(
        "temporal.Entity",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="comment_threads",
    )
    field_key = models.CharField(max_length=64, blank=True, db_index=True)
    change_entry = models.ForeignKey(
        "changesets.ChangeEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="comment_threads",
    )

    created_at_context_date = models.DateField(null=True, blank=True)
    record_at_creation = models.ForeignKey(
        "temporal.TemporalRecord",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="comment_threads_at_creation",
    )
    record_valid_from_snapshot = models.DateField(null=True, blank=True)
    record_valid_to_snapshot = models.DateField(null=True, blank=True)
    value_snapshot = models.JSONField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_comment_threads",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_activity_at = models.DateTimeField(default=timezone.now)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resolved_comment_threads",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    comment_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "评论线程"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(
                fields=["schema", "anchor_type", "entity", "field_key", "status"],
                name="idx_comment_anchor_status",
            ),
            models.Index(fields=["schema", "last_activity_at"], name="idx_comment_schema_activity"),
            models.Index(fields=["entity", "field_key"], name="idx_comment_entity_field"),
            models.Index(fields=["change_entry"], name="idx_comment_change_entry"),
            models.Index(fields=["created_by", "last_activity_at"], name="idx_comment_creator_activity"),
        ]

    def clean(self) -> None:
        super().clean()
        errors = {}

        if self.anchor_type == self.AnchorType.SCHEMA:
            if self.entity_id or self.entity:
                errors["entity"] = "schema anchor 不允许设置 entity。"
            if self.field_key:
                errors["field_key"] = "schema anchor 不允许设置 field_key。"
            if self.change_entry_id or self.change_entry:
                errors["change_entry"] = "schema anchor 不允许设置 change_entry。"
        elif self.anchor_type == self.AnchorType.ROW:
            self._validate_entity_anchor(errors)
            if self.field_key:
                errors["field_key"] = "row anchor 不允许设置 field_key。"
            if self.change_entry_id or self.change_entry:
                errors["change_entry"] = "row anchor 不允许设置 change_entry。"
        elif self.anchor_type == self.AnchorType.CELL:
            self._validate_entity_anchor(errors)
            if not self.field_key:
                errors["field_key"] = "cell anchor 必须设置 field_key。"
            if self.change_entry_id or self.change_entry:
                errors["change_entry"] = "cell anchor 不允许设置 change_entry。"
        elif self.anchor_type == self.AnchorType.CHANGESET_ENTRY:
            if not (self.change_entry_id or self.change_entry):
                errors["change_entry"] = "changeset_entry anchor 必须设置 change_entry。"
            elif self._change_entry_schema_id() != self.schema_id:
                errors["change_entry"] = "change_entry 必须属于当前 schema。"
        else:
            errors["anchor_type"] = "不支持的评论锚点类型。"

        if errors:
            raise ValidationError(errors)

    def _validate_entity_anchor(self, errors: dict[str, str]) -> None:
        if not (self.entity_id or self.entity):
            errors["entity"] = "row/cell anchor 必须设置 entity。"
            return
        if self._entity_schema_id() != self.schema_id:
            errors["entity"] = "entity 必须属于当前 schema。"

    def _entity_schema_id(self) -> int | None:
        if self.entity_id and not self.entity:
            return None
        return getattr(self.entity, "schema_id", None)

    def _change_entry_schema_id(self) -> int | None:
        if self.change_entry_id and not self.change_entry:
            return None
        change_set = getattr(self.change_entry, "change_set", None)
        return getattr(change_set, "schema_id", None)

    def __str__(self) -> str:
        return f"{self.anchor_type}:{self.schema_id}:{self.status}"


class Comment(models.Model):
    class BodyFormat(models.TextChoices):
        PLAIN = "plain", "纯文本"

    thread = models.ForeignKey(CommentThread, on_delete=models.CASCADE, related_name="comments")
    body = models.TextField()
    body_format = models.CharField(
        max_length=20,
        choices=BodyFormat.choices,
        default=BodyFormat.PLAIN,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_comments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    is_system = models.BooleanField(default=False)

    class Meta:
        verbose_name = "评论"
        verbose_name_plural = verbose_name
        indexes = [
            models.Index(fields=["thread", "created_at"], name="idx_comment_thread_created"),
            models.Index(fields=["created_by", "created_at"], name="idx_comment_author_created"),
        ]

    def clean(self) -> None:
        super().clean()
        if not self.body or not self.body.strip():
            raise ValidationError({"body": "评论正文不能为空。"})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Comment#{self.pk or 'new'} thread={self.thread_id}"


class CommentMention(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="mentions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "评论提及"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(fields=["comment", "user"], name="uniq_comment_mention_user"),
        ]
        indexes = [
            models.Index(fields=["user", "comment"], name="idx_mention_user_comment"),
        ]

    def __str__(self) -> str:
        return f"mention user={self.user_id} comment={self.comment_id}"


class CommentReadState(models.Model):
    thread = models.ForeignKey(CommentThread, on_delete=models.CASCADE, related_name="read_states")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    last_read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "评论已读状态"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(fields=["thread", "user"], name="uniq_comment_read_user"),
        ]
        indexes = [
            models.Index(fields=["user", "thread"], name="idx_read_state_user_thread"),
        ]

    def __str__(self) -> str:
        return f"read user={self.user_id} thread={self.thread_id}"
