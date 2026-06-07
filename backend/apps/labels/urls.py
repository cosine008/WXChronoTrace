from django.urls import path

from .views import (
    entity_labels_view,
    label_preview_view,
    label_print_view,
    label_replace_view,
    label_revoke_view,
    label_scan_view,
    schema_label_active_samples_view,
    schema_labels_a4_preview_view,
    schema_labels_a4_print_view,
    schema_labels_bulk_create_view,
)

urlpatterns = [
    path("entities/<int:entity_id>/labels/", entity_labels_view),
    path("schemas/<int:schema_id>/labels/active-samples/", schema_label_active_samples_view),
    path("schemas/<int:schema_id>/labels/a4-preview/", schema_labels_a4_preview_view),
    path("schemas/<int:schema_id>/labels/a4-print/", schema_labels_a4_print_view),
    path("schemas/<int:schema_id>/labels/bulk-create/", schema_labels_bulk_create_view),
    path("labels/<int:label_id>/preview/", label_preview_view),
    path("labels/<int:label_id>/print/", label_print_view),
    path("labels/<int:label_id>/revoke/", label_revoke_view),
    path("labels/<int:label_id>/replace/", label_replace_view),
    path("scan/<str:label_code>/", label_scan_view),
]
