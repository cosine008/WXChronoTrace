from __future__ import annotations

import datetime as dt
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "chronotrace.settings")

import django  # noqa: E402

django.setup()

from django.contrib.auth.models import User  # noqa: E402
from django.db import connection, transaction  # noqa: E402
from django.test.utils import CaptureQueriesContext  # noqa: E402
from django.utils import timezone  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from apps.changesets.models import ChangeEntry, ChangeSet  # noqa: E402
from apps.schemas.models import DataSchema, SchemaVersion  # noqa: E402
from apps.temporal.models import Entity, TemporalRecord  # noqa: E402

REPORT_PATH = ROOT / ".codex-tmp" / "current-view-backend-performance-latest.json"
AT = dt.date(2026, 5, 21)
REPEATS = 3


@dataclass(frozen=True)
class Scenario:
    label: str
    row_count: int
    change_entry_count: int


SCENARIOS = (
    Scenario(label="1k", row_count=1_000, change_entry_count=500),
    Scenario(label="10k", row_count=10_000, change_entry_count=2_000),
)


def main() -> int:
    report = {"generated_at": timezone.now().isoformat(), "scenarios": []}
    with transaction.atomic():
        owner = User.objects.create_user(username=f"perf_owner_{uuid4().hex[:12]}", password="pass")
        client = APIClient(HTTP_HOST="localhost")
        client.force_authenticate(user=owner)
        for scenario in SCENARIOS:
            report["scenarios"].append(run_scenario(client, owner, scenario))
        transaction.set_rollback(True)

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"current-view backend performance report: {REPORT_PATH}")
    for scenario in report["scenarios"]:
        metrics = scenario["metrics"]
        print(
            scenario["label"],
            f"baseline={metrics['baseline_page']['median_ms']}ms",
            f"search={metrics['search_owner']['median_ms']}ms",
            f"sort={metrics['sort_cost']['median_ms']}ms",
            f"change_set={metrics['change_set_scope']['median_ms']}ms",
            f"queries={metrics['baseline_page']['queries']}",
            sep=" | ",
        )
    return 0


def run_scenario(client: APIClient, owner: User, scenario: Scenario) -> dict:
    seeded = seed_scenario(owner, scenario)
    endpoint = f"/api/v1/schemas/{seeded['schema'].id}/records/"
    metrics = {
        "baseline_page": measure_endpoint(client, endpoint, {"at": AT.isoformat(), "page_size": 200}),
        "search_owner": measure_endpoint(
            client,
            endpoint,
            {"at": AT.isoformat(), "page_size": 200, "search": "Owner 7"},
        ),
        "sort_cost": measure_endpoint(
            client,
            endpoint,
            {"at": AT.isoformat(), "page_size": 200, "ordering": "-cost"},
        ),
        "change_set_scope": measure_endpoint(
            client,
            endpoint,
            {
                "at": AT.isoformat(),
                "page_size": 200,
                "change_set": seeded["change_set"].id,
            },
        ),
    }
    return {
        "label": scenario.label,
        "row_count": scenario.row_count,
        "change_entry_count": scenario.change_entry_count,
        "schema_id": seeded["schema"].id,
        "change_set_id": seeded["change_set"].id,
        "indexes": collect_index_summary(),
        "metrics": metrics,
    }


def seed_scenario(owner: User, scenario: Scenario) -> dict:
    schema = DataSchema.objects.create(
        schema_code=f"perf_{scenario.label}_{uuid4().hex[:8]}",
        name=f"Performance {scenario.label}",
        description="P3-05 current view backend performance fixture",
        icon="timer",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=fields_config(),
        current_version=5,
        owner=owner,
        visibility=DataSchema.Visibility.SHARED,
        created_by=owner,
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=5,
        fields_config=schema.fields_config,
        changelog="performance fixture",
        created_by=owner,
    )
    seed_set = ChangeSet.objects.create(
        schema=schema,
        summary=f"Seed {scenario.label}",
        status=ChangeSet.Status.APPLIED,
        created_by=owner,
        applied_at=timezone.now(),
    )
    focus_set = ChangeSet.objects.create(
        schema=schema,
        summary=f"Focus {scenario.label}",
        status=ChangeSet.Status.DRAFT,
        created_by=owner,
    )
    entities = [
        Entity(schema=schema, business_code=f"AS-{index + 1:05d}", created_by=owner)
        for index in range(scenario.row_count)
    ]
    Entity.objects.bulk_create(entities, batch_size=1_000)
    entities = list(Entity.objects.filter(schema=schema).order_by("business_code"))
    TemporalRecord.objects.bulk_create(
        [
            TemporalRecord(
                entity=entity,
                schema_version=5,
                data_payload=payload_for(index),
                valid_from=dt.date(2026, 1, 1),
                valid_to=None,
                change_set=seed_set,
                recorded_by=owner,
            )
            for index, entity in enumerate(entities)
        ],
        batch_size=1_000,
    )
    ChangeEntry.objects.bulk_create(
        [
            ChangeEntry(
                change_set=focus_set,
                entity=entity,
                action=ChangeEntry.Action.UPDATE,
                data_before={"asset_no": entity.business_code, "status": "active"},
                data_after={"asset_no": entity.business_code, "status": "review"},
                valid_from=AT,
            )
            for entity in entities[: scenario.change_entry_count]
        ],
        batch_size=1_000,
    )
    return {"schema": schema, "change_set": focus_set}


def measure_endpoint(client: APIClient, endpoint: str, params: dict) -> dict:
    samples = []
    last_payload = None
    last_query_count = 0
    last_sql_ms = 0.0
    for index in range(REPEATS + 1):
        with CaptureQueriesContext(connection) as captured:
            started_at = time.perf_counter()
            response = client.get(endpoint, params)
            elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
        if response.status_code != 200:
            raise RuntimeError(f"{endpoint} failed with {response.status_code}: {response.content!r}")
        payload = response.json()
        if index == 0:
            continue
        samples.append(elapsed_ms)
        last_payload = payload
        last_query_count = len(captured)
        last_sql_ms = round(sum(float(query.get("time", 0.0)) for query in captured) * 1000, 1)
    assert last_payload is not None
    return {
        "median_ms": round(statistics.median(samples), 1),
        "min_ms": round(min(samples), 1),
        "max_ms": round(max(samples), 1),
        "queries": last_query_count,
        "sql_ms": last_sql_ms,
        "count": last_payload["count"],
        "returned": len(last_payload["results"]),
    }


def fields_config() -> list[dict]:
    return [
        {"key": "asset_no", "label": "Asset No", "type": "text", "required": True},
        {"key": "status", "label": "Status", "type": "enum"},
        {"key": "owner", "label": "Owner", "type": "text"},
        {"key": "region", "label": "Region", "type": "text"},
        {"key": "cost", "label": "Cost", "type": "number", "indexed": True},
        {"key": "vendor", "label": "Vendor", "type": "text"},
        {"key": "location", "label": "Location", "type": "text"},
        {"key": "department", "label": "Department", "type": "text"},
        {"key": "risk", "label": "Risk", "type": "enum", "sensitive": True},
        {"key": "serial_no", "label": "Serial No", "type": "text"},
        {"key": "warranty_until", "label": "Warranty Until", "type": "date"},
        {"key": "updated_on", "label": "Updated On", "type": "date"},
        {"key": "flagged", "label": "Flagged", "type": "boolean"},
        {"key": "score", "label": "Score", "type": "number"},
        {"key": "tag", "label": "Tag", "type": "text"},
        {"key": "note", "label": "Note", "type": "longtext"},
    ]


def payload_for(index: int) -> dict:
    return {
        "asset_no": f"AS-{index + 1:05d}",
        "status": ["active", "repair", "stock"][index % 3],
        "owner": f"Owner {index % 30}",
        "region": f"R{index % 8}",
        "cost": (index % 500) * 10 + 0.5,
        "vendor": f"Vendor {index % 20}",
        "location": f"Room {index % 200}",
        "department": f"Dept {index % 12}",
        "risk": ["low", "medium", "high"][index % 3],
        "serial_no": f"SN{index + 1:08d}",
        "warranty_until": f"2027-{(index % 12) + 1:02d}-15",
        "updated_on": f"2026-05-{(index % 28) + 1:02d}",
        "flagged": index % 17 == 0,
        "score": index % 100,
        "tag": f"T{index % 50}",
        "note": f"Performance fixture row {index + 1}",
    }


def collect_index_summary() -> dict[str, list[str]]:
    tables = {
        "changesets_changeentry": ["idx_changeentry_set_action", "idx_changeentry_entity_vfrom"],
        "temporal_temporalrecord": [
            "idx_tr_entity_vfrom",
            "idx_tr_entity_vfrom_desc",
            "idx_tr_data_payload_gin",
        ],
        "temporal_entity": ["idx_entity_schema_code"],
    }
    with connection.cursor() as cursor:
        return {
            table: [name for name in expected if index_exists(cursor, table, name)]
            for table, expected in tables.items()
        }


def index_exists(cursor, table: str, index_name: str) -> bool:
    cursor.execute(
        """
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = ANY (current_schemas(false))
          AND tablename = %s
          AND indexname = %s
        """,
        [table, index_name],
    )
    return cursor.fetchone() is not None


if __name__ == "__main__":
    raise SystemExit(main())
