from django.urls import path
from rest_framework.routers import DefaultRouter

from .admin_views import admin_schema_ledger_view
from .governance_views import (
    reorder_schema_fields_view,
    schema_version_detail_view,
    schema_versions_view,
)
from .views import DataSchemaViewSet, schema_icon_upload_view, schema_icon_view

router = DefaultRouter()
router.trailing_slash = "/?"
router.register("schemas", DataSchemaViewSet, basename="schema")

urlpatterns = [
    path("admin/schemas", admin_schema_ledger_view),
    path("schema-icons/", schema_icon_upload_view),
    path("schema-icons/<str:filename>", schema_icon_view),
    path("schemas/<int:schema_id>/versions/", schema_versions_view),
    path("schemas/<int:schema_id>/versions/<int:version>/", schema_version_detail_view),
    path("schemas/<int:schema_id>/fields/reorder", reorder_schema_fields_view),
] + router.urls
