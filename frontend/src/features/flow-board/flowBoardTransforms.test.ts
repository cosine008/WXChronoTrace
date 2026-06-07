import assert from "node:assert/strict";
import test from "node:test";

import type { FieldConfig } from "../../api/schemas.ts";

import { appendReturnTo, buildFlowBoardPath, safeReturnTo } from "./flowBoardQuery.ts";
import {
  availableFlowDimensions,
  defaultFlowDates,
  defaultFlowDimensionForFields,
  flowSnapshotDiffUrl,
  heatIntensity,
  normalizeFlowDimension,
  parseFlowDimension,
  topChangedLinks,
} from "./flowBoardTransforms.ts";

test("normalizeFlowDimension falls back to status", () => {
  assert.equal(normalizeFlowDimension(undefined), "status");
  assert.equal(normalizeFlowDimension(null), "status");
  assert.equal(normalizeFlowDimension(""), "status");
  assert.equal(normalizeFlowDimension("unknown"), "status");
  assert.equal(normalizeFlowDimension("department"), "department");
  assert.equal(normalizeFlowDimension("labels"), "labels");
});

test("parseFlowDimension returns null for missing or unsupported dimensions", () => {
  assert.equal(parseFlowDimension(undefined), null);
  assert.equal(parseFlowDimension(""), null);
  assert.equal(parseFlowDimension("owner"), null);
  assert.equal(parseFlowDimension("status"), "status");
});

test("defaultFlowDimensionForFields prefers department when status is unavailable", () => {
  const fields: FieldConfig[] = [
    { key: "asset_name", label: "资产名称", type: "text" },
    { key: "field_2", label: "部门", type: "enum" },
  ];

  assert.equal(defaultFlowDimensionForFields(fields), "department");
  assert.deepEqual(availableFlowDimensions(fields), ["department"]);
});

test("defaultFlowDimensionForFields returns null when no flow dimension is available", () => {
  const fields: FieldConfig[] = [
    { key: "field_9", label: "用途", type: "enum" },
    { key: "status_note", label: "状态说明", type: "enum" },
    { key: "tagline", label: "标签备注", type: "multi-enum" },
  ];

  assert.equal(defaultFlowDimensionForFields(fields), null);
  assert.deepEqual(availableFlowDimensions(fields), []);
});

test("availableFlowDimensions requires exact aliases and matching field types", () => {
  const fields: FieldConfig[] = [
    { key: "status", label: "状态", type: "text" },
    { key: "org_code", label: "组织编号", type: "enum" },
    { key: "tags", label: "标签", type: "multi-enum" },
    { key: "state", label: "State", type: "enum" },
  ];

  assert.deepEqual(availableFlowDimensions(fields), ["status", "labels"]);
});

test("availableFlowDimensions excludes hidden deprecated system and masked fields", () => {
  const fields: FieldConfig[] = [
    { key: "status", label: "状态", type: "enum", hidden: true },
    { key: "department", label: "部门", type: "enum", deprecated: true },
    { key: "labels", label: "标签", type: "multi-enum", sensitive: true },
    { key: "team", label: "团队", type: "enum", sensitive: true },
  ];

  assert.deepEqual(availableFlowDimensions(fields, "viewer"), []);
  assert.deepEqual(availableFlowDimensions(fields, "owner"), ["department", "labels"]);
});

test("flowSnapshotDiffUrl prefers link url and falls back to flow url", () => {
  assert.equal(
    flowSnapshotDiffUrl(
      { snapshot_diff_to: "/schemas/7/diff-studio?mode=snapshot" },
      { snapshot_diff_to: "/schemas/7/diff-studio?mode=snapshot&group=hot" }
    ),
    "/schemas/7/diff-studio?mode=snapshot&group=hot"
  );
  assert.equal(
    flowSnapshotDiffUrl(
      { snapshot_diff_to: "/schemas/7/diff-studio?mode=snapshot" },
      { snapshot_diff_to: null }
    ),
    "/schemas/7/diff-studio?mode=snapshot"
  );
  assert.equal(flowSnapshotDiffUrl({ snapshot_diff_to: null }, { snapshot_diff_to: null }), null);
});

test("topChangedLinks keeps changed links only and sorts by value desc", () => {
  const links = [
    {
      source: "left:warehouse",
      target: "right:warehouse",
      value: 8,
      from: "Warehouse",
      to: "Warehouse",
      changed: false,
      sample_entity_ids: [],
      snapshot_diff_to: null,
    },
    {
      source: "left:repair",
      target: "right:active",
      value: 13,
      from: "Repair",
      to: "Active",
      changed: true,
      sample_entity_ids: [2, 3],
      snapshot_diff_to: null,
    },
    {
      source: "left:active",
      target: "right:repair",
      value: 21,
      from: "Active",
      to: "Repair",
      changed: true,
      sample_entity_ids: [1],
      snapshot_diff_to: null,
    },
  ];

  assert.deepEqual(
    topChangedLinks(links).map((link) => `${link.from}:${link.to}:${link.value}`),
    ["Active:Repair:21", "Repair:Active:13"]
  );
  assert.deepEqual(topChangedLinks(links, 1).map((link) => link.value), [21]);
});

test("heatIntensity clamps to expected range", () => {
  assert.equal(heatIntensity(0, 10), 0);
  assert.equal(heatIntensity(5, 0), 0);
  assert.equal(heatIntensity(1, 10), 0.16);
  assert.equal(heatIntensity(3, 10), 0.3);
  assert.equal(heatIntensity(25, 20), 1);
  assert.equal(heatIntensity(2, 3), 0.67);
});

test("defaultFlowDates preserves explicit dates", () => {
  assert.deepEqual(defaultFlowDates("2026-05-01", "2026-05-25"), {
    left_at: "2026-05-01",
    right_at: "2026-05-25",
  });
});

test("defaultFlowDates uses right date when left is blank", () => {
  assert.deepEqual(defaultFlowDates(" ", "2026-05-25"), {
    left_at: "2026-05-25",
    right_at: "2026-05-25",
  });
});

test("defaultFlowDates generates today when right is blank and left follows right", () => {
  const dates = defaultFlowDates("", " ");
  assert.match(dates.right_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dates.left_at, dates.right_at);
});

test("defaultFlowDates keeps left date when only left is provided", () => {
  const dates = defaultFlowDates("2026-05-01", "");
  assert.equal(dates.left_at, "2026-05-01");
  assert.match(dates.right_at, /^\d{4}-\d{2}-\d{2}$/);
});

test("buildFlowBoardPath normalizes route query and skips return_to", () => {
  assert.equal(
    buildFlowBoardPath(7, {
      left_at: "2026-05-01",
      right_at: "2026-05-25",
      dimension: "department",
      retro: true,
      search: "pump room",
      ordering: "-business_code",
      return_to: "/schemas/7/records?at=2026-05-01",
    }),
    "/schemas/7/flow-board?left_at=2026-05-01&right_at=2026-05-25&dimension=department&retro=true&search=pump+room&ordering=-business_code"
  );

  assert.equal(
    buildFlowBoardPath(9, {
      left_at: "2026-05-10",
      right_at: "2026-05-27",
      dimension: " status ",
    }),
    "/schemas/9/flow-board?left_at=2026-05-10&right_at=2026-05-27&dimension=status&retro=false&search=&ordering=business_code"
  );
});

test("buildFlowBoardPath omits missing or unsupported dimensions", () => {
  assert.equal(
    buildFlowBoardPath(7, {
      left_at: "2026-05-01",
      right_at: "2026-05-25",
      dimension: null,
    }),
    "/schemas/7/flow-board?left_at=2026-05-01&right_at=2026-05-25&retro=false&search=&ordering=business_code"
  );
  assert.equal(
    buildFlowBoardPath(7, {
      left_at: "2026-05-01",
      right_at: "2026-05-25",
      dimension: "owner",
    }),
    "/schemas/7/flow-board?left_at=2026-05-01&right_at=2026-05-25&retro=false&search=&ordering=business_code"
  );
});

test("appendReturnTo appends or replaces return_to when provided", () => {
  assert.equal(
    appendReturnTo("/schemas/7/flow-board?left_at=2026-05-01", "/schemas/7/records?at=2026-05-01"),
    "/schemas/7/flow-board?left_at=2026-05-01&return_to=%2Fschemas%2F7%2Frecords%3Fat%3D2026-05-01"
  );
  assert.equal(
    appendReturnTo(
      "/schemas/7/flow-board?left_at=2026-05-01&return_to=%2Fold",
      "/schemas/7/diff-studio?mode=snapshot"
    ),
    "/schemas/7/flow-board?left_at=2026-05-01&return_to=%2Fschemas%2F7%2Fdiff-studio%3Fmode%3Dsnapshot"
  );
  assert.equal(appendReturnTo("/schemas/7/flow-board", null), "/schemas/7/flow-board");
});

test("safeReturnTo only accepts in-app paths", () => {
  assert.equal(safeReturnTo("/schemas/7/records?at=2026-05-01", "/fallback"), "/schemas/7/records?at=2026-05-01");
  assert.equal(safeReturnTo(" /schemas/7/diff-studio ", "/fallback"), "/schemas/7/diff-studio");
  assert.equal(safeReturnTo("//evil.example/path", "/fallback"), "/fallback");
  assert.equal(safeReturnTo("https://evil.example/path", "/fallback"), "/fallback");
  assert.equal(safeReturnTo("", "/fallback"), "/fallback");
});
