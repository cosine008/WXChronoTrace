from django.contrib import admin

from .models import Entity, TemporalRecord


class TemporalRecordInline(admin.TabularInline):
    model = TemporalRecord
    extra = 0
    readonly_fields = ("recorded_at",)


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ("id", "schema", "business_code", "created_by", "created_at")
    list_filter = ("schema", "created_at")
    search_fields = ("business_code", "schema__schema_code", "schema__name")
    readonly_fields = ("created_at",)
    inlines = [TemporalRecordInline]


@admin.register(TemporalRecord)
class TemporalRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "schema_version",
        "valid_from",
        "valid_to",
        "is_superseded",
        "recorded_at",
    )
    list_filter = ("is_superseded", "valid_from", "recorded_at")
    search_fields = ("entity__business_code", "entity__schema__schema_code")
    readonly_fields = ("recorded_at",)
