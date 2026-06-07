export function createPerformanceFixture(options) {
  const dataset = buildDataset(options);
  const apiCalls = [];
  return {
    apiCalls,
    async handleRequest(url, method) {
      const requestUrl = new URL(url);
      const path = stripApiPrefix(requestUrl.pathname);
      const startedAt = performance.now();
      const response = routeRequest(dataset, requestUrl, path, method);
      apiCalls.push({
        path,
        method,
        params: Object.fromEntries(requestUrl.searchParams),
        durationMs: round(performance.now() - startedAt),
        status: response.status,
      });
      return response;
    },
  };
}

function routeRequest(dataset, requestUrl, path, method) {
  if (method !== "GET") return jsonResponse(405, { detail: "Performance fixture only supports GET" });
  if (path === "/auth/me") return jsonResponse(200, dataset.currentUser);
  if (path === "/schemas/77/records") return jsonResponse(200, currentRecords(dataset, requestUrl));
  if (path === "/schemas/77/draft-overlay") return jsonResponse(200, draftOverlay(requestUrl));
  if (path === "/schemas/77/changesets") return jsonResponse(200, changesetList(dataset, requestUrl));
  if (path === "/schemas/77/changesets/compare") return jsonResponse(200, compareChangesets(dataset, requestUrl));
  if (path === "/schemas/77/collaborators") return jsonResponse(200, dataset.collaborators);
  if (path === "/schemas/77/stats/summary") return jsonResponse(200, statsSummary(dataset, requestUrl));
  if (path === "/schemas/77/stats/trend") return jsonResponse(200, dataset.statsTrend);
  if (path === "/schemas/77/stats/distribution") return jsonResponse(200, dataset.statsDistribution);
  const detailId = Number(path.match(/^\/schemas\/77\/changesets\/(\d+)$/)?.[1]);
  if (detailId) {
    return jsonResponse(200, detailResponse(dataset, dataset.details.get(detailId), requestUrl));
  }
  const entityId = Number(path.match(/^\/entities\/(\d+)\/timeline$/)?.[1]);
  if (entityId) return jsonResponse(200, entityTimeline(dataset, entityId));
  return jsonResponse(404, { detail: `Unhandled performance fixture route: ${method} ${path}` });
}

function draftOverlay(requestUrl) {
  return {
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    cells: [],
    create_rows: [],
    change_sets: [],
  };
}

function buildDataset(options) {
  const fields = buildFields(options.fieldCount);
  const schema = {
    id: 77,
    schema_code: "asset_perf",
    name: `性能资产台账 ${options.label}`,
    description: "P3-02 performance fixture",
    icon: "boxes",
    temporal_mode: "continuous",
    period_unit: null,
    identity_field_key: "asset_no",
    fields_config: fields,
    current_version: 5,
    visibility: "shared",
    approval_required: false,
    created_at: "2026-01-01T00:00:00Z",
    is_archived: false,
    role: "owner",
    owner: { id: 7, username: "admin" },
  };
  const rows = Array.from({ length: options.rowCount }, (_, index) =>
    record(index, fields, index % 3 === 0 ? 501 : 502)
  );
  const changesets = buildChangesets(options.changeSetCount, options.bigEntryCount, options.hugeEntryCount);
  const details = new Map([
    [501, detail(changesets[0], fields, rows, options.bigEntryCount)],
    [502, detail(changesets[1], fields, rows, options.hugeEntryCount)],
  ]);
  for (const item of changesets.slice(2)) {
    details.set(item.id, detail(item, fields, rows, Math.min(80, options.bigEntryCount)));
  }
  return {
    ...options,
    currentUser,
    schema,
    fields,
    rows,
    changesets,
    details,
    collaborators,
    statsTrend: buildTrend(),
    statsDistribution: buildDistribution(),
  };
}

function currentRecords(dataset, requestUrl) {
  const page = Number(requestUrl.searchParams.get("page") ?? 1);
  const requestedPageSize = Number(requestUrl.searchParams.get("page_size") ?? 100);
  const selectedRows = requestUrl.searchParams.get("change_set")
    ? rowsForChangeSet(dataset, Number(requestUrl.searchParams.get("change_set")))
    : dataset.rows;
  const responseSize = dataset.returnedRows ?? requestedPageSize;
  const start = (page - 1) * requestedPageSize;
  const results = selectedRows.slice(start, start + responseSize);
  return {
    schema: dataset.schema,
    schema_id: 77,
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    retro: requestUrl.searchParams.get("retro") === "true",
    schema_version: dataset.schema.current_version,
    fields_config: dataset.fields,
    count: selectedRows.length,
    page,
    page_size: requestedPageSize,
    total_pages: Math.max(1, Math.ceil(selectedRows.length / requestedPageSize)),
    results,
  };
}

function changesetList(dataset, requestUrl) {
  let results = dataset.changesets;
  const status = requestUrl.searchParams.get("status");
  const createdBy = requestUrl.searchParams.get("created_by");
  if (status) results = results.filter((item) => item.status === status);
  if (createdBy) results = results.filter((item) => item.created_by_id === Number(createdBy));
  return { count: results.length, page: 1, page_size: 20, total_pages: 1, results };
}

function detailResponse(dataset, detail, requestUrl) {
  if (!requestUrl.searchParams.has("entries_page") && !requestUrl.searchParams.has("entries_page_size")) {
    return detail;
  }
  const page = Math.max(Number(requestUrl.searchParams.get("entries_page") ?? 1), 1);
  const pageSize = Math.max(Number(requestUrl.searchParams.get("entries_page_size") ?? 80), 1);
  const start = (page - 1) * pageSize;
  const { entries, ...summary } = detail;
  return {
    ...summary,
    field_aggregates: fieldAggregates(entries, dataset.fields),
    entries_page: {
      count: entries.length,
      page,
      page_size: pageSize,
      total_pages: entries.length ? Math.ceil(entries.length / pageSize) : 0,
      results: entries.slice(start, start + pageSize),
    },
  };
}

function fieldAggregates(entries, fields) {
  const labels = Object.fromEntries(fields.map((field) => [field.key, field.label]));
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

function compareChangesets(dataset, requestUrl) {
  const left = dataset.details.get(Number(requestUrl.searchParams.get("left")));
  const right = dataset.details.get(Number(requestUrl.searchParams.get("right")));
  return {
    left: summaryWithoutEntries(left),
    right: summaryWithoutEntries(right),
    action_rows: ["create", "update", "terminate"].map((action) => ({
      action,
      left: left.action_counts[action],
      right: right.action_counts[action],
      delta: right.action_counts[action] - left.action_counts[action],
    })),
    field_rows: compareFieldRows(left.entries, right.entries, dataset.fields),
    entity_overlap: entityOverlap(left.entries, right.entries),
  };
}

function compareFieldRows(leftEntries, rightEntries, fields) {
  const leftFields = new Map(fieldAggregates(leftEntries, fields).map((item) => [item.key, item]));
  const rightFields = new Map(fieldAggregates(rightEntries, fields).map((item) => [item.key, item]));
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

function rowsForChangeSet(dataset, changeSetId) {
  const detail = dataset.details.get(changeSetId);
  if (!detail) return [];
  const ids = new Set(detail.entries.map((entry) => entry.entity_id));
  return dataset.rows.filter((row) => ids.has(row.entity_id));
}

function statsSummary(dataset, requestUrl) {
  return {
    schema_id: 77,
    at: requestUrl.searchParams.get("at") ?? "2026-05-21",
    metrics: { total: dataset.rowCount, month_created: 18, month_updated: 240, month_terminated: 5 },
    latest_change_at: "2026-05-20T09:00:00Z",
    latest_change_set_id: 501,
  };
}

function entityTimeline(dataset, entityId) {
  const row = dataset.rows.find((item) => item.entity_id === entityId) ?? dataset.rows[0];
  return {
    entity: { id: row.entity_id, schema_id: 77, business_code: row.business_code, created_at: "2026-01-01T00:00:00Z", created_by_id: 7 },
    schema: dataset.schema,
    records: [{ record_id: row.record_id, schema_version: row.schema_version, data_payload: row.data_payload, valid_from: row.valid_from, valid_to: null, change_set_id: row.change_set_id, change_summary: "performance fixture", recorded_by_id: 7, recorded_at: row.recorded_at }],
  };
}

function buildFields(count) {
  const base = [
    ["asset_no", "资产编号", "text"],
    ["status", "状态", "enum"],
    ["owner", "负责人", "text"],
    ["location", "位置", "text"],
    ["department", "部门", "text"],
    ["category", "分类", "enum"],
    ["cost", "采购金额", "number"],
    ["purchase_date", "采购日期", "date"],
    ["vendor", "供应商", "text"],
    ["risk", "风险等级", "enum"],
    ["source_file", "来源文件", "text"],
    ["reviewer", "复核人", "text"],
    ["updated_by", "更新人", "text"],
    ["tag", "标签", "text"],
    ["serial_no", "序列号", "text"],
    ["note", "备注", "longtext"],
  ];
  return base.slice(0, count).map(([key, label, type], index) => ({
    key,
    label,
    type,
    indexed: index < 2,
    required: index === 0,
    introduced_in_version: Math.min(index + 1, 5),
    validators: type === "enum" ? { options: ["在用", "维修", "库存", "高", "中", "低"] } : undefined,
  }));
}

function buildChangesets(count, bigEntryCount, hugeEntryCount) {
  return Array.from({ length: count }, (_, index) => {
    const id = 501 + index;
    const entryCount = index === 0 ? bigEntryCount : index === 1 ? hugeEntryCount : 80 + index * 7;
    return {
      id,
      schema_id: 77,
      summary: index === 0 ? "500 条大批次 diff" : index === 1 ? "2000 条超大批次 diff" : `批次 ${id}`,
      status: "applied",
      source: index % 2 === 0 ? "manual" : "excel",
      approval_required: false,
      approver_id: null,
      approver_username: null,
      created_at: `2026-05-${String(20 - (index % 18)).padStart(2, "0")}T09:00:00Z`,
      created_by_id: 7,
      created_by_username: "admin",
      applied_at: `2026-05-${String(20 - (index % 18)).padStart(2, "0")}T10:00:00Z`,
      revert_of_id: null,
      entry_count: entryCount,
      action_counts: { create: Math.floor(entryCount * 0.1), update: Math.floor(entryCount * 0.85), terminate: Math.ceil(entryCount * 0.05) },
    };
  });
}

function detail(changeset, fields, rows, entryCount) {
  return {
    ...changeset,
    entries: Array.from({ length: entryCount }, (_, index) => {
      const row = rows[index % rows.length];
      const fieldA = fields[(index % (fields.length - 1)) + 1].key;
      const fieldB = fields[((index + 3) % (fields.length - 1)) + 1].key;
      return entry(20_000 + changeset.id * 10_000 + index, row, index % 17 === 0 ? "create" : "update", [fieldA, fieldB]);
    }),
  };
}

function record(index, fields, changeSetId) {
  const code = `AS-${String(index + 1).padStart(5, "0")}`;
  const payload = Object.fromEntries(fields.map((field) => [field.key, valueFor(field.key, index)]));
  return {
    record_id: 10_000 + index,
    entity_id: 30_000 + index,
    business_code: code,
    data_payload: payload,
    row_status: index % 11 === 0 ? "new" : index % 5 === 0 ? "modified" : "unchanged",
    changed_fields: ["status", "owner"],
    valid_from: "2026-05-01",
    valid_to: null,
    schema_version: 5,
    change_set_id: changeSetId,
    recorded_by_id: 7,
    recorded_at: "2026-05-20T09:00:00Z",
  };
}

function entry(id, row, action, fields) {
  return {
    id,
    entity_id: row.entity_id,
    business_code: row.business_code,
    action,
    data_before: Object.fromEntries(fields.map((field) => [field, `old-${row.entity_id}-${field}`])),
    data_after: Object.fromEntries(fields.map((field) => [field, row.data_payload[field]])),
    changed_fields: fields,
    valid_from: "2026-05-01",
    valid_to: null,
    new_record_id: action === "create" ? id + 1 : null,
  };
}

function valueFor(key, index) {
  if (key === "asset_no") return `AS-${String(index + 1).padStart(5, "0")}`;
  if (key === "status") return ["在用", "维修", "库存"][index % 3];
  if (key === "cost") return 10_000 + index * 13;
  if (key === "purchase_date") return `2026-04-${String((index % 28) + 1).padStart(2, "0")}`;
  if (key === "note") return `第 ${index + 1} 条性能验证记录，包含较长备注以模拟宽字段。`;
  return `${key}-${index % 97}`;
}

function buildTrend() {
  return { schema_id: 77, unit: "day", range: 14, points: Array.from({ length: 14 }, (_, index) => ({ at: `2026-05-${String(index + 7).padStart(2, "0")}`, count: 20 + index })) };
}

function buildDistribution() {
  return { schema_id: 77, at: "2026-05-21", field: { key: "status", label: "状态", type: "enum" }, buckets: [{ value: "在用", count: 5200 }, { value: "维修", count: 3000 }, { value: "库存", count: 1800 }] };
}

const currentUser = { id: 7, username: "admin", display_name: "管理员", email: "admin@example.test", is_staff: true, is_superuser: true, is_employed: true, left_at: null };
const collaborators = [{ user_id: 8, username: "reviewer", role: "editor", added_at: "2026-01-02T00:00:00Z", is_employed: true }];

function stripApiPrefix(path) {
  return path.replace(/^\/api\/v1/, "").replace(/\/$/, "");
}

function jsonResponse(status, body) {
  return { status, headers: [{ name: "content-type", value: "application/json; charset=utf-8" }], body };
}

function round(value) {
  return Math.round(value * 10) / 10;
}
