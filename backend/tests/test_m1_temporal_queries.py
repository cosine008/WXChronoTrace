import datetime as dt
import time

import pytest
from django.contrib.auth.models import User
from django.utils import timezone

from apps.changesets.models import ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion
from apps.temporal.models import Entity, TemporalRecord
from apps.temporal.queries import (
    count_current_view_by_points,
    get_current_view,
    get_entity_timeline,
    resolve_schema_fields,
)


@pytest.fixture
def user(db):
    return User.objects.create_user(username="query_user", password="pass")


@pytest.fixture
def schema(user):
    return DataSchema.objects.create(
        schema_code="asset_list",
        name="固定资产表",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "introduced_in_version": 1},
            {"key": "status", "label": "状态", "type": "enum", "introduced_in_version": 1},
            {"key": "owner", "label": "负责人", "type": "text", "introduced_in_version": 2},
        ],
        current_version=2,
        owner=user,
        visibility="shared",
        created_by=user,
    )


@pytest.fixture
def applied_changeset(schema, user):
    return ChangeSet.objects.create(
        schema=schema,
        summary="测试批次",
        status="applied",
        created_by=user,
        applied_at=timezone.now(),
    )


@pytest.fixture
def versioned_schema(schema, user):
    v1 = SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "introduced_in_version": 1},
            {"key": "status", "label": "状态", "type": "enum", "introduced_in_version": 1},
        ],
        changelog="初始字段",
        created_by=user,
    )
    v2 = SchemaVersion.objects.create(
        schema=schema,
        version=2,
        fields_config=schema.fields_config,
        changelog="新增负责人",
        created_by=user,
    )
    SchemaVersion.objects.filter(pk=v1.pk).update(
        created_at=dt.datetime(2024, 1, 1, tzinfo=dt.UTC)
    )
    SchemaVersion.objects.filter(pk=v2.pk).update(
        created_at=dt.datetime(2024, 7, 1, tzinfo=dt.UTC)
    )
    return schema


@pytest.fixture
def temporal_fixture(versioned_schema, applied_changeset, user):
    asset_a = Entity.objects.create(
        schema=versioned_schema,
        business_code="A-001",
        created_by=user,
    )
    asset_b = Entity.objects.create(
        schema=versioned_schema,
        business_code="B-001",
        created_by=user,
    )
    TemporalRecord.objects.create(
        entity=asset_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "在用"},
        valid_from=dt.date(2024, 1, 1),
        valid_to=dt.date(2024, 6, 1),
        change_set=applied_changeset,
        recorded_by=user,
    )
    TemporalRecord.objects.create(
        entity=asset_a,
        schema_version=2,
        data_payload={"asset_no": "A-001", "status": "维修", "owner": "张三"},
        valid_from=dt.date(2024, 6, 1),
        change_set=applied_changeset,
        recorded_by=user,
    )
    TemporalRecord.objects.create(
        entity=asset_a,
        schema_version=1,
        data_payload={"asset_no": "A-001", "status": "错误旧值"},
        valid_from=dt.date(2024, 1, 1),
        valid_to=dt.date(2024, 12, 1),
        change_set=applied_changeset,
        recorded_by=user,
        is_superseded=True,
    )
    TemporalRecord.objects.create(
        entity=asset_b,
        schema_version=1,
        data_payload={"asset_no": "B-001", "status": "在用"},
        valid_from=dt.date(2024, 3, 1),
        valid_to=dt.date(2024, 9, 1),
        change_set=applied_changeset,
        recorded_by=user,
    )
    return versioned_schema, asset_a, asset_b


@pytest.mark.django_db
def test_current_view_returns_effective_records_at_timepoint(temporal_fixture):
    schema, _, _ = temporal_fixture

    view = get_current_view(schema, dt.date(2024, 5, 15))

    assert view.at == dt.date(2024, 5, 15)
    assert view.schema_version == 2
    assert [record.business_code for record in view.records] == ["A-001", "B-001"]
    assert [record.data_payload["status"] for record in view.records] == ["在用", "在用"]
    assert all(record.data_payload["status"] != "错误旧值" for record in view.records)


@pytest.mark.django_db
def test_current_view_uses_half_open_valid_range_boundary(temporal_fixture):
    schema, _, _ = temporal_fixture

    view = get_current_view(schema, dt.date(2024, 6, 1))

    assert [record.business_code for record in view.records] == ["A-001", "B-001"]
    assert view.records[0].data_payload["status"] == "维修"


@pytest.mark.django_db
def test_retro_mode_resolves_schema_version_by_timepoint(temporal_fixture):
    schema, _, _ = temporal_fixture

    retro = get_current_view(schema, dt.date(2024, 5, 15), retro=True)
    current = get_current_view(schema, dt.date(2024, 5, 15), retro=False)

    assert retro.schema_version == 1
    assert [field["key"] for field in retro.fields_config] == ["asset_no", "status"]
    assert current.schema_version == 2
    assert [field["key"] for field in current.fields_config] == ["asset_no", "status", "owner"]


@pytest.mark.django_db
def test_entity_timeline_returns_active_records_in_valid_time_order(temporal_fixture):
    _, asset_a, _ = temporal_fixture

    timeline = get_entity_timeline(asset_a)

    assert [record.valid_from for record in timeline] == [
        dt.date(2024, 1, 1),
        dt.date(2024, 6, 1),
    ]
    assert [record.change_summary for record in timeline] == ["测试批次", "测试批次"]


@pytest.mark.django_db
def test_time_series_counts_current_view_for_multiple_points(temporal_fixture):
    schema, _, _ = temporal_fixture

    points = count_current_view_by_points(
        schema,
        [
            dt.date(2023, 1, 1),
            dt.date(2024, 2, 1),
            dt.date(2024, 4, 1),
            dt.date(2024, 10, 1),
        ],
    )

    assert [(point.at, point.count) for point in points] == [
        (dt.date(2023, 1, 1), 0),
        (dt.date(2024, 2, 1), 1),
        (dt.date(2024, 4, 1), 2),
        (dt.date(2024, 10, 1), 1),
    ]


@pytest.mark.django_db
def test_resolve_schema_fields_falls_back_to_earliest_version_before_schema_exists(
    temporal_fixture,
):
    schema, _, _ = temporal_fixture

    fields = resolve_schema_fields(schema, dt.date(2023, 1, 1), retro=True)

    assert fields.version == 1
    assert [field["key"] for field in fields.fields_config] == ["asset_no", "status"]


@pytest.mark.django_db
def test_temporal_queries_handle_1000_entities_x5_ranges_under_100ms(
    schema, applied_changeset, user
):
    entities = [
        Entity(schema=schema, business_code=f"ASSET-{index:04d}", created_by=user)
        for index in range(1000)
    ]
    Entity.objects.bulk_create(entities, batch_size=500)
    entities = list(Entity.objects.filter(schema=schema).order_by("business_code"))
    records = []
    for entity in entities:
        for offset in range(5):
            valid_from = dt.date(2020 + offset, 1, 1)
            valid_to = None if offset == 4 else dt.date(2021 + offset, 1, 1)
            records.append(
                TemporalRecord(
                    entity=entity,
                    schema_version=1,
                    data_payload={"asset_no": entity.business_code, "status": f"S{offset}"},
                    valid_from=valid_from,
                    valid_to=valid_to,
                    change_set=applied_changeset,
                    recorded_by=user,
                )
            )
    TemporalRecord.objects.bulk_create(records, batch_size=1000)

    started_at = time.perf_counter()
    view = get_current_view(schema, dt.date(2022, 6, 1))
    current_view_ms = (time.perf_counter() - started_at) * 1000

    started_at = time.perf_counter()
    points = count_current_view_by_points(
        schema,
        [dt.date(2020, 6, 1), dt.date(2022, 6, 1), dt.date(2024, 6, 1)],
    )
    time_series_ms = (time.perf_counter() - started_at) * 1000

    started_at = time.perf_counter()
    timeline = get_entity_timeline(entities[0])
    timeline_ms = (time.perf_counter() - started_at) * 1000

    assert len(view.records) == 1000
    assert [point.count for point in points] == [1000, 1000, 1000]
    assert len(timeline) == 5
    assert current_view_ms < 100
    assert time_series_ms < 100
    assert timeline_ms < 100
