from django.contrib import admin

from .models import DataSchema, SchemaVersion, TableCollaborator


@admin.register(DataSchema)
class DataSchemaAdmin(admin.ModelAdmin):
    list_display = (
        "schema_code",
        "name",
        "temporal_mode",
        "visibility",
        "owner",
        "current_version",
        "is_archived",
    )
    list_filter = ("temporal_mode", "visibility", "approval_required", "is_archived")
    search_fields = ("schema_code", "name", "description")
    readonly_fields = ("created_at", "config_migrated_at")


@admin.register(SchemaVersion)
class SchemaVersionAdmin(admin.ModelAdmin):
    list_display = ("schema", "version", "created_by", "created_at")
    list_filter = ("created_at",)
    search_fields = ("schema__schema_code", "schema__name", "changelog")
    readonly_fields = ("created_at",)


@admin.register(TableCollaborator)
class TableCollaboratorAdmin(admin.ModelAdmin):
    list_display = ("schema", "user", "role", "added_by", "added_at")
    list_filter = ("role", "added_at")
    search_fields = ("schema__schema_code", "schema__name", "user__username")
    readonly_fields = ("added_at",)
