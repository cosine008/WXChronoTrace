from django.urls import path

from .views import audit_logs_view, sensitive_audit_export_view, sensitive_audit_logs_view

urlpatterns = [
    path("audit-logs/", audit_logs_view),
    path("audit-logs/sensitive/export", sensitive_audit_export_view),
    path("audit-logs/sensitive/export/", sensitive_audit_export_view),
    path("audit-logs/sensitive", sensitive_audit_logs_view),
    path("audit-logs/sensitive/", sensitive_audit_logs_view),
]
