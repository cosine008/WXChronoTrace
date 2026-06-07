from django.urls import path

from .views import (
    excel_intake_commit_view,
    excel_intake_preview_view,
    excel_intake_scan_view,
    import_commit_view,
    import_preview_view,
    import_template_view,
)

urlpatterns = [
    path("excel-intake/scan", excel_intake_scan_view),
    path("excel-intake/preview", excel_intake_preview_view),
    path("excel-intake/commit", excel_intake_commit_view),
    path("schemas/<int:schema_id>/import/template", import_template_view),
    path("schemas/<int:schema_id>/import/preview", import_preview_view),
    path("schemas/<int:schema_id>/import/commit", import_commit_view),
]
