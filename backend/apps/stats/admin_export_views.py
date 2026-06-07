from __future__ import annotations

from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.response import Response
from rest_framework.utils.mediatypes import _MediaType, media_type_matches, order_by_precedence

from .admin_export_api import (
    get_admin_export_event_payload,
    get_admin_export_job_payload,
    list_admin_export_events_payload,
    list_admin_export_jobs_payload,
)


class IgnoreQueryFormatOverrideContentNegotiation(DefaultContentNegotiation):
    def select_renderer(self, request, renderers, format_suffix=None):
        if format_suffix:
            renderers = self.filter_renderers(renderers, format_suffix)
        accepts = self.get_accept_list(request)
        for media_type_set in order_by_precedence(accepts):
            for renderer in renderers:
                for media_type in media_type_set:
                    if media_type_matches(renderer.media_type, media_type):
                        media_type_wrapper = _MediaType(media_type)
                        if _MediaType(renderer.media_type).precedence > media_type_wrapper.precedence:
                            full_media_type = ";".join(
                                (renderer.media_type,)
                                + tuple(
                                    f"{key}={value}" for key, value in media_type_wrapper.params.items()
                                )
                            )
                            return renderer, full_media_type
                        return renderer, media_type
        return super().select_renderer(request, renderers, format_suffix)


@api_view(["GET"])
def admin_export_job_list_view(request):
    _ensure_superuser(request.user)
    return Response(list_admin_export_jobs_payload(request.query_params))


@api_view(["GET"])
def admin_export_job_detail_view(request, job_code: str):
    _ensure_superuser(request.user)
    return Response(get_admin_export_job_payload(job_code))


@api_view(["GET"])
def admin_export_event_list_view(request):
    _ensure_superuser(request.user)
    return Response(list_admin_export_events_payload(request.query_params))


@api_view(["GET"])
def admin_export_event_detail_view(request, audit_log_id: int):
    _ensure_superuser(request.user)
    return Response(get_admin_export_event_payload(audit_log_id))


def _ensure_superuser(user) -> None:
    if not user.is_superuser:
        raise PermissionDenied("only system administrators can view the export center")


admin_export_job_list_view.cls.content_negotiation_class = IgnoreQueryFormatOverrideContentNegotiation
admin_export_job_detail_view.cls.content_negotiation_class = IgnoreQueryFormatOverrideContentNegotiation
admin_export_event_list_view.cls.content_negotiation_class = IgnoreQueryFormatOverrideContentNegotiation
admin_export_event_detail_view.cls.content_negotiation_class = IgnoreQueryFormatOverrideContentNegotiation
