import datetime as dt
import json
from dataclasses import dataclass
from typing import Any

from django.db import connection

from apps.schemas.models import DataSchema, SchemaVersion

from .models import Entity, TemporalRecord


@dataclass(frozen=True)
class SchemaFields:
    version: int
    fields_config: list[dict[str, Any]]


@dataclass(frozen=True)
class CurrentViewRecord:
    record_id: int
    entity_id: int
    business_code: str
    data_payload: dict[str, Any]
    valid_from: dt.date
    valid_to: dt.date | None
    schema_version: int
    change_set_id: int
    recorded_by_id: int
    recorded_at: dt.datetime


@dataclass(frozen=True)
class CurrentView:
    schema_id: int
    at: dt.date
    schema_version: int
    fields_config: list[dict[str, Any]]
    records: list[CurrentViewRecord]


@dataclass(frozen=True)
class CurrentViewPage:
    schema_id: int
    at: dt.date
    schema_version: int
    fields_config: list[dict[str, Any]]
    records: list[CurrentViewRecord]
    count: int


@dataclass(frozen=True)
class CurrentRecordLocation:
    entity_id: int
    record_id: int | None
    position: int | None
    count: int


@dataclass(frozen=True)
class TimelineRecord:
    record_id: int
    schema_version: int
    data_payload: dict[str, Any]
    valid_from: dt.date
    valid_to: dt.date | None
    change_set_id: int
    change_summary: str
    recorded_by_id: int
    recorded_at: dt.datetime


@dataclass(frozen=True)
class TimeSeriesPoint:
    at: dt.date
    count: int


CURRENT_VIEW_PUSH_DOWN_ORDER_COLUMNS = {
    "business_code": "business_code",
    "valid_from": "valid_from",
    "valid_to": "valid_to",
    "schema_version": "schema_version",
    "recorded_at": "recorded_at",
}


def resolve_schema_fields(schema: DataSchema, at: dt.date, *, retro: bool = False) -> SchemaFields:
    if not retro:
        return SchemaFields(version=schema.current_version, fields_config=schema.fields_config)

    version = (
        SchemaVersion.objects.filter(schema=schema, created_at__date__lte=at)
        .order_by("-created_at", "-version")
        .first()
    )
    if version is None:
        version = SchemaVersion.objects.filter(schema=schema).order_by("created_at", "version").first()
    if version is None:
        return SchemaFields(version=schema.current_version, fields_config=schema.fields_config)
    return SchemaFields(version=version.version, fields_config=version.fields_config)


def get_current_view(schema: DataSchema, at: dt.date, *, retro: bool = False) -> CurrentView:
    schema_fields = resolve_schema_fields(schema, at, retro=retro)
    records = _fetch_current_records(schema, at)
    return CurrentView(
        schema_id=schema.id,
        at=at,
        schema_version=schema_fields.version,
        fields_config=schema_fields.fields_config,
        records=records,
    )


def get_current_view_page(
    schema: DataSchema,
    at: dt.date,
    *,
    retro: bool = False,
    ordering: str = "business_code",
    limit: int,
    offset: int,
) -> CurrentViewPage:
    schema_fields = resolve_schema_fields(schema, at, retro=retro)
    records, count = _fetch_current_record_page(schema, at, ordering, limit, offset)
    return CurrentViewPage(
        schema_id=schema.id,
        at=at,
        schema_version=schema_fields.version,
        fields_config=schema_fields.fields_config,
        records=records,
        count=count,
    )


def get_current_record_location(
    schema: DataSchema,
    at: dt.date,
    *,
    ordering: str,
    entity_id: int,
) -> CurrentRecordLocation:
    row, count = _fetch_current_record_location(schema, at, ordering, entity_id)
    if row is None:
        return CurrentRecordLocation(
            entity_id=entity_id,
            record_id=None,
            position=None,
            count=count,
        )
    return CurrentRecordLocation(
        entity_id=row[1],
        record_id=row[0],
        position=row[2],
        count=count,
    )


def current_view_ordering_can_push_down(ordering: str) -> bool:
    return _ordering_field(ordering) in CURRENT_VIEW_PUSH_DOWN_ORDER_COLUMNS


def get_entity_timeline(entity: Entity) -> list[TimelineRecord]:
    records = (
        TemporalRecord.objects.select_related("change_set")
        .filter(entity=entity, is_superseded=False)
        .order_by("valid_from", "id")
    )
    return [
        TimelineRecord(
            record_id=record.id,
            schema_version=record.schema_version,
            data_payload=record.data_payload,
            valid_from=record.valid_from,
            valid_to=record.valid_to,
            change_set_id=record.change_set_id,
            change_summary=record.change_set.summary,
            recorded_by_id=record.recorded_by_id,
            recorded_at=record.recorded_at,
        )
        for record in records
    ]


def count_current_view_by_points(
    schema: DataSchema, points: list[dt.date] | tuple[dt.date, ...]
) -> list[TimeSeriesPoint]:
    if not points:
        return []

    temporal_table = connection.ops.quote_name(TemporalRecord._meta.db_table)
    entity_table = connection.ops.quote_name(Entity._meta.db_table)
    values_clause = ", ".join(["(%s::date)"] * len(points))
    sql = f"""
        WITH points(at) AS (VALUES {values_clause})
        SELECT p.at, COUNT(DISTINCT tr.entity_id) AS active_count
        FROM points p
        LEFT JOIN {entity_table} e
          ON e.schema_id = %s
        LEFT JOIN {temporal_table} tr
          ON tr.entity_id = e.id
         AND tr.valid_from <= p.at
         AND (tr.valid_to IS NULL OR tr.valid_to > p.at)
         AND tr.is_superseded = FALSE
        GROUP BY p.at
        ORDER BY p.at ASC
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [*points, schema.id])
        rows = cursor.fetchall()
    return [TimeSeriesPoint(at=row[0], count=row[1]) for row in rows]


def count_current_view_records(schema: DataSchema, at: dt.date) -> int:
    temporal_table = connection.ops.quote_name(TemporalRecord._meta.db_table)
    entity_table = connection.ops.quote_name(Entity._meta.db_table)
    current_rows = _current_rows_sql(temporal_table, entity_table)
    sql = f"WITH current_rows AS ({current_rows}) SELECT COUNT(*) FROM current_rows"
    with connection.cursor() as cursor:
        cursor.execute(sql, [schema.id, at, at])
        return cursor.fetchone()[0]


def aggregate_current_view_field_values(
    schema: DataSchema,
    at: dt.date,
    *,
    field_key: str,
    field_type: str,
) -> list[tuple[str, int]]:
    if field_type == "multi-enum":
        return _aggregate_current_view_multi_values(schema, at, field_key)
    return _aggregate_current_view_scalar_values(schema, at, field_key)


def _fetch_current_records(schema: DataSchema, at: dt.date) -> list[CurrentViewRecord]:
    temporal_table = connection.ops.quote_name(TemporalRecord._meta.db_table)
    entity_table = connection.ops.quote_name(Entity._meta.db_table)
    sql = f"""
        SELECT *
        FROM (
            SELECT DISTINCT ON (tr.entity_id)
                tr.id AS record_id,
                tr.entity_id,
                e.business_code,
                tr.data_payload,
                tr.valid_from,
                tr.valid_to,
                tr.schema_version,
                tr.change_set_id,
                tr.recorded_by_id,
                tr.recorded_at
            FROM {temporal_table} tr
            INNER JOIN {entity_table} e ON e.id = tr.entity_id
            WHERE e.schema_id = %s
              AND tr.is_superseded = FALSE
              AND tr.valid_from <= %s
              AND (tr.valid_to IS NULL OR tr.valid_to > %s)
            ORDER BY tr.entity_id ASC, tr.valid_from DESC, tr.id DESC
        ) current_rows
        ORDER BY business_code ASC
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [schema.id, at, at])
        rows = cursor.fetchall()
    return [_current_record_from_row(row) for row in rows]


def _fetch_current_record_page(
    schema: DataSchema,
    at: dt.date,
    ordering: str,
    limit: int,
    offset: int,
) -> tuple[list[CurrentViewRecord], int]:
    temporal_table = connection.ops.quote_name(TemporalRecord._meta.db_table)
    entity_table = connection.ops.quote_name(Entity._meta.db_table)
    current_rows = _current_rows_sql(temporal_table, entity_table)
    count_sql = f"WITH current_rows AS ({current_rows}) SELECT COUNT(*) FROM current_rows"
    page_sql = f"""
        WITH current_rows AS ({current_rows})
        SELECT *
        FROM current_rows
        ORDER BY {_current_view_order_clause(ordering)}
        LIMIT %s OFFSET %s
    """
    with connection.cursor() as cursor:
        cursor.execute(count_sql, [schema.id, at, at])
        count = cursor.fetchone()[0]
        cursor.execute(page_sql, [schema.id, at, at, limit, offset])
        rows = cursor.fetchall()
    return [_current_record_from_row(row) for row in rows], count


def _fetch_current_record_location(
    schema: DataSchema,
    at: dt.date,
    ordering: str,
    entity_id: int,
) -> tuple[tuple | None, int]:
    temporal_table = connection.ops.quote_name(TemporalRecord._meta.db_table)
    entity_table = connection.ops.quote_name(Entity._meta.db_table)
    current_rows = _current_rows_sql(temporal_table, entity_table)
    count_sql = f"WITH current_rows AS ({current_rows}) SELECT COUNT(*) FROM current_rows"
    location_sql = f"""
        WITH current_rows AS ({current_rows}),
        ranked_rows AS (
            SELECT
                record_id,
                entity_id,
                ROW_NUMBER() OVER (ORDER BY {_current_view_order_clause(ordering)}) AS position
            FROM current_rows
        )
        SELECT record_id, entity_id, position
        FROM ranked_rows
        WHERE entity_id = %s
    """
    with connection.cursor() as cursor:
        cursor.execute(count_sql, [schema.id, at, at])
        count = cursor.fetchone()[0]
        cursor.execute(location_sql, [schema.id, at, at, entity_id])
        row = cursor.fetchone()
    return row, count


def _aggregate_current_view_scalar_values(
    schema: DataSchema, at: dt.date, field_key: str
) -> list[tuple[str, int]]:
    temporal_table = connection.ops.quote_name(TemporalRecord._meta.db_table)
    entity_table = connection.ops.quote_name(Entity._meta.db_table)
    current_rows = _current_rows_sql(temporal_table, entity_table)
    sql = f"""
        WITH current_rows AS ({current_rows}),
        field_values AS (
            SELECT data_payload ->> %s AS value
            FROM current_rows
        )
        SELECT value, COUNT(*) AS count
        FROM field_values
        WHERE value IS NOT NULL AND value <> ''
        GROUP BY value
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [schema.id, at, at, field_key])
        return cursor.fetchall()


def _aggregate_current_view_multi_values(
    schema: DataSchema, at: dt.date, field_key: str
) -> list[tuple[str, int]]:
    temporal_table = connection.ops.quote_name(TemporalRecord._meta.db_table)
    entity_table = connection.ops.quote_name(Entity._meta.db_table)
    current_rows = _current_rows_sql(temporal_table, entity_table)
    sql = f"""
        WITH current_rows AS ({current_rows}),
        field_values AS (
            SELECT jsonb_array_elements_text(data_payload -> %s) AS value
            FROM current_rows
            WHERE jsonb_typeof(data_payload -> %s) = 'array'
            UNION ALL
            SELECT data_payload ->> %s AS value
            FROM current_rows
            WHERE data_payload ? %s
              AND jsonb_typeof(data_payload -> %s) <> 'array'
        )
        SELECT value, COUNT(*) AS count
        FROM field_values
        WHERE value IS NOT NULL AND value <> ''
        GROUP BY value
    """
    params = [schema.id, at, at, field_key, field_key, field_key, field_key, field_key]
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def _current_rows_sql(temporal_table: str, entity_table: str) -> str:
    return f"""
        SELECT DISTINCT ON (tr.entity_id)
            tr.id AS record_id,
            tr.entity_id,
            e.business_code,
            tr.data_payload,
            tr.valid_from,
            tr.valid_to,
            tr.schema_version,
            tr.change_set_id,
            tr.recorded_by_id,
            tr.recorded_at
        FROM {temporal_table} tr
        INNER JOIN {entity_table} e ON e.id = tr.entity_id
        WHERE e.schema_id = %s
          AND tr.is_superseded = FALSE
          AND tr.valid_from <= %s
          AND (tr.valid_to IS NULL OR tr.valid_to > %s)
        ORDER BY tr.entity_id ASC, tr.valid_from DESC, tr.id DESC
    """


def _current_view_order_clause(ordering: str) -> str:
    descending = ordering.startswith("-")
    field = _ordering_field(ordering)
    column = CURRENT_VIEW_PUSH_DOWN_ORDER_COLUMNS.get(field)
    if column is None:
        raise ValueError(f"Unsupported current view ordering: {ordering}")
    direction = "DESC" if descending else "ASC"
    if field == "business_code":
        return f"{column} {direction}, record_id ASC"
    null_direction = "DESC" if descending else "ASC"
    return (
        f"({column} IS NULL) {null_direction}, "
        f"{column} {direction}, business_code ASC, record_id ASC"
    )


def _ordering_field(ordering: str) -> str:
    return ordering[1:] if ordering.startswith("-") else ordering


def _current_record_from_row(row: tuple) -> CurrentViewRecord:
    return CurrentViewRecord(
        record_id=row[0],
        entity_id=row[1],
        business_code=row[2],
        data_payload=_coerce_json(row[3]),
        valid_from=row[4],
        valid_to=row[5],
        schema_version=row[6],
        change_set_id=row[7],
        recorded_by_id=row[8],
        recorded_at=row[9],
    )


def _coerce_json(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        return json.loads(value)
    return {}
