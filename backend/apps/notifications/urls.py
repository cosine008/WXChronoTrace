from django.urls import path

from . import api

urlpatterns = [
    path("notifications", api.notifications_view, name="notifications-list"),
    path("notifications/summary", api.notification_summary_view, name="notifications-summary"),
    path(
        "notifications/preferences",
        api.notification_preferences_view,
        name="notifications-preferences",
    ),
    path(
        "notifications/preferences/<str:type_value>",
        api.notification_preference_detail_view,
        name="notifications-preference-detail",
    ),
    path(
        "notifications/<int:notification_id>/read",
        api.notification_read_view,
        name="notifications-read",
    ),
    path(
        "notifications/mark-read", api.notification_mark_read_view, name="notifications-mark-read"
    ),
    path(
        "notifications/<int:notification_id>/archive",
        api.notification_archive_view,
        name="notifications-archive",
    ),
]
