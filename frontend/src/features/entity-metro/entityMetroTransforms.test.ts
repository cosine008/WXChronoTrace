/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import type { EntityTimelineResponse, TimelineRecord } from "../../api/schemas.ts";

type ModelLike = {
  keyStations: StationLike[];
  minorStations: StationLike[];
  highlightedStationId: string | null;
};

type StationLike = {
  id: string;
  timelineIndex: number;
  schemaVersion: number;
  highlighted: boolean;
  reasonCodes: string[];
  changedFields: string[];
  fieldChanges: Array<{ key: string; before: unknown; after: unknown }>;
};

type BuildEntityMetroModel = (timeline: EntityTimelineResponse, context: unknown) => ModelLike;

async function loadBuildEntityMetroModel(): Promise<BuildEntityMetroModel> {
  const module = await import("./entityMetroTransforms.ts");
  assert.equal(
    typeof module.buildEntityMetroModel,
    "function",
    "expected buildEntityMetroModel() to be exported"
  );
  return module.buildEntityMetroModel as BuildEntityMetroModel;
}

function makeTimeline(records: TimelineRecord[]): EntityTimelineResponse {
  return {
    entity: {
      id: 42,
      schema_id: 7,
      business_code: "asset-42",
      display_code: "ASSET-42",
      created_at: "2026-05-01T00:00:00Z",
      created_by_id: 5,
    },
    schema: {
      id: 7,
      schema_code: "asset",
      name: "Asset",
      description: "",
      icon: "box",
      temporal_mode: "continuous",
      period_unit: null,
      identity_mode: "single",
      identity_field_key: "serial_no",
      identity_field_keys: ["serial_no"],
      identity_display_template: "{{serial_no}}",
      fields_config: [
        { key: "status", label: "状态", type: "enum" },
        { key: "department", label: "部门", type: "text" },
        { key: "serial_no", label: "序列号", type: "text" },
        { key: "notes", label: "备注", type: "longtext" },
        { key: "name", label: "名称", type: "text" },
      ],
      label_print_config: {},
      field_count: 5,
      current_version: records.at(-1)?.schema_version ?? 0,
      config_migrated_at: "2026-05-01T00:00:00Z",
      row_count: 1,
      last_data_change_at: "2026-05-05T00:00:00Z",
      last_modified_at: "2026-05-05T00:00:00Z",
      visibility: "shared",
      approval_required: false,
      created_at: "2026-05-01T00:00:00Z",
      is_archived: false,
      role: "owner",
      owner: {
        id: 5,
        username: "owner",
      },
    },
    records,
  };
}

function makeRecord(
  schemaVersion: number,
  payload: Record<string, unknown>,
  overrides: Partial<TimelineRecord> = {}
): TimelineRecord {
  return {
    record_id: schemaVersion,
    schema_version: schemaVersion,
    data_payload: payload,
    valid_from: `2026-05-0${schemaVersion}T00:00:00Z`,
    valid_to: null,
    change_set_id: schemaVersion * 100,
    change_summary: `change ${schemaVersion}`,
    recorded_by_id: 9,
    recorded_at: `2026-05-0${schemaVersion}T01:00:00Z`,
    ...overrides,
  };
}

test("marks create, terminate, status, department, and key field versions as key stations", async () => {
  const buildEntityMetroModel = await loadBuildEntityMetroModel();
  const timeline = makeTimeline([
    makeRecord(1, { status: "draft", department: "ops", serial_no: "SN-001", name: "Alpha" }),
    makeRecord(2, { status: "active", department: "ops", serial_no: "SN-001", name: "Alpha" }),
    makeRecord(3, { status: "active", department: "finance", serial_no: "SN-001", name: "Alpha" }),
    makeRecord(4, { status: "active", department: "finance", serial_no: "SN-002", name: "Alpha" }),
    makeRecord(
      5,
      { status: "active", department: "finance", serial_no: "SN-002", name: "Alpha" },
      { valid_to: "2026-05-31T00:00:00Z" }
    ),
  ]);

  const model = buildEntityMetroModel(timeline, {
    source: "current-view",
    statusFieldKeys: ["status"],
    departmentFieldKeys: ["department"],
    keyFieldKeys: ["serial_no"],
  });

  assert.deepEqual(
    model.keyStations.map((station) => ({
      version: station.schemaVersion,
      reasons: station.reasonCodes,
    })),
    [
      { version: 1, reasons: ["create"] },
      { version: 2, reasons: ["status-change"] },
      { version: 3, reasons: ["department-change"] },
      { version: 4, reasons: ["key-field-change"] },
      { version: 5, reasons: ["terminate"] },
    ]
  );
}
);

test("keeps non-key versions in minorStations for all-versions mode", async () => {
  const buildEntityMetroModel = await loadBuildEntityMetroModel();
  const timeline = makeTimeline([
    makeRecord(2, { status: "draft", department: "ops", serial_no: "SN-001", notes: "created" }, { record_id: 21 }),
    makeRecord(2, { status: "draft", department: "ops", serial_no: "SN-001", notes: "edited" }, { record_id: 22 }),
    makeRecord(2, { status: "active", department: "ops", serial_no: "SN-001", notes: "edited" }, { record_id: 23 }),
  ]);

  const model = buildEntityMetroModel(timeline, {
    source: "current-view",
    viewMode: "all-versions",
    statusFieldKeys: ["status"],
    departmentFieldKeys: ["department"],
    keyFieldKeys: ["serial_no"],
  });

  assert.deepEqual(
    model.keyStations.map((station) => [station.id, station.timelineIndex]),
    [["record-21", 0], ["record-23", 2]]
  );
  assert.deepEqual(
    model.minorStations.map((station) => [station.id, station.timelineIndex]),
    [["record-22", 1]]
  );
  assert.deepEqual(model.minorStations[0]?.changedFields, ["notes"]);
}
);

test("highlights diff-studio field and version context without promoting minor versions to key stations", async () => {
  const buildEntityMetroModel = await loadBuildEntityMetroModel();
  const timeline = makeTimeline([
    makeRecord(2, { status: "draft", department: "ops", serial_no: "SN-001", notes: "created" }, { record_id: 31 }),
    makeRecord(2, { status: "draft", department: "ops", serial_no: "SN-001", notes: "reviewed" }, { record_id: 32 }),
    makeRecord(2, { status: "active", department: "ops", serial_no: "SN-001", notes: "reviewed" }, { record_id: 33 }),
  ]);

  const model = buildEntityMetroModel(timeline, {
    source: "diff-studio",
    statusFieldKeys: ["status"],
    departmentFieldKeys: ["department"],
    keyFieldKeys: ["serial_no"],
    highlightedFieldKeys: ["notes"],
    highlightedRecordId: 32,
  });

  assert.equal(model.highlightedStationId, "record-32");
  assert.equal(model.keyStations.some((station) => station.id === "record-32"), false);
  assert.equal(model.minorStations.some((station) => station.id === "record-32"), true);

  const highlightedMinor = model.minorStations.find((station) => station.id === "record-32");
  if (!highlightedMinor) {
    throw new Error("expected schema version 2 to stay as a highlighted minor station");
  }
  assert.equal(highlightedMinor.highlighted, true);
}
);

test("handles empty records, null values, and missing fields without crashing", async () => {
  const buildEntityMetroModel = await loadBuildEntityMetroModel();

  const emptyModel = buildEntityMetroModel(makeTimeline([]), {
    source: "current-view",
  });
  assert.deepEqual(emptyModel, {
    keyStations: [],
    minorStations: [],
    highlightedStationId: null,
  });

  const sparseTimeline = makeTimeline([
    makeRecord(1, { status: null, serial_no: "SN-001" }),
    makeRecord(2, { department: "ops", serial_no: "SN-001" }),
  ]);

  const sparseModel = buildEntityMetroModel(sparseTimeline, {
    source: "diff-studio",
    statusFieldKeys: ["status"],
    departmentFieldKeys: ["department"],
    keyFieldKeys: ["serial_no"],
    highlightedFieldKeys: ["missing_field"],
    highlightedVersionRange: {
      startSchemaVersion: null,
      endSchemaVersion: 99,
    },
  });

  assert.deepEqual(
    sparseModel.keyStations.map((station) => station.schemaVersion),
    [1, 2]
  );
  const missingStatusChange = sparseModel.keyStations[1]?.fieldChanges.find(
    (change) => change.key === "status"
  );
  assert.equal(missingStatusChange?.before, null);
  assert.equal(missingStatusChange?.after, undefined);
  assert.equal(sparseModel.highlightedStationId, null);
}
);
