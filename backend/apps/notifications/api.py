from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification, NotificationPreference
from .selectors import list_notifications_payload, notification_summary
from .serializers import serialize_notification, serialize_preference
from .services import (
    archive_notification,
    mark_all_notifications_read,
    mark_notification_read,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notifications_view(request):
    return Response(list_notifications_payload(request.user, request.query_params))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_summary_view(request):
    return Response(notification_summary(request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_preferences_view(request):
    preferences = {
        preference.type: preference
        for preference in NotificationPreference.objects.filter(user=request.user)
    }
    results = []
    for type_value, _label in Notification.Type.choices:
        preference = preferences.get(type_value)
        if preference is None:
            preference = NotificationPreference(user=request.user, type=type_value)
        results.append(serialize_preference(preference))
    return Response({"results": results})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def notification_preference_detail_view(request, type_value: str):
    if type_value not in _notification_types():
        raise ValidationError({"type": "Unsupported notification type."})

    preference, _ = NotificationPreference.objects.get_or_create(
        user=request.user,
        type=type_value,
    )
    update_fields = []
    for field in ("in_app_enabled", "external_enabled"):
        if field in request.data:
            setattr(preference, field, _boolean_request_field(request.data[field], field))
            update_fields.append(field)
    if update_fields:
        preference.save(update_fields=[*update_fields, "updated_at"])
    return Response(serialize_preference(preference))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_read_view(request, notification_id: int):
    notification = mark_notification_read(actor=request.user, notification_id=notification_id)
    return Response(serialize_notification(notification))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_mark_read_view(request):
    type_value = request.data.get("type") if isinstance(request.data, dict) else None
    updated_count = mark_all_notifications_read(
        actor=request.user,
        type=str(type_value) if type_value else None,
    )
    return Response({"updated_count": updated_count})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_archive_view(request, notification_id: int):
    notification = archive_notification(actor=request.user, notification_id=notification_id)
    return Response(serialize_notification(notification))


def _notification_types() -> set[str]:
    return {value for value, _label in Notification.Type.choices}


def _boolean_request_field(value: object, field: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    raise ValidationError({field: "Must be a boolean."})
