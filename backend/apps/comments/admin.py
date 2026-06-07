from django.contrib import admin

from .models import Comment, CommentMention, CommentReadState, CommentThread


@admin.register(CommentThread)
class CommentThreadAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "schema",
        "anchor_type",
        "entity",
        "field_key",
        "status",
        "created_by",
        "comment_count",
        "last_activity_at",
    )
    list_filter = ("anchor_type", "status", "created_at", "last_activity_at")
    search_fields = ("=id", "schema__schema_code", "entity__business_code", "field_key")
    readonly_fields = ("created_at", "updated_at", "last_activity_at")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "thread", "created_by", "body_format", "is_system", "created_at", "deleted_at")
    list_filter = ("body_format", "is_system", "created_at", "deleted_at")
    search_fields = ("=id", "thread__id", "created_by__username", "body")
    readonly_fields = ("created_at",)


@admin.register(CommentMention)
class CommentMentionAdmin(admin.ModelAdmin):
    list_display = ("id", "comment", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("=id", "comment__id", "user__username")
    readonly_fields = ("created_at",)


@admin.register(CommentReadState)
class CommentReadStateAdmin(admin.ModelAdmin):
    list_display = ("id", "thread", "user", "last_read_at")
    list_filter = ("last_read_at",)
    search_fields = ("=id", "thread__id", "user__username")
