import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.comments.models import Comment, CommentMention, CommentReadState, CommentThread
from apps.schemas.models import DataSchema
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="comment_owner", password="pass")


@pytest.fixture
def reviewer(db):
    return User.objects.create_user(username="comment_reviewer", password="pass")


@pytest.fixture
def schema(owner):
    return DataSchema.objects.create(
        schema_code="comment_schema",
        name="评论测试表",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text"},
            {"key": "amount", "label": "金额", "type": "number"},
        ],
        owner=owner,
        visibility=DataSchema.Visibility.SHARED,
        created_by=owner,
    )


@pytest.fixture
def other_schema(owner):
    return DataSchema.objects.create(
        schema_code="other_comment_schema",
        name="其他评论测试表",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[{"key": "asset_no", "label": "资产编号", "type": "text"}],
        owner=owner,
        created_by=owner,
    )


@pytest.fixture
def entity(schema, owner):
    return Entity.objects.create(schema=schema, business_code="ASSET-001", created_by=owner)


@pytest.fixture
def other_entity(other_schema, owner):
    return Entity.objects.create(
        schema=other_schema,
        business_code="OTHER-001",
        created_by=owner,
    )


@pytest.fixture
def change_set(schema, owner):
    return ChangeSet.objects.create(
        schema=schema,
        summary="评论模型测试批次",
        status=ChangeSet.Status.DRAFT,
        created_by=owner,
    )


@pytest.fixture
def change_entry(change_set, entity):
    return ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action=ChangeEntry.Action.UPDATE,
        data_before={"asset_no": "ASSET-001", "amount": 100},
        data_after={"asset_no": "ASSET-001", "amount": 120},
        valid_from=dt.date(2026, 6, 1),
    )


@pytest.fixture
def temporal_record(entity, change_set, owner):
    return TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": "ASSET-001", "amount": 100},
        valid_from=dt.date(2026, 1, 1),
        valid_to=None,
        change_set=change_set,
        recorded_by=owner,
    )


def make_thread(schema, owner, **overrides):
    values = {
        "schema": schema,
        "anchor_type": CommentThread.AnchorType.ROW,
        "created_by": owner,
    }
    values.update(overrides)
    return CommentThread(**values)


@pytest.mark.django_db
def test_row_thread_requires_entity_and_rejects_field_key(schema, entity, owner):
    with pytest.raises(ValidationError):
        make_thread(schema, owner, anchor_type=CommentThread.AnchorType.ROW).full_clean()

    with pytest.raises(ValidationError):
        make_thread(
            schema,
            owner,
            anchor_type=CommentThread.AnchorType.ROW,
            entity=entity,
            field_key="amount",
        ).full_clean()

    make_thread(
        schema,
        owner,
        anchor_type=CommentThread.AnchorType.ROW,
        entity=entity,
    ).full_clean()


@pytest.mark.django_db
def test_cell_thread_requires_entity_and_field_key(schema, entity, owner):
    with pytest.raises(ValidationError):
        make_thread(
            schema,
            owner,
            anchor_type=CommentThread.AnchorType.CELL,
            entity=entity,
        ).full_clean()

    make_thread(
        schema,
        owner,
        anchor_type=CommentThread.AnchorType.CELL,
        entity=entity,
        field_key="amount",
    ).full_clean()


@pytest.mark.django_db
def test_schema_thread_rejects_row_cell_and_changeset_targets(
    schema,
    entity,
    change_entry,
    owner,
):
    make_thread(
        schema,
        owner,
        anchor_type=CommentThread.AnchorType.SCHEMA,
    ).full_clean()

    with pytest.raises(ValidationError):
        make_thread(
            schema,
            owner,
            anchor_type=CommentThread.AnchorType.SCHEMA,
            entity=entity,
        ).full_clean()

    with pytest.raises(ValidationError):
        make_thread(
            schema,
            owner,
            anchor_type=CommentThread.AnchorType.SCHEMA,
            field_key="amount",
        ).full_clean()

    with pytest.raises(ValidationError):
        make_thread(
            schema,
            owner,
            anchor_type=CommentThread.AnchorType.SCHEMA,
            change_entry=change_entry,
        ).full_clean()


@pytest.mark.django_db
def test_changeset_entry_thread_requires_matching_change_entry(
    schema,
    change_entry,
    owner,
):
    with pytest.raises(ValidationError):
        make_thread(
            schema,
            owner,
            anchor_type=CommentThread.AnchorType.CHANGESET_ENTRY,
        ).full_clean()

    make_thread(
        schema,
        owner,
        anchor_type=CommentThread.AnchorType.CHANGESET_ENTRY,
        change_entry=change_entry,
    ).full_clean()


@pytest.mark.django_db
def test_thread_rejects_entity_from_other_schema(schema, other_entity, owner):
    with pytest.raises(ValidationError):
        make_thread(
            schema,
            owner,
            anchor_type=CommentThread.AnchorType.ROW,
            entity=other_entity,
        ).full_clean()


@pytest.mark.django_db
def test_new_thread_defaults_to_open(schema, entity, owner):
    thread = CommentThread.objects.create(
        schema=schema,
        anchor_type=CommentThread.AnchorType.ROW,
        entity=entity,
        created_by=owner,
    )

    assert thread.status == CommentThread.Status.OPEN
    assert thread.comment_count == 0
    assert thread.last_activity_at is not None


@pytest.mark.django_db
def test_comment_body_rejects_blank_text(schema, entity, owner):
    thread = CommentThread.objects.create(
        schema=schema,
        anchor_type=CommentThread.AnchorType.ROW,
        entity=entity,
        created_by=owner,
    )

    with pytest.raises(ValidationError):
        Comment(thread=thread, body="   \n\t", created_by=owner).full_clean()

    Comment(thread=thread, body="请确认这条记录。", created_by=owner).full_clean()


@pytest.mark.django_db
def test_comment_mention_is_unique_per_comment(schema, entity, owner, reviewer):
    thread = CommentThread.objects.create(
        schema=schema,
        anchor_type=CommentThread.AnchorType.ROW,
        entity=entity,
        created_by=owner,
    )
    comment = Comment.objects.create(thread=thread, body="请确认。", created_by=owner)
    CommentMention.objects.create(comment=comment, user=reviewer)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            CommentMention.objects.create(comment=comment, user=reviewer)


@pytest.mark.django_db
def test_comment_read_state_is_unique_per_thread_and_user(schema, entity, owner):
    thread = CommentThread.objects.create(
        schema=schema,
        anchor_type=CommentThread.AnchorType.ROW,
        entity=entity,
        created_by=owner,
    )
    CommentReadState.objects.create(thread=thread, user=owner)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            CommentReadState.objects.create(thread=thread, user=owner)
