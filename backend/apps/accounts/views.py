import logging

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.audit.services import record_audit_log

from .lockout import is_locked_out, register_failure, reset_failures
from .models import UserProfile

logger = logging.getLogger(__name__)


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(style={"input_type": "password"})
    remember = serializers.BooleanField(required=False, default=False)


class MeSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    is_staff = serializers.BooleanField(read_only=True)
    is_superuser = serializers.BooleanField(read_only=True)
    is_employed = serializers.SerializerMethodField()
    left_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "display_name",
            "email",
            "is_staff",
            "is_superuser",
            "is_employed",
            "left_at",
        ]

    def get_display_name(self, obj: User) -> str:
        profile = getattr(obj, "profile", None)
        if profile and profile.display_name:
            return profile.display_name
        return obj.username

    def get_is_employed(self, obj: User) -> bool:
        profile = getattr(obj, "profile", None)
        if profile is None:
            return obj.is_active
        return profile.is_active and obj.is_active

    def get_left_at(self, obj: User):
        profile = getattr(obj, "profile", None)
        return profile.left_at.isoformat() if profile and profile.left_at else None


class UserListSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    is_superuser = serializers.BooleanField(read_only=True)
    is_employed = serializers.SerializerMethodField()
    left_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "display_name",
            "email",
            "is_superuser",
            "is_employed",
            "left_at",
        ]

    def get_display_name(self, obj: User) -> str:
        profile = getattr(obj, "profile", None)
        if profile and profile.display_name:
            return profile.display_name
        return obj.username

    def get_is_employed(self, obj: User) -> bool:
        profile = getattr(obj, "profile", None)
        if profile is None:
            return obj.is_active
        return profile.is_active and obj.is_active

    def get_left_at(self, obj: User):
        profile = getattr(obj, "profile", None)
        return profile.left_at.isoformat() if profile and profile.left_at else None


@extend_schema(responses={200: None})
@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_view(request):
    get_token(request)
    return Response({"detail": "ok"})


@extend_schema(request=LoginSerializer, responses={200: MeSerializer, 400: None, 423: None})
@api_view(["POST"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    username = serializer.validated_data["username"]
    password = serializer.validated_data["password"]
    remember = serializer.validated_data.get("remember", False)
    ip = _client_ip(request)

    locked_until = is_locked_out(username, ip)
    if locked_until is not None:
        return Response(
            {
                "error": {
                    "code": "ACCOUNT_LOCKED",
                    "message": "登录失败次数过多，账号已临时锁定，请稍后再试",
                    "locked_until": locked_until.isoformat(),
                }
            },
            status=status.HTTP_423_LOCKED,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        remaining = register_failure(username, ip)
        existing = User.objects.filter(username=username).first()
        if existing is not None:
            record_audit_log(
                actor=existing,
                action="login_failed",
                target_type="user",
                target_id=existing.id,
                detail={"username": username, "remaining_attempts": remaining},
                ip_address=ip,
            )
        else:
            logger.info("login_failed username=%s ip=%s (no such user)", username, ip)
        return Response(
            {"error": {"code": "INVALID_CREDENTIALS", "message": "用户名或密码错误"}},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reset_failures(username, ip)
    login(request, user)
    if remember:
        request.session.set_expiry(60 * 60 * 24 * 7)  # 7 天
    else:
        request.session.set_expiry(60 * 60 * 8)  # 8 小时（同 settings 默认）
    # get_token MUST be called AFTER login() — login rotates the session,
    # invalidating any CSRF token generated before it.
    get_token(request)
    record_audit_log(
        actor=user,
        action="login",
        target_type="user",
        target_id=user.id,
        detail={"username": user.username, "remember": remember},
        ip_address=ip,
    )
    return Response(MeSerializer(user).data)


@extend_schema(responses={204: None})
@api_view(["POST"])
def logout_view(request):
    user = request.user if request.user.is_authenticated else None
    ip = _client_ip(request)
    logout(request)
    if user is not None:
        record_audit_log(
            actor=user,
            action="logout",
            target_type="user",
            target_id=user.id,
            detail={"username": user.username},
            ip_address=ip,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(responses={200: MeSerializer})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@ensure_csrf_cookie
def me_view(request):
    get_token(request)
    return Response(MeSerializer(request.user).data)


class AdminUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(min_length=8, max_length=128)
    email = serializers.EmailField(required=False, allow_blank=True)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=64)
    is_superuser = serializers.BooleanField(required=False, default=False)

    def validate_username(self, value: str) -> str:
        username = value.strip()
        if not username:
            raise serializers.ValidationError("用户名不能为空")
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("用户名已存在")
        return username


class AdminUserUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=64)
    is_superuser = serializers.BooleanField(required=False)


@extend_schema(
    request=AdminUserCreateSerializer,
    responses={200: UserListSerializer(many=True), 201: UserListSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def user_list_view(request):
    if request.method == "POST":
        return _create_admin_user(request)

    include_inactive = request.query_params.get("include_inactive") in {"1", "true", "yes"}
    if include_inactive and not request.user.is_superuser:
        return Response(
            {"error": {"code": "FORBIDDEN", "message": "仅管理员可查看离职用户"}},
            status=status.HTTP_403_FORBIDDEN,
        )
    queryset = User.objects.all() if include_inactive else User.objects.filter(is_active=True)
    return Response(UserListSerializer(queryset.order_by("id"), many=True).data)


def _create_admin_user(request):
    if not request.user.is_superuser:
        return Response(
            {"error": {"code": "FORBIDDEN", "message": "仅管理员可创建账号"}},
            status=status.HTTP_403_FORBIDDEN,
        )
    serializer = AdminUserCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    with transaction.atomic():
        if data["is_superuser"]:
            user = User.objects.create_superuser(
                username=data["username"],
                email=data.get("email", ""),
                password=data["password"],
            )
        else:
            user = User.objects.create_user(
                username=data["username"],
                email=data.get("email", ""),
                password=data["password"],
            )
        UserProfile.objects.create(user=user, display_name=data.get("display_name", ""))
        record_audit_log(
            actor=request.user,
            action="admin.user_create",
            target_type="user",
            target_id=user.id,
            detail={"username": user.username, "is_superuser": user.is_superuser},
            ip_address=_client_ip(request),
        )
    return Response(UserListSerializer(user).data, status=status.HTTP_201_CREATED)


@extend_schema(request=AdminUserUpdateSerializer, responses={200: UserListSerializer})
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_user_detail_view(request, user_id: int):
    if not request.user.is_superuser:
        return Response(
            {"error": {"code": "FORBIDDEN", "message": "仅管理员可更新账号"}},
            status=status.HTTP_403_FORBIDDEN,
        )
    target = User.objects.filter(pk=user_id).first()
    if target is None:
        return Response(
            {"error": {"code": "NOT_FOUND", "message": "用户不存在"}},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = AdminUserUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if target.pk == request.user.pk and serializer.validated_data.get("is_superuser") is False:
        return Response(
            {"error": {"code": "SELF_DEMOTE", "message": "不能取消自己的管理员权限"}},
            status=status.HTTP_400_BAD_REQUEST,
        )
    changed_fields = _update_admin_user(target, serializer.validated_data)
    if changed_fields:
        record_audit_log(
            actor=request.user,
            action="admin.user_update",
            target_type="user",
            target_id=target.id,
            detail={"username": target.username, "changed_fields": changed_fields},
            ip_address=_client_ip(request),
        )
    return Response(UserListSerializer(target).data)


def _update_admin_user(target: User, data: dict) -> list[str]:
    changed_fields = []
    update_fields = []
    if "email" in data and target.email != data["email"]:
        target.email = data["email"]
        changed_fields.append("email")
        update_fields.append("email")
    if "is_superuser" in data and target.is_superuser != data["is_superuser"]:
        target.is_superuser = data["is_superuser"]
        target.is_staff = data["is_superuser"]
        changed_fields.append("is_superuser")
        update_fields.extend(["is_superuser", "is_staff"])
    if update_fields:
        target.save(update_fields=update_fields)
    if "display_name" in data:
        profile, _created = UserProfile.objects.get_or_create(user=target)
        if profile.display_name != data["display_name"]:
            profile.display_name = data["display_name"]
            profile.save(update_fields=["display_name"])
            changed_fields.append("display_name")
    return sorted(changed_fields)


class AdminResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(min_length=8, max_length=128)


@extend_schema(request=AdminResetPasswordSerializer, responses={204: None})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_reset_password_view(request, user_id: int):
    if not request.user.is_superuser:
        return Response(
            {"error": {"code": "FORBIDDEN", "message": "仅管理员可重置密码"}},
            status=status.HTTP_403_FORBIDDEN,
        )
    target = User.objects.filter(pk=user_id).first()
    if target is None:
        return Response(
            {"error": {"code": "NOT_FOUND", "message": "用户不存在"}},
            status=status.HTTP_404_NOT_FOUND,
        )
    serializer = AdminResetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    target.set_password(serializer.validated_data["new_password"])
    target.save(update_fields=["password"])
    record_audit_log(
        actor=request.user,
        action="admin.password_reset",
        target_type="user",
        target_id=target.id,
        detail={"username": target.username},
        ip_address=_client_ip(request),
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(responses={204: None})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_mark_left_view(request, user_id: int):
    if not request.user.is_superuser:
        return Response(
            {"error": {"code": "FORBIDDEN", "message": "仅管理员可标记离职"}},
            status=status.HTTP_403_FORBIDDEN,
        )
    target = User.objects.filter(pk=user_id).first()
    if target is None:
        return Response(
            {"error": {"code": "NOT_FOUND", "message": "用户不存在"}},
            status=status.HTTP_404_NOT_FOUND,
        )

    from apps.schemas.models import DataSchema

    blocking = list(
        DataSchema.objects.filter(owner=target, is_archived=False).values_list("id", "name")
    )
    if blocking:
        blocking_schemas = [{"id": sid, "name": name} for sid, name in blocking]
        return Response(
            {
                "error": {
                    "code": "OWNS_SCHEMAS",
                    "message": "该用户仍是非归档表的 owner，请先移交",
                    "details": {"schemas": blocking_schemas},
                    "schemas": blocking_schemas,
                }
            },
            status=status.HTTP_409_CONFLICT,
        )

    from django.utils import timezone

    from .models import UserProfile

    today = timezone.now().date()
    profile, _created = UserProfile.objects.get_or_create(user=target)
    profile.is_active = False
    profile.left_at = today
    profile.save(update_fields=["is_active", "left_at"])
    target.is_active = False
    target.save(update_fields=["is_active"])
    record_audit_log(
        actor=request.user,
        action="admin.user_left",
        target_type="user",
        target_id=target.id,
        detail={"username": target.username, "left_at": today.isoformat()},
        ip_address=_client_ip(request),
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(responses={204: None})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_restore_user_view(request, user_id: int):
    if not request.user.is_superuser:
        return Response(
            {"error": {"code": "FORBIDDEN", "message": "仅管理员可恢复账号"}},
            status=status.HTTP_403_FORBIDDEN,
        )
    target = User.objects.filter(pk=user_id).first()
    if target is None:
        return Response(
            {"error": {"code": "NOT_FOUND", "message": "用户不存在"}},
            status=status.HTTP_404_NOT_FOUND,
        )

    profile, _created = UserProfile.objects.get_or_create(user=target)
    profile.is_active = True
    profile.left_at = None
    profile.save(update_fields=["is_active", "left_at"])
    target.is_active = True
    target.save(update_fields=["is_active"])
    record_audit_log(
        actor=request.user,
        action="admin.user_restore",
        target_type="user",
        target_id=target.id,
        detail={"username": target.username},
        ip_address=_client_ip(request),
    )
    return Response(status=status.HTTP_204_NO_CONTENT)
