from django.urls import path

from .admin_export_views import (
    admin_export_event_detail_view,
    admin_export_event_list_view,
    admin_export_job_detail_view,
    admin_export_job_list_view,
)
from .export_job_views import (
    current_export_job_create_view,
    export_job_detail_view,
    export_job_download_view,
    export_job_list_view,
)
from .views import (
    admin_overview_view,
    changeset_export_view,
    current_export_view,
    dashboard_view,
    entity_export_view,
    stats_distribution_view,
    stats_flow_view,
    stats_summary_view,
    stats_trend_view,
)

urlpatterns = [
    path("admin/overview", admin_overview_view),
    path("admin/export-jobs", admin_export_job_list_view),
    path("admin/export-jobs/<str:job_code>", admin_export_job_detail_view),
    path("admin/export-events", admin_export_event_list_view),
    path("admin/export-events/<int:audit_log_id>", admin_export_event_detail_view),
    path("dashboard/", dashboard_view),
    path("schemas/<int:schema_id>/stats/summary", stats_summary_view),
    path("schemas/<int:schema_id>/stats/trend", stats_trend_view),
    path("schemas/<int:schema_id>/stats/distribution", stats_distribution_view),
    path("schemas/<int:schema_id>/stats/flow", stats_flow_view),
    path("schemas/<int:schema_id>/export/current/jobs", current_export_job_create_view),
    path("schemas/<int:schema_id>/export", current_export_view),
    path("schemas/<int:schema_id>/export/current", current_export_view),
    path("export/jobs", export_job_list_view),
    path("export/jobs/<str:job_code>", export_job_detail_view),
    path("export/jobs/<str:job_code>/download", export_job_download_view),
    path("changesets/<int:change_set_id>/export", changeset_export_view),
    path("entities/<int:entity_id>/export", entity_export_view),
]
