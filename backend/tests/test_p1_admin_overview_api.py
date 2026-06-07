import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import UserProfile
from apps.audit.services import record_audit_log
from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def users(db):
    admin = User.objects.create_superuser(
        username="admin",
        email="admin@example.com",
        password="pass",
    )
    active = User.objects.create_user(username="active", password="pass")
    left = User.objects.create_user(username="left", password="pass", is_active=False)
    UserProfile.objects.create(user=active, display_name="Active User")
    UserProfile.objects.create(
        user=left,
        display_name="Left User",
        is_active=False,
        left_at=dt.date(2026, 5, 1),
    )
    return {"admin": admin, "active": active, "left": left}


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def make_schema(schema_code, owner, visibility="shared", archived=False, approval=False):
    return DataSchema.objects.create(
        schema_code=schema_code,
        name=schema_code.replace("_", " ").title(),
        description="后台总览测试表",
        icon="box",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[{"key": "asset_no", "label": "资产编号", "type": "text"}],
        owner=owner,
        visibility=visibility,
        approval_required=approval,
        created_by=owner,
        is_archived=archived,
    )


@pytest.mark.django_db
def test_admin_overview_requires_superuser(client, users):
    response = auth(client, users["active"]).get("/api/v1/admin/overview")

    assert response.status_code == 403


@pytest.mark.django_db
def test_admin_overview_returns_operational_metrics(client, users, settings):
    settings.EXPORT_LARGE_ROW_THRESHOLD = 500
    active_schema = make_schema("active_assets", users["active"], approval=True)
    public_schema = make_schema("public_assets", users["admin"], visibility="public")
    make_schema("archived_assets", users["active"], archived=True)
    recent_since = timezone.now() - dt.timedelta(days=1)
    overdue_since = timezone.now() - dt.timedelta(days=4)
    submitted = ChangeSet.objects.create(
        schema=active_schema,
        summary="待审批",
        status=ChangeSet.Status.SUBMITTED,
        approval_required=True,
        created_by=users["active"],
        created_at=recent_since,
    )
    overdue = ChangeSet.objects.create(
        schema=public_schema,
        summary="超时审批",
        status=ChangeSet.Status.SUBMITTED,
        approval_required=True,
        created_by=users["active"],
        created_at=overdue_since,
    )
    ChangeSet.objects.filter(id=submitted.id).update(created_at=recent_since)
    ChangeSet.objects.filter(id=overdue.id).update(created_at=overdue_since)
    record_audit_log(
        actor=users["admin"],
        action="schema.visibility_change",
        target_type="schema",
        target_id=public_schema.id,
        detail={"from_visibility": "private", "to_visibility": "public"},
    )
    record_audit_log(
        actor=users["active"],
        action="data.export",
        target_type="schema",
        target_id=active_schema.id,
        detail={"row_count": 800, "format": "xlsx", "schema_code": active_schema.schema_code},
    )
    record_audit_log(
        actor=users["active"],
        action="data.export",
        target_type="schema",
        target_id=public_schema.id,
        detail={"row_count": 20, "format": "csv", "schema_code": public_schema.schema_code},
    )

    response = auth(client, users["admin"]).get("/api/v1/admin/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["users"] == {"total": 3, "employed": 2, "left": 1, "superusers": 1}
    assert payload["schemas"] == {
        "active": 2,
        "public": 1,
        "archived": 1,
        "approval_required": 1,
    }
    assert payload["approvals"]["pending"] == 2
    assert payload["approvals"]["overdue"] == 1
    assert payload["approvals"]["latest"][0]["summary"] == "待审批"
    assert payload["sensitive_audit"]["last_30_days"] == 2
    assert payload["sensitive_audit"]["latest"][0]["action"] == "data.export"
    assert payload["exports"]["large_last_30_days"] == 1
    assert payload["exports"]["recent_large"][0]["row_count"] == 800
    assert payload["exports"]["recent_large"][0]["actor_username"] == "active"


@pytest.mark.django_db
def test_admin_overview_uses_export_large_row_threshold_setting(client, users, settings):
    settings.EXPORT_LARGE_ROW_THRESHOLD = 1000
    schema = make_schema("threshold_assets", users["active"])
    record_audit_log(
        actor=users["active"],
        action="data.export",
        target_type="schema",
        target_id=schema.id,
        detail={"row_count": 1000, "format": "csv", "schema_code": schema.schema_code},
    )
    record_audit_log(
        actor=users["active"],
        action="data.export",
        target_type="schema",
        target_id=schema.id,
        detail={"row_count_actual": 1001, "format": "xlsx", "schema_code": schema.schema_code},
    )

    response = auth(client, users["admin"]).get("/api/v1/admin/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["exports"]["large_last_30_days"] == 1
    assert [item["row_count"] for item in payload["exports"]["recent_large"]] == [1001]
