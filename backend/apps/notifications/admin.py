from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "recipient",
        "type",
        "severity",
        "title",
        "read_at",
        "archived_at",
        "created_at",
    )
    list_filter = ("type", "severity", "read_at", "archived_at", "created_at")
    search_fields = ("title", "body", "target_kind", "target_id", "recipient__username")
    readonly_fields = ("created_at",)
