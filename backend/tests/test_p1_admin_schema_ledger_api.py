import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def users(db):
    return {
        "admin": User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="pass",
        ),
        "owner": User.objects.create_user(username="owner", password="pass"),
        "other": User.objects.create_user(username="other", password="pass"),
    }


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def make_schema(schema_code, owner, visibility="private", archived=False, approval=False):
    return DataSchema.objects.create(
        schema_code=schema_code,
        name=schema_code.replace("_", " ").title(),
        description="全站表资产测试",
        icon="box",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text"},
            {"key": "status", "label": "状态", "type": "text"},
        ],
        owner=owner,
        visibility=visibility,
        approval_required=approval,
        created_by=owner,
        is_archived=archived,
    )


@pytest.mark.django_db
def test_admin_schema_ledger_requires_superuser(client, users):
    response = auth(client, users["owner"]).get("/api/v1/admin/schemas")

    assert response.status_code == 403


@pytest.mark.django_db
def test_admin_schema_ledger_lists_all_schemas_with_metrics(client, users):
    private_schema = make_schema("private_assets", users["owner"], "private", approval=True)
    public_schema = make_schema("public_assets", users["other"], "public")
    make_schema("archived_assets", users["owner"], "shared", archived=True)
    recent_at = timezone.now() - dt.timedelta(days=1)
    old_at = timezone.now() - dt.timedelta(days=15)
    recent_change = ChangeSet.objects.create(
        schema=private_schema,
        summary="最近变更",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
    )
    pending_change = ChangeSet.objects.create(
        schema=private_schema,
        summary="待审批",
        status=ChangeSet.Status.SUBMITTED,
        approval_required=True,
        created_by=users["other"],
    )
    old_change = ChangeSet.objects.create(
        schema=public_schema,
        summary="旧变更",
        status=ChangeSet.Status.APPLIED,
        created_by=users["other"],
    )
    ChangeSet.objects.filter(id=recent_change.id).update(created_at=recent_at)
    ChangeSet.objects.filter(id=pending_change.id).update(created_at=recent_at)
    ChangeSet.objects.filter(id=old_change.id).update(created_at=old_at)

    response = auth(client, users["admin"]).get("/api/v1/admin/schemas", {"archived": "all"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 3
    assert [item["schema_code"] for item in payload["results"]] == [
        "archived_assets",
        "private_assets",
        "public_assets",
    ]
    row = next(item for item in payload["results"] if item["schema_code"] == "private_assets")
    assert row["owner"] == {"id": users["owner"].id, "username": "owner"}
    assert row["field_count"] == 2
    assert row["pending_changeset_count"] == 1
    assert row["change_count"] == 2
    assert row["last_change_at"] is not None


@pytest.mark.django_db
def test_admin_schema_ledger_filters_owner_visibility_archive_approval_and_change_window(
    client, users
):
    owner_schema = make_schema("owner_private", users["owner"], "private", approval=True)
    other_schema = make_schema("other_public", users["other"], "public")
    make_schema("owner_archived", users["owner"], "shared", archived=True, approval=True)
    ChangeSet.objects.create(
        schema=owner_schema,
        summary="最近变更",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
    )
    old_change = ChangeSet.objects.create(
        schema=other_schema,
        summary="旧变更",
        status=ChangeSet.Status.APPLIED,
        created_by=users["other"],
    )
    ChangeSet.objects.filter(id=old_change.id).update(
        created_at=timezone.now() - dt.timedelta(days=20)
    )

    response = auth(client, users["admin"]).get(
        "/api/v1/admin/schemas",
        {
            "owner": "owner",
            "visibility": "private",
            "archived": "false",
            "approval_required": "true",
            "changed_after": (timezone.now() - dt.timedelta(days=3)).date().isoformat(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["schema_code"] == "owner_private"
