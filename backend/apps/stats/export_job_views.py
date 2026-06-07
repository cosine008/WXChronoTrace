from __future__ import annotations

from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from apps.schemas.models import DataSchema
from apps.schemas.permissions import can_export_schema, can_view_schema

from .export_jobs import (
    ExportJobConflictError,
    create_current_export_job,
    get_owned_export_job,
    list_export_jobs_payload,
    record_export_download,
    record_export_download_denied,
    serialize_export_job,
)
from .models import ExportJob


@api_view(["POST"])
def current_export_job_create_view(request, schema_id: int):
    schema = _exportable_schema(request.user, schema_id)
    try:
        result = create_current_export_job(
            schema=schema,
            user=request.user,
            data=request.data,
            ip_address=request.META.get("REMOTE_ADDR"),
        )
    except ExportJobConflictError as exc:
        return Response(exc.payload, status=status.HTTP_409_CONFLICT)
    response_status = status.HTTP_201_CREATED if result.created else status.HTTP_200_OK
    return Response(serialize_export_job(result.job), status=response_status)


@api_view(["GET"])
def export_job_list_view(request):
    return Response(list_export_jobs_payload(request.user, request.query_params))


@api_view(["GET"])
def export_job_detail_view(request, job_code: str):
    job = _owned_export_job(request.user, job_code)
    return Response(serialize_export_job(job))


@api_view(["GET"])
def export_job_download_view(request, job_code: str):
    job = _owned_export_job(request.user, job_code)
    if not can_view_schema(request.user, job.schema) or not can_export_schema(request.user, job.schema):
        record_export_download_denied(
            job,
            reason="permission_denied",
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        raise PermissionDenied("you do not have export permission")
    if job.status != ExportJob.Status.COMPLETED:
        return Response({"detail": "export job is not completed"}, status=status.HTTP_409_CONFLICT)
    if job.expires_at and job.expires_at <= timezone.now():
        return Response({"detail": "export job has expired"}, status=status.HTTP_410_GONE)
    if not job.file or not job.file.storage.exists(job.file.name):
        return Response({"detail": "export file does not exist"}, status=status.HTTP_404_NOT_FOUND)

    record_export_download(job, ip_address=request.META.get("REMOTE_ADDR"))
    return FileResponse(
        job.file.open("rb"),
        as_attachment=True,
        filename=job.filename,
        content_type=job.content_type,
    )


def _visible_schema(user, schema_id: int) -> DataSchema:
    schema = DataSchema.objects.for_user(user).filter(pk=schema_id).first()
    if schema is None or not can_view_schema(user, schema):
        raise NotFound("schema does not exist")
    return schema


def _exportable_schema(user, schema_id: int) -> DataSchema:
    schema = _visible_schema(user, schema_id)
    if not can_export_schema(user, schema):
        raise PermissionDenied("you do not have export permission")
    return schema


def _owned_export_job(user, job_code: str) -> ExportJob:
    job = get_owned_export_job(user, job_code)
    if job is None:
        raise NotFound("export job does not exist")
    return job
