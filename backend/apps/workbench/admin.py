from django.contrib import admin

from .models import (
    WorkbenchDataCardDetail,
    WorkbenchDataCardField,
    WorkbenchItem,
    WorkbenchLink,
    WorkbenchMaterialDetail,
    WorkbenchNoteDetail,
    WorkbenchUserSetting,
)


class WorkbenchMetadataDisplayMixin:
    @admin.display(description="Owner ID", ordering="owner_id")
    def owner_id_display(self, obj):
        return getattr(obj, "owner_id", None)

    @admin.display(description="Item ID", ordering="item_id")
    def item_id_display(self, obj):
        return getattr(obj, "item_id", None)

    @admin.display(description="Item Owner ID", ordering="item__owner_id")
    def item_owner_id_display(self, obj):
        if getattr(obj, "item_id", None) is None:
            return None
        return obj.item.owner_id

    @admin.display(description="Item Type", ordering="item__type")
    def item_type_display(self, obj):
        if getattr(obj, "item_id", None) is None:
            return None
        return obj.item.type

    @admin.display(description="Card ID", ordering="card_id")
    def card_id_display(self, obj):
        return getattr(obj, "card_id", None)

    @admin.display(description="Source Item ID", ordering="source_item_id")
    def source_item_id_display(self, obj):
        return getattr(obj, "source_item_id", None)

    @admin.display(description="Target Item ID", ordering="target_item_id")
    def target_item_id_display(self, obj):
        return getattr(obj, "target_item_id", None)

    @admin.display(description="Target Schema ID", ordering="target_schema_id")
    def target_schema_id_display(self, obj):
        return getattr(obj, "target_schema_id", None)


class ReadOnlyWorkbenchInline(WorkbenchMetadataDisplayMixin, admin.TabularInline):
    extra = 0
    can_delete = False
    show_change_link = False

    def has_add_permission(self, request, obj=None):
        return False


class ReadOnlyWorkbenchAdmin(WorkbenchMetadataDisplayMixin, admin.ModelAdmin):
    actions = None

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class WorkbenchDataCardFieldInline(ReadOnlyWorkbenchInline):
    model = WorkbenchDataCardField
    fields = ("id", "card_id_display", "value_type", "sort_order", "created_at", "updated_at")
    readonly_fields = fields


@admin.register(WorkbenchItem)
class WorkbenchItemAdmin(ReadOnlyWorkbenchAdmin):
    list_display = (
        "id",
        "owner_id_display",
        "type",
        "is_pinned",
        "is_archived",
        "is_sensitive",
        "deleted_at",
        "last_used_at",
        "updated_at",
    )
    list_filter = ("type", "is_pinned", "is_sensitive", "is_archived")
    search_fields = ("=id", "owner__username")
    readonly_fields = (
        "id",
        "owner_id_display",
        "type",
        "is_pinned",
        "is_archived",
        "is_sensitive",
        "deleted_at",
        "last_used_at",
        "created_at",
        "updated_at",
    )
    fields = readonly_fields


@admin.register(WorkbenchDataCardDetail)
class WorkbenchDataCardDetailAdmin(ReadOnlyWorkbenchAdmin):
    list_display = (
        "id",
        "item_id_display",
        "item_owner_id_display",
        "item_type_display",
        "category",
        "applicable_year",
        "status",
    )
    list_filter = ("category", "status", "applicable_year")
    search_fields = ("=id", "item__owner__username")
    readonly_fields = (
        "id",
        "item_id_display",
        "item_owner_id_display",
        "item_type_display",
        "category",
        "applicable_year",
        "effective_from",
        "effective_to",
        "status",
    )
    fields = readonly_fields
    inlines = [WorkbenchDataCardFieldInline]


@admin.register(WorkbenchDataCardField)
class WorkbenchDataCardFieldAdmin(ReadOnlyWorkbenchAdmin):
    list_display = ("id", "card_id_display", "value_type", "sort_order", "created_at", "updated_at")
    list_filter = ("value_type",)
    search_fields = ("=id", "card__item__owner__username")
    readonly_fields = ("id", "card_id_display", "value_type", "sort_order", "created_at", "updated_at")
    fields = readonly_fields


@admin.register(WorkbenchNoteDetail)
class WorkbenchNoteDetailAdmin(ReadOnlyWorkbenchAdmin):
    list_display = ("id", "item_id_display", "item_owner_id_display", "item_type_display", "stage", "status")
    list_filter = ("stage", "status")
    search_fields = ("=id", "item__owner__username")
    readonly_fields = ("id", "item_id_display", "item_owner_id_display", "item_type_display", "stage", "status")
    fields = readonly_fields


@admin.register(WorkbenchMaterialDetail)
class WorkbenchMaterialDetailAdmin(ReadOnlyWorkbenchAdmin):
    list_display = (
        "id",
        "item_id_display",
        "item_owner_id_display",
        "item_type_display",
        "content_type",
        "size",
        "preview_status",
        "updated_at",
    )
    list_filter = ("preview_status", "content_type")
    search_fields = ("=id", "item__owner__username")
    readonly_fields = (
        "id",
        "item_id_display",
        "item_owner_id_display",
        "item_type_display",
        "content_type",
        "size",
        "preview_status",
        "created_at",
        "updated_at",
    )
    fields = readonly_fields


@admin.register(WorkbenchLink)
class WorkbenchLinkAdmin(ReadOnlyWorkbenchAdmin):
    list_display = (
        "id",
        "owner_id_display",
        "source_item_id_display",
        "target_item_id_display",
        "target_schema_id_display",
        "created_at",
    )
    list_filter = ("created_at",)
    search_fields = ("=id", "owner__username")
    readonly_fields = (
        "id",
        "owner_id_display",
        "source_item_id_display",
        "target_item_id_display",
        "target_schema_id_display",
        "created_at",
    )
    fields = readonly_fields


@admin.register(WorkbenchUserSetting)
class WorkbenchUserSettingAdmin(ReadOnlyWorkbenchAdmin):
    list_display = (
        "id",
        "owner_id_display",
        "material_quota_bytes",
        "upload_disabled",
        "storage_used_bytes",
        "updated_at",
    )
    list_filter = ("upload_disabled",)
    search_fields = ("=id", "owner__username")
    readonly_fields = (
        "id",
        "owner_id_display",
        "material_quota_bytes",
        "upload_disabled",
        "storage_used_bytes",
        "created_at",
        "updated_at",
    )
    fields = readonly_fields
