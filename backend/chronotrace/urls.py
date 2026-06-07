from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.accounts import views as account_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path(
        "api/v1/",
        include(
            [
                path("auth/", include("apps.accounts.urls")),
                path("users/", account_views.user_list_view, name="users-list"),
                path(
                    "users/<int:user_id>",
                    account_views.admin_user_detail_view,
                    name="users-detail",
                ),
                path(
                    "users/<int:user_id>/reset-password",
                    account_views.admin_reset_password_view,
                    name="users-reset-password",
                ),
                path(
                    "users/<int:user_id>/mark-left",
                    account_views.admin_mark_left_view,
                    name="users-mark-left",
                ),
                path(
                    "users/<int:user_id>/restore",
                    account_views.admin_restore_user_view,
                    name="users-restore",
                ),
                path("", include("apps.audit.urls")),
                path("", include("apps.temporal.urls")),
                path("", include("apps.changesets.urls")),
                path("", include("apps.imports.urls")),
                path("", include("apps.stats.urls")),
                path("", include("apps.labels.urls")),
                path("", include("apps.workbench.urls")),
                path("", include("apps.comments.urls")),
                path("", include("apps.notifications.urls")),
                path("", include("apps.schemas.urls")),
            ]
        ),
    ),
    # OpenAPI
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]
