from django.contrib import admin

from .models import ChangeEntry, ChangeSet


class ChangeEntryInline(admin.TabularInline):
    model = ChangeEntry
    extra = 0
    readonly_fields = ("new_record",)


@admin.register(ChangeSet)
class ChangeSetAdmin(admin.ModelAdmin):
    list_display = ("id", "schema", "summary", "status", "source", "created_by", "created_at")
    list_filter = ("status", "source", "approval_required", "created_at")
    search_fields = ("summary", "schema__schema_code", "schema__name")
    readonly_fields = ("created_at",)
    inlines = [ChangeEntryInline]


@admin.register(ChangeEntry)
class ChangeEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "change_set", "entity", "action", "valid_from", "valid_to")
    list_filter = ("action", "valid_from")
    search_fields = ("change_set__summary", "entity__business_code")
