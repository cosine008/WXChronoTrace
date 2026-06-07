from __future__ import annotations

from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.audit.services import record_audit_log

from .models import ExternalIdentity, OAuthLoginIntent, UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = "扩展信息"
    fields = ("display_name", "is_active", "left_at")


class ChronoTraceUserAdmin(UserAdmin):
    inlines = (UserProfileInline,)
    list_display = (
        "username",
        "email",
        "display_name",
        "is_employed",
        "left_at",
        "is_staff",
        "is_superuser",
    )
    list_filter = UserAdmin.list_filter + ("profile__is_active",)
    actions = ("mark_as_left",)

    @admin.display(description="姓名", ordering="profile__display_name")
    def display_name(self, obj: User) -> str:
        profile = getattr(obj, "profile", None)
        return profile.display_name if profile and profile.display_name else obj.username

    @admin.display(description="在职", boolean=True, ordering="profile__is_active")
    def is_employed(self, obj: User) -> bool:
        profile = getattr(obj, "profile", None)
        return profile.is_active if profile else True

    @admin.display(description="离职日期", ordering="profile__left_at")
    def left_at(self, obj: User):
        profile = getattr(obj, "profile", None)
        return profile.left_at if profile else None

    @admin.action(description=_("标记为离职（停用账号 + 写离职日期）"))
    def mark_as_left(self, request, queryset):
        today = timezone.now().date()
        marked = 0
        skipped_owners = []
        for user in queryset:
            from apps.schemas.models import DataSchema

            owned = DataSchema.objects.filter(owner=user, is_archived=False).count()
            if owned > 0:
                skipped_owners.append(f"{user.username}（{owned} 张表）")
                continue
            profile, _created = UserProfile.objects.get_or_create(user=user)
            profile.is_active = False
            profile.left_at = today
            profile.save(update_fields=["is_active", "left_at"])
            user.is_active = False
            user.save(update_fields=["is_active"])
            record_audit_log(
                actor=request.user,
                action="admin.user_left",
                target_type="user",
                target_id=user.id,
                detail={"username": user.username, "left_at": today.isoformat()},
                ip_address=_admin_ip(request),
            )
            marked += 1
        if marked:
            self.message_user(request, f"已将 {marked} 个账号标记为离职", level=messages.SUCCESS)
        if skipped_owners:
            self.message_user(
                request,
                "以下账号尚为非归档表的 owner，请先移交后再标离职：" + "；".join(skipped_owners),
                level=messages.WARNING,
            )


def _admin_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


admin.site.unregister(User)
admin.site.register(User, ChronoTraceUserAdmin)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name", "is_active", "left_at")
    list_filter = ("is_active",)
    search_fields = ("user__username", "display_name")


@admin.register(ExternalIdentity)
class ExternalIdentityAdmin(admin.ModelAdmin):
    list_display = (
        "provider",
        "tenant_id",
        "user",
        "external_username",
        "nickname",
        "last_login_at",
        "created_at",
    )
    list_filter = ("provider", "created_at", "last_login_at")
    search_fields = (
        "user__username",
        "external_username",
        "nickname",
        "provider_account_id",
        "union_id",
        "open_id",
    )
    readonly_fields = ("created_at", "updated_at", "last_login_at")


@admin.register(OAuthLoginIntent)
class OAuthLoginIntentAdmin(admin.ModelAdmin):
    list_display = (
        "provider",
        "mode",
        "requested_by",
        "expires_at",
        "consumed_at",
        "created_at",
    )
    list_filter = ("provider", "mode", "consumed_at", "created_at")
    search_fields = ("state", "requested_by__username")
    readonly_fields = ("created_at",)
