export const apiCalls = [];

export async function handleCurrentViewApiRequest(url, method) {
  const requestUrl = new URL(url);
  const path = stripApiPrefix(requestUrl.pathname);
  apiCalls.push({ path, method, params: Object.fromEntries(requestUrl.searchParams) });
  if (method !== "GET") return jsonResponse(405, { detail: "Smoke fixture only supports GET" });
  if (path === "/auth/me") return jsonResponse(200, currentUser);
  if (path === "/schemas/42/records") return jsonResponse(200, currentRecords(requestUrl));
  if (path === "/schemas/42/records/locate") return jsonResponse(200, recordLocation(requestUrl));
  if (path === "/schemas/42/draft-overlay") return jsonResponse(200, draftOverlay(requestUrl));
  if (path === "/schemas/42/changesets") return jsonResponse(200, changesetList(requestUrl));
  if (path === "/schemas/42/changesets/compare") return jsonResponse(200, compareChangesets(requestUrl));
  if (path === "/schemas/42/collaborators") return jsonResponse(200, collaborators);
  if (path === "/schemas/42/stats/summary") return jsonResponse(200, statsSummary(requestUrl));
  if (path === "/schemas/42/stats/trend") return jsonResponse(200, statsTrend);
  if (path === "/schemas/42/stats/distribution") return jsonResponse(200, statsDistribution(requestUrl));
  const detailId = path.match(/^\/schemas\/42\/changesets\/(\d+)$/)?.[1];
  if (detailId) return jsonResponse(200, changeDetailResponse(changeDetails[Number(detailId)], requestUrl));
  const entityId = path.match(/^\/entities\/(\d+)\/timeline$/)?.[1];
  if (entityId) return jsonResponse(200, entityTimeline(Number(entityId)));
  return jsonResponse(404, { detail: `Unhandled smoke fixture route: ${method} ${path}` });
}

const currentUser = {
  id: 7,
  username: "admin",
  display_name: "管理员",
  email: "admin@example.test",
  is_staff: true,
  is_superuser: true,
  is_employed: true,
  left_at: null,
};

const schema = {
  id: 42,
  schema_code: "asset_register",
  name: "固定资产台账",
  description: "当前视图 smoke fixture",
  icon: "boxes",
  temporal_mode: "continuous",
  period_unit: null,
  identity_field_key: "asset_no",
  fields_config: [
    { key: "asset_no", label: "资产编号", type: "text", required: true, indexed: true, introduced_in_version: 1 },
    { key: "status", label: "状态", type: "enum", validators: { options: ["在用", "维修", "库存"] }, introduced_in_version: 1, sensitive: true, masking: { visible_roles: ["owner"] } },
    { key: "visibility", label: "可见范围", type: "enum", validators: { options: ["内部", "公开"] }, introduced_in_version: 1 },
    { key: "owner", label: "负责人", type: "text", introduced_in_version: 1 },
    { key: "location", label: "位置", type: "text", introduced_in_version: 2 },
    { key: "note", label: "备注", type: "longtext", introduced_in_version: 3 },
  ],
  current_version: 3,
  visibility: "shared",
  approval_required: false,
  created_at: "2026-01-01T00:00:00Z",
  is_archived: false,
  role: "viewer",
  owner: { id: 7, username: "admin" },
};

const records = Array.from({ length: 120 }, (_, index) => {
  const number = index + 1;
  const code = `A-${String(number).padStart(3, "0")}`;
  const rowStatus = index === 0 || index === 1 ? "modified" : index === 2 ? "new" : "unchanged";
  const changedFields = index === 2 ? ["asset_no", "status"] : index < 2 ? ["status"] : [];
  return record(
    9001 + index,
    501 + index,
    code,
    {
      asset_no: code,
      status: index % 3 === 1 ? "维修" : "在用",
      visibility: index % 2 === 0 ? "内部" : "公开",
      owner: ["Alice Zhang", "Bob", "Carol", "Doris"][index % 4],
      location: ["上海", "北京", "深圳", "杭州"][index % 4],
      note: index === 0 ? "核心服务器" : `资产 ${code}`,
    },
    rowStatus,
    changedFields,
    index % 2 === 0 ? 301 : 302
  );
});

const changesets = [
  changeset(301, "5月资产状态批量更新", "applied", "2026-05-18T09:00:00Z", { create: 1, update: 42, terminate: 0 }, 43),
  changeset(302, "4月资产负责人调整", "applied", "2026-05-10T10:30:00Z", { create: 0, update: 1, terminate: 1 }, 2),
];

const changeDetails = {
  301: {
    ...changesets[0],
    entries: [
      entry(1001, 612, "A-112", "update", ["status", "owner"], { status: "库存", owner: "Alice" }, { status: "在用", owner: "Alice Zhang" }),
      entry(1002, 502, "A-002", "update", ["status"], { status: "在用" }, { status: "维修" }),
      entry(1003, 503, "A-003", "create", ["asset_no", "status"], null, { asset_no: "A-003", status: "在用" }),
      ...overflowEntries(),
    ],
  },
  302: {
    ...changesets[1],
    entries: [
      entry(1101, 501, "A-001", "update", ["owner"], { owner: "Alice" }, { owner: "Alice Zhang" }),
      entry(1102, 504, "A-004", "terminate", ["status"], { status: "在用" }, { status: "库存" }),
    ],
  },
};

const collaborators = [
  { user_id: 8, username: "reviewer", role: "editor", added_at: "2026-01-02T00:00:00Z", is_employed: true },
];

const statsTrend = {
  schema_id: 42,
  unit: "day",
  range: 14,
  points: [
    { at: "2026-05-18", count: 3 },
    { at: "2026-05-19", count: 0 },
    { at: "2026-05-20", count: 1 },
  ],
};

function currentRecords(requestUrl) {
  const changeSet = requestUrl.searchParams.get("change_set");
  const page = Math.max(Number(requestUrl.searchParams.get("page") ?? 1), 1);
  const pageSize = Math.max(Number(requestUrl.searchParams.get("page_size") ?? 50), 1);
  const selected = changeSet
    ? records.filter((item) => item.change_set_id === Number(changeSet))
    : records;
  const start = (page - 1) * pageSize;
  const results = selected.slice(start, start + pageSize);
  return {
    schema,
    schema_id: 42,
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    retro: requestUrl.searchParams.get("retro") === "true",
    schema_version: 3,
    fields_config: schema.fields_config,
    count: selected.length,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(selected.length / pageSize)),
    results,
  };
}

function recordLocation(requestUrl) {
  if (requestUrl.searchParams.get("search")) {
    return unsupportedLocation(requestUrl, "search_scope_not_supported");
  }
  if (requestUrl.searchParams.get("change_set")) {
    return unsupportedLocation(requestUrl, "change_set_scope_not_supported");
  }

  const ordering = requestUrl.searchParams.get("ordering") ?? "business_code";
  if (!["business_code", "-business_code"].includes(ordering)) {
    return unsupportedLocation(requestUrl, "ordering_not_supported");
  }

  const pageSize = Math.max(Number(requestUrl.searchParams.get("page_size") ?? 50), 1);
  const entityId = Number(requestUrl.searchParams.get("entity_id"));
  const sorted = [...records].sort((left, right) =>
    ordering.startsWith("-")
      ? right.business_code.localeCompare(left.business_code)
      : left.business_code.localeCompare(right.business_code)
  );
  const index = sorted.findIndex((item) => item.entity_id === entityId);
  const base = locationBase(requestUrl);
  if (index < 0) {
    return {
      ...base,
      supported: true,
      found: false,
      reason: "entity_not_in_current_view",
      count: sorted.length,
    };
  }
  return {
    ...base,
    record_id: sorted[index].record_id,
    supported: true,
    found: true,
    page: Math.floor(index / pageSize) + 1,
    offset: index,
    position: index + 1,
    count: sorted.length,
  };
}

function unsupportedLocation(requestUrl, reason) {
  return { ...locationBase(requestUrl), supported: false, reason };
}

function locationBase(requestUrl) {
  return {
    schema_id: 42,
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    retro: requestUrl.searchParams.get("retro") === "true",
    entity_id: Number(requestUrl.searchParams.get("entity_id")),
    ordering: requestUrl.searchParams.get("ordering") ?? "business_code",
    page_size: Math.max(Number(requestUrl.searchParams.get("page_size") ?? 50), 1),
  };
}

function draftOverlay(requestUrl) {
  return {
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    cells: [],
    create_rows: [],
    change_sets: [],
  };
}

function changeDetailResponse(detail, requestUrl) {
  if (!requestUrl.searchParams.has("entries_page") && !requestUrl.searchParams.has("entries_page_size")) {
    return detail;
  }
  const page = Math.max(Number(requestUrl.searchParams.get("entries_page") ?? 1), 1);
  const pageSize = Math.max(Number(requestUrl.searchParams.get("entries_page_size") ?? 80), 1);
  const start = (page - 1) * pageSize;
  const { entries, ...summary } = detail;
  return {
    ...summary,
    field_aggregates: fieldAggregates(entries),
    entries_page: {
      count: entries.length,
      page,
      page_size: pageSize,
      total_pages: entries.length ? Math.ceil(entries.length / pageSize) : 0,
      results: entries.slice(start, start + pageSize),
    },
  };
}

function fieldAggregates(entries) {
  const labels = Object.fromEntries(schema.fields_config.map((field) => [field.key, field.label]));
  const aggregateMap = new Map();
  for (const item of entries) {
    for (const fieldKey of item.changed_fields) {
      const aggregate = aggregateMap.get(fieldKey) ?? {
        key: fieldKey,
        label: labels[fieldKey] ?? fieldKey,
        change_count: 0,
        entity_ids: new Set(),
        action_counts: { create: 0, update: 0, terminate: 0 },
      };
      aggregate.change_count += 1;
      aggregate.entity_ids.add(item.entity_id);
      aggregate.action_counts[item.action] += 1;
      aggregateMap.set(fieldKey, aggregate);
    }
  }
  return [...aggregateMap.values()]
    .map((item) => ({
      key: item.key,
      label: item.label,
      change_count: item.change_count,
      entity_count: item.entity_ids.size,
      action_counts: item.action_counts,
    }))
    .sort(
      (left, right) =>
        right.change_count - left.change_count ||
        right.entity_count - left.entity_count ||
        left.label.localeCompare(right.label)
    );
}

function compareChangesets(requestUrl) {
  const left = changeDetails[Number(requestUrl.searchParams.get("left"))];
  const right = changeDetails[Number(requestUrl.searchParams.get("right"))];
  return {
    left: summaryWithoutEntries(left),
    right: summaryWithoutEntries(right),
    action_rows: ["create", "update", "terminate"].map((action) => ({
      action,
      left: left.action_counts[action],
      right: right.action_counts[action],
      delta: right.action_counts[action] - left.action_counts[action],
    })),
    field_rows: compareFieldRows(left.entries, right.entries),
    entity_overlap: entityOverlap(left.entries, right.entries),
  };
}

function compareFieldRows(leftEntries, rightEntries) {
  const leftFields = new Map(fieldAggregates(leftEntries).map((item) => [item.key, item]));
  const rightFields = new Map(fieldAggregates(rightEntries).map((item) => [item.key, item]));
  return [...new Set([...leftFields.keys(), ...rightFields.keys()])]
    .map((key) => {
      const left = leftFields.get(key);
      const right = rightFields.get(key);
      const leftChanges = left?.change_count ?? 0;
      const rightChanges = right?.change_count ?? 0;
      return {
        key,
        label: left?.label ?? right?.label ?? key,
        left_changes: leftChanges,
        right_changes: rightChanges,
        left_entities: left?.entity_count ?? 0,
        right_entities: right?.entity_count ?? 0,
        delta: rightChanges - leftChanges,
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.delta) - Math.abs(left.delta) ||
        right.right_changes - left.right_changes ||
        left.label.localeCompare(right.label)
    );
}

function entityOverlap(leftEntries, rightEntries) {
  const leftIds = new Set(leftEntries.map((item) => item.entity_id));
  const rightIds = new Set(rightEntries.map((item) => item.entity_id));
  const shared = [...leftIds].filter((id) => rightIds.has(id)).length;
  return {
    left_entity_count: leftIds.size,
    right_entity_count: rightIds.size,
    shared_entity_count: shared,
    left_only_entity_count: [...leftIds].filter((id) => !rightIds.has(id)).length,
    right_only_entity_count: [...rightIds].filter((id) => !leftIds.has(id)).length,
  };
}

function summaryWithoutEntries(detail) {
  const summary = { ...detail };
  delete summary.entries;
  return summary;
}

function changesetList(requestUrl) {
  let results = changesets;
  const status = requestUrl.searchParams.get("status");
  const createdBy = requestUrl.searchParams.get("created_by");
  const from = requestUrl.searchParams.get("created_from");
  const to = requestUrl.searchParams.get("created_to");
  if (status) results = results.filter((item) => item.status === status);
  if (createdBy) results = results.filter((item) => item.created_by_id === Number(createdBy));
  if (from) results = results.filter((item) => item.created_at.slice(0, 10) >= from);
  if (to) results = results.filter((item) => item.created_at.slice(0, 10) <= to);
  return { count: results.length, page: 1, page_size: 20, total_pages: 1, results };
}

function statsSummary(requestUrl) {
  const selected = statsRecords(requestUrl);
  return {
    schema_id: 42,
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    scope: statsScope(requestUrl),
    metrics: { total: selected.length, month_created: 1, month_updated: 3, month_terminated: 1 },
    latest_change_at: "2026-05-18T09:00:00Z",
    latest_change_set_id: 301,
  };
}

function statsDistribution(requestUrl) {
  const field = requestUrl.searchParams.get("field") ?? "status";
  const fieldConfig = schema.fields_config.find((item) => item.key === field) ?? schema.fields_config[1];
  const counts = new Map();
  for (const item of statsRecords(requestUrl)) {
    const value = item.data_payload[field];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return {
    schema_id: 42,
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    scope: statsScope(requestUrl),
    field: { key: fieldConfig.key, label: fieldConfig.label, type: fieldConfig.type },
    buckets: fieldConfig.validators.options
      .filter((value) => counts.has(value))
      .map((value) => ({ value, count: counts.get(value) })),
  };
}

function statsRecords(requestUrl) {
  const changeSet = requestUrl.searchParams.get("change_set");
  const keyword = (requestUrl.searchParams.get("search") ?? "").trim().toLowerCase();
  return records.filter((item) => {
    if (changeSet && item.change_set_id !== Number(changeSet)) return false;
    if (!keyword) return true;
    return [item.business_code, ...Object.values(item.data_payload)]
      .some((value) => String(value).toLowerCase().includes(keyword));
  });
}

function statsScope(requestUrl) {
  const changeSet = requestUrl.searchParams.get("change_set");
  return {
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    retro: requestUrl.searchParams.get("retro") === "true",
    search: requestUrl.searchParams.get("search") ?? "",
    ordering: requestUrl.searchParams.get("ordering") ?? "business_code",
    change_set: changeSet ? Number(changeSet) : null,
  };
}

function entityTimeline(entityId) {
  const found = records.find((item) => item.entity_id === entityId) ?? records[0];
  return {
    entity: { id: found.entity_id, schema_id: 42, business_code: found.business_code, created_at: "2026-01-01T00:00:00Z", created_by_id: 7 },
    schema,
    records: [{ record_id: found.record_id, schema_version: 3, data_payload: found.data_payload, valid_from: found.valid_from, valid_to: null, change_set_id: found.change_set_id, change_summary: "fixture", recorded_by_id: 7, recorded_at: found.recorded_at }],
  };
}

function changeset(id, summary, status, createdAt, actionCounts, entryCount) {
  return {
    id,
    schema_id: 42,
    summary,
    status,
    source: "manual",
    approval_required: false,
    approver_id: null,
    approver_username: null,
    created_at: createdAt,
    created_by_id: 7,
    created_by_username: "admin",
    applied_at: createdAt,
    revert_of_id: null,
    entry_count: entryCount,
    action_counts: actionCounts,
  };
}

function record(recordId, entityId, code, payload, rowStatus, changedFields, changeSetId) {
  return {
    record_id: recordId,
    entity_id: entityId,
    business_code: code,
    data_payload: payload,
    row_status: rowStatus,
    changed_fields: changedFields,
    valid_from: "2026-05-01",
    valid_to: null,
    schema_version: 3,
    change_set_id: changeSetId,
    recorded_by_id: 7,
    recorded_at: "2026-05-18T09:00:00Z",
  };
}

function entry(id, entityId, code, action, fields, before, after) {
  return {
    id,
    entity_id: entityId,
    business_code: code,
    action,
    data_before: before,
    data_after: after,
    changed_fields: fields,
    valid_from: "2026-05-01",
    valid_to: null,
    new_record_id: action === "create" ? id + 9000 : null,
  };
}

function overflowEntries() {
  return Array.from({ length: 40 }, (_, index) => {
    const id = 1200 + index;
    const entityId = 600 + index;
    return entry(
      id,
      entityId,
      `A-${String(100 + index).padStart(3, "0")}`,
      "update",
      ["status"],
      { status: "在用" },
      { status: index % 2 === 0 ? "维修" : "库存" }
    );
  });
}

function stripApiPrefix(path) {
  return path.replace(/^\/api\/v1/, "").replace(/\/$/, "");
}

function jsonResponse(status, body) {
  return {
    status,
    headers: [{ name: "content-type", value: "application/json; charset=utf-8" }],
    body,
  };
}
