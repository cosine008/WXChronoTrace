from __future__ import annotations

import hashlib
import json
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.schemas.models import DataSchema

from .export_specs import (
    EXPORT_SCOPE_CURRENT_VIEW,
    normalize_current_export_params,
    normalize_export_spec,
)
from .models import ExportJob

RISK_FLAG_LARGE_EXPORT = "large_export"
RISK_FLAG_SENSITIVE_FIELDS = "sensitive_fields"


def build_current_export_query_snapshot(
    schema: DataSchema,
    user,
    query_params,
    *,
    requested_at=None,
) -> dict[str, Any]:
    spec = normalize_export_spec(schema, user, query_params)
    requested_at = requested_at or timezone.now()
    return {
        "schema_id": schema.id,
        "user_id": getattr(user, "id", None),
        "at": spec["time"]["at"],
        "retro": spec["time"]["retro"],
        "search": spec["search"],
        "ordering": spec["ordering"],
        "change_set": spec["change_set"],
        "schema_version": spec["schema_version"],
        "format": spec["format"],
        "export_spec": spec,
        "requested_at": requested_at.isoformat(),
    }


def build_current_export_snapshot_key(query_snapshot: dict[str, Any]) -> str:
    digest_source = _current_export_digest_source(query_snapshot)
    return hashlib.sha256(
        json.dumps(digest_source, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def current_export_snapshot_key(schema: DataSchema, user, query_params) -> str:
    snapshot = build_current_export_query_snapshot(schema, user, query_params)
    return build_current_export_snapshot_key(snapshot)


def find_reusable_export_job(
    owner,
    schema: DataSchema,
    export_format: str,
    snapshot_key: str,
    *,
    now=None,
) -> ExportJob | None:
    now = now or timezone.now()
    reusable_status = (
        Q(status__in=[ExportJob.Status.QUEUED, ExportJob.Status.RUNNING])
        | Q(status=ExportJob.Status.COMPLETED, expires_at__gt=now)
        | Q(status=ExportJob.Status.COMPLETED, expires_at__isnull=True)
    )
    candidates = (
        ExportJob.objects.filter(
            owner=owner,
            schema=schema,
            export_scope=EXPORT_SCOPE_CURRENT_VIEW,
            export_format=export_format,
            snapshot_key=snapshot_key,
        )
        .filter(reusable_status)
        .order_by("-created_at")
    )
    for job in candidates:
        if job.status != ExportJob.Status.COMPLETED or _completed_job_file_exists(job):
            return job
    return None


def _current_export_digest_source(query_snapshot: dict[str, Any]) -> dict[str, Any]:
    if isinstance(query_snapshot.get("export_spec"), dict):
        return {
            "user_id": query_snapshot["user_id"],
            "export_scope": EXPORT_SCOPE_CURRENT_VIEW,
            "export_spec": query_snapshot["export_spec"],
        }
    return {
        "user_id": query_snapshot["user_id"],
        "schema_id": query_snapshot["schema_id"],
        "export_scope": EXPORT_SCOPE_CURRENT_VIEW,
        "export_format": query_snapshot["format"],
        "at": query_snapshot["at"],
        "retro": query_snapshot["retro"],
        "search": query_snapshot["search"],
        "ordering": query_snapshot["ordering"],
        "change_set": query_snapshot["change_set"],
        "schema_version": query_snapshot["schema_version"],
    }


def _completed_job_file_exists(job: ExportJob) -> bool:
    return bool(job.file and job.file.name and job.file.storage.exists(job.file.name))
