from django.urls import path

from . import views
from .oauth import views as oauth_views

urlpatterns = [
    path("csrf", views.csrf_view, name="auth-csrf"),
    path("login", views.login_view, name="auth-login"),
    path("logout", views.logout_view, name="auth-logout"),
    path("me", views.me_view, name="auth-me"),
    path("oauth/<str:provider>/start", oauth_views.oauth_start_view, name="oauth-start"),
    path("oauth/<str:provider>/callback", oauth_views.oauth_callback_view, name="oauth-callback"),
    path("oauth/<str:provider>/bind/start", oauth_views.oauth_bind_start_view, name="oauth-bind-start"),
    path(
        "oauth/<str:provider>/bind/callback",
        oauth_views.oauth_bind_callback_view,
        name="oauth-bind-callback",
    ),
    path("oauth/identities", oauth_views.oauth_identity_list_view, name="oauth-identities"),
    path(
        "oauth/identities/<int:identity_id>",
        oauth_views.oauth_identity_detail_view,
        name="oauth-identity-detail",
    ),
    path(
        "oauth/<str:provider>/register",
        oauth_views.code_session_register_view,
        name="oauth-code-session-register",
    ),
]
