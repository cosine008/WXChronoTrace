from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.middleware.csrf import get_token
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import OAuthLoginIntent
from apps.accounts.views import MeSerializer

from .errors import OAuthError, OAuthStateInvalid
from .providers import get_code_session_provider, get_web_provider
from .service import bind_external_identity, register_or_login_by_external, unbind_external_identity
from .state import consume_oauth_intent, create_oauth_intent, safe_next_path


class CodeSessionRegisterSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=512)
    profile = serializers.DictField(required=False)


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_start_view(request, provider: str):
    try:
        adapter = get_web_provider(provider)
        next_path = safe_next_path(request.query_params.get("next"))
        intent = create_oauth_intent(
            request=request,
            provider=provider,
            mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
            next_path=next_path,
        )
        redirect_uri = _redirect_uri(provider)
        return Response(
            {
                "provider": provider,
                "authorization_url": adapter.build_authorization_url(intent.state, redirect_uri),
                "state": intent.state,
            }
        )
    except OAuthError as exc:
        return oauth_error_response(exc)


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_callback_view(request, provider: str):
    try:
        code = request.query_params.get("code") or ""
        state = request.query_params.get("state") or ""
        adapter = get_web_provider(provider)
        with transaction.atomic():
            intent = consume_oauth_intent(
                state=state,
                provider=provider,
                mode=OAuthLoginIntent.Mode.REGISTER_LOGIN,
            )
            profile = adapter.fetch_profile_by_code(code, _redirect_uri(provider))
            user, is_new = register_or_login_by_external(profile=profile, request=request)
        csrf_token = get_token(request)
        return Response(
            {
                "status": "registered" if is_new else "logged_in",
                "is_new_user": is_new,
                "next": intent.next_path,
                "user": MeSerializer(user).data,
                "csrf_token": csrf_token,
            }
        )
    except OAuthError as exc:
        return oauth_error_response(exc)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def oauth_bind_start_view(request, provider: str):
    try:
        adapter = get_web_provider(provider)
        next_path = safe_next_path(request.query_params.get("next") or "/")
        intent = create_oauth_intent(
            request=request,
            provider=provider,
            mode=OAuthLoginIntent.Mode.BIND,
            next_path=next_path,
        )
        return Response(
            {
                "provider": provider,
                "authorization_url": adapter.build_authorization_url(
                    intent.state, _bind_redirect_uri(provider)
                ),
                "state": intent.state,
            }
        )
    except OAuthError as exc:
        return oauth_error_response(exc)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def oauth_bind_callback_view(request, provider: str):
    try:
        code = request.query_params.get("code") or ""
        state = request.query_params.get("state") or ""
        adapter = get_web_provider(provider)
        with transaction.atomic():
            intent = consume_oauth_intent(
                state=state,
                provider=provider,
                mode=OAuthLoginIntent.Mode.BIND,
            )
            if intent.requested_by_id != request.user.id:
                raise OAuthStateInvalid()
            profile = adapter.fetch_profile_by_code(code, _bind_redirect_uri(provider))
            identity, created = bind_external_identity(
                user=request.user, profile=profile, request=request
            )
        return Response(
            {
                "status": "bound" if created else "already_bound",
                "next": intent.next_path,
                "identity": serialize_identity(identity),
            }
        )
    except OAuthError as exc:
        return oauth_error_response(exc)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def oauth_identity_list_view(request):
    identities = request.user.external_identities.order_by("provider", "created_at")
    return Response([serialize_identity(identity) for identity in identities])


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def oauth_identity_detail_view(request, identity_id: int):
    try:
        deleted = unbind_external_identity(user=request.user, identity_id=identity_id, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)
    except OAuthError as exc:
        return oauth_error_response(exc)


@api_view(["POST"])
@permission_classes([AllowAny])
def code_session_register_view(request, provider: str):
    serializer = CodeSessionRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        adapter = get_code_session_provider(provider)
        profile = adapter.fetch_profile_by_login_code(
            serializer.validated_data["code"],
            serializer.validated_data.get("profile") or {},
        )
        user, is_new = register_or_login_by_external(profile=profile, request=request)
        csrf_token = get_token(request)
        return Response(
            {
                "status": "registered" if is_new else "logged_in",
                "is_new_user": is_new,
                "user": MeSerializer(user).data,
                "csrf_token": csrf_token,
            }
        )
    except OAuthError as exc:
        return oauth_error_response(exc)


def serialize_identity(identity):
    return {
        "id": identity.id,
        "provider": identity.provider,
        "tenant_id": identity.tenant_id,
        "external_username": identity.external_username,
        "nickname": identity.nickname,
        "avatar_url": identity.avatar_url,
        "last_login_at": identity.last_login_at.isoformat() if identity.last_login_at else None,
        "created_at": identity.created_at.isoformat(),
    }


def oauth_error_response(exc: OAuthError) -> Response:
    return Response(
        {"error": {"code": exc.code, "message": getattr(type(exc), "message", exc.message)}},
        status=exc.status_code,
    )


def _redirect_uri(provider: str) -> str:
    configured = {
        "github": settings.OAUTH_GITHUB_CALLBACK_URL,
        "wechat_web": settings.OAUTH_WECHAT_WEB_CALLBACK_URL,
        "dingtalk": settings.OAUTH_DINGTALK_CALLBACK_URL,
        "qq_web": settings.OAUTH_QQ_WEB_CALLBACK_URL,
    }.get(provider, "")
    return configured


def _bind_redirect_uri(provider: str) -> str:
    return _redirect_uri(provider)
