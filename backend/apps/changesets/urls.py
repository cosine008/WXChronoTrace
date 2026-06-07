from django.urls import path

from .admin_views import admin_pending_changesets_view
from .views import (
    changeset_approve_view,
    changeset_detail_view,
    changeset_entries_view,
    changeset_entry_detail_view,
    changeset_reject_view,
    changeset_revert_view,
    changeset_submit_view,
    pending_changesets_view,
    schema_changeset_compare_view,
    schema_changeset_detail_view,
    schema_changeset_field_diffs_view,
    schema_changesets_view,
    schema_draft_overlay_view,
)

urlpatterns = [
    path("admin/changesets/pending", admin_pending_changesets_view),
    path("schemas/<int:schema_id>/draft-overlay", schema_draft_overlay_view),
    path("schemas/<int:schema_id>/changesets/", schema_changesets_view),
    path(
        "schemas/<int:schema_id>/changesets/compare/field-diffs",
        schema_changeset_field_diffs_view,
    ),
    path("schemas/<int:schema_id>/changesets/compare", schema_changeset_compare_view),
    path("schemas/<int:schema_id>/changesets/<int:change_set_id>/", schema_changeset_detail_view),
    path("changesets/pending/", pending_changesets_view),
    path("changesets/<int:change_set_id>/", changeset_detail_view),
    path("changesets/<int:change_set_id>/entries/", changeset_entries_view),
    path(
        "changesets/<int:change_set_id>/entries/<int:entry_id>/",
        changeset_entry_detail_view,
    ),
    path("changesets/<int:change_set_id>/submit", changeset_submit_view),
    path("changesets/<int:change_set_id>/approve", changeset_approve_view),
    path("changesets/<int:change_set_id>/reject", changeset_reject_view),
    path("changesets/<int:change_set_id>/revert", changeset_revert_view),
]
