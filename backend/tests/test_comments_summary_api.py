import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone

from apps.comments.models import CommentReadState, CommentThread
from apps.comments.selectors import summary_for_entities
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="comment_summary_owner", password="pass"),
        "viewer": User.objects.create_user(username="comment_summary_viewer", password="pass"),
        "outsider": User.objects.create_user(username="comment_summary_outsider", password="pass"),
    }


@pytest.fixture
def summary_schema(users):
    schema = DataSchema.objects.create(
        schema_code="comment_summary_assets",
        name="评论汇总测试表",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text"},
            {"key": "amount", "label": "金额", "type": "number"},
            {
                "key": "salary",
                "label": "薪资",
                "type": "number",
                "sensitive": True,
                "masking": {"mode": "full", "visible_roles": ["owner"]},
            },
            {"key": "internal_flag", "label": "内部标记", "type": "text", "system": True},
        ],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["owner"],
    )
    return schema


@pytest.fixture
def entity(summary_schema, users):
    return Entity.objects.create(
        schema=summary_schema,
        business_code="ASSET-001",
        created_by=users["owner"],
    )


def create_thread(schema, entity, creator, **overrides):
    values = {
        "schema": schema,
        "anchor_type": CommentThread.AnchorType.ROW,
        "entity": entity,
        "created_by": creator,
        "last_activity_at": timezone.now(),
    }
    values.update(overrides)
    return CommentThread.objects.create(**values)


@pytest.mark.django_db
def test_summary_for_entities_counts_visible_row_cell_and_unread_threads(
    users,
    summary_schema,
    entity,
):
    base_time = timezone.now()
    row_thread = create_thread(
        summary_schema,
        entity,
        users["owner"],
        last_activity_at=base_time + dt.timedelta(minutes=1),
    )
    amount_open = create_thread(
        summary_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="amount",
        last_activity_at=base_time + dt.timedelta(minutes=2),
    )
    amount_resolved = create_thread(
        summary_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="amount",
        status=CommentThread.Status.RESOLVED,
        last_activity_at=base_time + dt.timedelta(minutes=3),
    )
    create_thread(
        summary_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="salary",
        last_activity_at=base_time + dt.timedelta(minutes=4),
    )
    create_thread(
        summary_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="internal_flag",
        last_activity_at=base_time + dt.timedelta(minutes=5),
    )

    CommentReadState.objects.create(
        thread=row_thread,
        user=users["viewer"],
        last_read_at=row_thread.last_activity_at - dt.timedelta(seconds=1),
    )
    CommentReadState.objects.create(
        thread=amount_resolved,
        user=users["viewer"],
        last_read_at=amount_resolved.last_activity_at + dt.timedelta(seconds=1),
    )

    summary = summary_for_entities(users["viewer"], summary_schema, [entity.id])

    assert summary == {
        entity.id: {
            "row": {"open_count": 1, "total_count": 1, "unread_count": 1},
            "cells": {
                "amount": {"open_count": 1, "total_count": 2, "unread_count": 1},
            },
        },
    }
    assert amount_open.id is not None


@pytest.mark.django_db
def test_summary_for_entities_hides_masked_cells_from_viewer_but_not_owner(
    users,
    summary_schema,
    entity,
):
    create_thread(
        summary_schema,
        entity,
        users["owner"],
        anchor_type=CommentThread.AnchorType.CELL,
        field_key="salary",
    )

    viewer_summary = summary_for_entities(users["viewer"], summary_schema, [entity.id])
    owner_summary = summary_for_entities(users["owner"], summary_schema, [entity.id])

    assert viewer_summary == {}
    assert owner_summary[entity.id]["cells"]["salary"] == {
        "open_count": 1,
        "total_count": 1,
        "unread_count": 1,
    }


@pytest.mark.django_db
def test_summary_for_entities_returns_empty_for_user_without_schema_access(
    users,
    summary_schema,
    entity,
):
    create_thread(summary_schema, entity, users["owner"])

    summary = summary_for_entities(users["outsider"], summary_schema, [entity.id])

    assert summary == {}
