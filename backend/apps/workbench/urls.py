from django.urls import path

from . import admin_views, views

urlpatterns = [
    path("schemas/<int:schema_id>/workbench/", views.schema_workbench_view, name="schema-workbench"),
    path(
        "schemas/<int:schema_id>/workbench/quick-note/",
        views.schema_workbench_quick_note_view,
        name="schema-workbench-quick-note",
    ),
    path(
        "schemas/<int:schema_id>/workbench/material-checklist/",
        views.schema_workbench_material_checklist_view,
        name="schema-workbench-material-checklist",
    ),
    path(
        "schemas/<int:schema_id>/workbench/material-checklist/<int:checklist_item_id>/",
        views.schema_workbench_material_checklist_detail_view,
        name="schema-workbench-material-checklist-detail",
    ),
    path("workbench/data-cards/", views.workbench_data_cards_view, name="workbench-data-cards"),
    path("workbench/data-cards/<int:item_id>/", views.workbench_data_card_detail_view, name="workbench-data-card-detail"),
    path(
        "workbench/data-cards/<int:item_id>/copy-text/",
        views.workbench_data_card_copy_text_view,
        name="workbench-data-card-copy-text",
    ),
    path("workbench/notes/", views.workbench_notes_view, name="workbench-notes"),
    path("workbench/notes/<int:item_id>/", views.workbench_note_detail_view, name="workbench-note-detail"),
    path(
        "workbench/notes/quick-capture/",
        views.workbench_notes_quick_capture_view,
        name="workbench-notes-quick-capture",
    ),
    path("workbench/materials/", views.workbench_materials_view, name="workbench-materials"),
    path("workbench/materials/<int:item_id>/", views.workbench_material_detail_view, name="workbench-material-detail"),
    path(
        "workbench/materials/<int:item_id>/download/",
        views.workbench_material_download_view,
        name="workbench-material-download",
    ),
    path("workbench/items/", views.workbench_items_view, name="workbench-items"),
    path("workbench/overview/", views.workbench_overview_view, name="workbench-overview"),
    path("workbench/items/<int:item_id>/", views.workbench_item_detail_view, name="workbench-item-detail"),
    path("workbench/search/", views.workbench_search_view, name="workbench-search"),
    path("workbench/trash/", views.workbench_trash_view, name="workbench-trash"),
    path("workbench/trash/<int:item_id>/restore/", views.workbench_trash_restore_view, name="workbench-trash-restore"),
    path("workbench/trash/<int:item_id>/purge/", views.workbench_trash_purge_view, name="workbench-trash-purge"),
    path("workbench/links/", views.workbench_links_view, name="workbench-links"),
    path("workbench/links/<int:link_id>/", views.workbench_link_detail_view, name="workbench-link-detail"),
    path("admin/workbench/users/", admin_views.admin_workbench_users_view, name="admin-workbench-users"),
]
