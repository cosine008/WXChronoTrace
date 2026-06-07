from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "actor",
        "action",
        "target_type",
        "target_id",
        "is_sensitive",
        "created_at",
    )
    list_filter = ("action", "target_type", "is_sensitive", "created_at")
    search_fields = ("actor__username", "action", "target_type")
    readonly_fields = (
        "actor",
        "action",
        "target_type",
        "target_id",
        "detail",
        "is_sensitive",
        "ip_address",
        "created_at",
    )

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
