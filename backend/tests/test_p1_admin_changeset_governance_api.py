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
        "creator": User.objects.create_user(username="creator", password="pass"),
        "approver": User.objects.create_user(username="approver", password="pass"),
        "other": User.objects.create_user(username="other", password="pass"),
    }


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def make_schema(schema_code, owner, visibility="private"):
    return DataSchema.objects.create(
        schema_code=schema_code,
        name=schema_code.replace("_", " ").title(),
        description="Approval governance test",
        icon="box",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "Asset No", "type": "text"},
        ],
        owner=owner,
        visibility=visibility,
        created_by=owner,
        approval_required=True,
    )


def make_changeset(schema, *, summary, status, creator, approver, age_days):
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary=summary,
        status=status,
        approval_required=True,
        created_by=creator,
        approver=approver,
    )
    ChangeSet.objects.filter(id=change_set.id).update(
        created_at=timezone.now() - dt.timedelta(days=age_days)
    )
    change_set.refresh_from_db()
    return change_set


@pytest.mark.django_db
def test_admin_pending_changesets_requires_superuser(client, users):
    response = auth(client, users["owner"]).get("/api/v1/admin/changesets/pending")

    assert response.status_code == 403


@pytest.mark.django_db
def test_admin_pending_changesets_lists_all_submitted_batches_oldest_first(client, users):
    private_schema = make_schema("private_assets", users["owner"], "private")
    public_schema = make_schema("public_assets", users["other"], "public")
    recent = make_changeset(
        private_schema,
        summary="Recent approval",
        status=ChangeSet.Status.SUBMITTED,
        creator=users["creator"],
        approver=users["approver"],
        age_days=1,
    )
    old = make_changeset(
        public_schema,
        summary="Old approval",
        status=ChangeSet.Status.SUBMITTED,
        creator=users["other"],
        approver=users["owner"],
        age_days=6,
    )
    make_changeset(
        public_schema,
        summary="Applied batch",
        status=ChangeSet.Status.APPLIED,
        creator=users["other"],
        approver=users["owner"],
        age_days=10,
    )

    response = auth(client, users["admin"]).get("/api/v1/admin/changesets/pending")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert [item["id"] for item in payload["results"]] == [old.id, recent.id]
    first = payload["results"][0]
    assert first["schema_id"] == public_schema.id
    assert first["schema_code"] == "public_assets"
    assert first["schema_name"] == "Public Assets"
    assert first["created_by_username"] == "other"
    assert first["approver_username"] == "owner"
    assert first["age_days"] >= 6
    assert first["overdue"] is True


@pytest.mark.django_db
def test_admin_pending_changesets_filters_schema_creator_approver_and_age(client, users):
    ops_schema = make_schema("ops_assets", users["owner"], "private")
    hr_schema = make_schema("hr_assets", users["other"], "private")
    target = make_changeset(
        ops_schema,
        summary="Ops stale approval",
        status=ChangeSet.Status.SUBMITTED,
        creator=users["creator"],
        approver=users["approver"],
        age_days=5,
    )
    make_changeset(
        ops_schema,
        summary="Ops fresh approval",
        status=ChangeSet.Status.SUBMITTED,
        creator=users["creator"],
        approver=users["approver"],
        age_days=1,
    )
    make_changeset(
        hr_schema,
        summary="HR stale approval",
        status=ChangeSet.Status.SUBMITTED,
        creator=users["other"],
        approver=users["approver"],
        age_days=7,
    )

    response = auth(client, users["admin"]).get(
        "/api/v1/admin/changesets/pending",
        {
            "schema": "ops",
            "creator": "creator",
            "approver": "approver",
            "min_age_days": "3",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == target.id
