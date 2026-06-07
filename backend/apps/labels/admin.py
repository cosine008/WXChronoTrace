from django.contrib import admin

from .models import EntityLabel, LabelScanEvent


@admin.register(EntityLabel)
class EntityLabelAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "label_code",
        "entity",
        "schema",
        "status",
        "template_code",
        "issued_by",
        "issued_at",
        "printed_at",
        "last_scanned_at",
        "scan_count",
    )
    list_filter = ("status", "template_code", "schema", "issued_at", "printed_at")
    search_fields = ("label_code", "entity__business_code", "schema__schema_code", "schema__name")
    readonly_fields = ("created_at", "updated_at", "last_scanned_at", "scan_count")


@admin.register(LabelScanEvent)
class LabelScanEventAdmin(admin.ModelAdmin):
    list_display = ("id", "label", "actor", "entity", "schema", "outcome", "source", "created_at")
    list_filter = ("outcome", "source", "raw_input_kind", "created_at")
    search_fields = ("label__label_code", "actor__username", "label_code_hash")
    readonly_fields = (
        "label",
        "label_code_hash",
        "actor",
        "entity",
        "schema",
        "outcome",
        "source",
        "ip_hash",
        "user_agent",
        "raw_input_kind",
        "created_at",
    )

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
