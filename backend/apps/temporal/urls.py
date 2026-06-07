from django.urls import path

from .views import (
    entity_timeline_view,
    field_file_download_view,
    field_file_preview_view,
    field_file_upload_view,
    record_cell_edit_view,
)

urlpatterns = [
    path("entities/<int:entity_id>/timeline/", entity_timeline_view),
    path("schemas/<int:schema_id>/records/<int:entity_id>/cell/", record_cell_edit_view),
    path("schemas/<int:schema_id>/fields/<str:field_key>/files/", field_file_upload_view),
    path("files/<int:asset_id>/download", field_file_download_view),
    path("files/<int:asset_id>/preview", field_file_preview_view),
]
