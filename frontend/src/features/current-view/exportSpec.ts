import type { FieldConfig, SchemaRole } from "@/api/schemas";
import type {
  CurrentExportJobParams,
  ExportColumnMode,
  ExportFormat,
  ExportRowScopeMode,
  ExportSpec,
  StatsCurrentScopeParams,
} from "@/api/stats";

export type CurrentViewExportRowScopeMode = Extract<
  ExportRowScopeMode,
  "filtered_result" | "current_page" | "selected_entities" | "snapshot_all"
>;

export type CurrentViewExportColumnMode = Extract<
  ExportColumnMode,
  "visible_columns" | "all_exportable"
>;

export const LARGE_EXPORT_WARNING_THRESHOLD = 5000;

export interface CurrentViewExportSpecInput {
  schemaId: number;
  schemaVersion: number;
  format: ExportFormat;
  scope: StatsCurrentScopeParams;
  rowScopeMode: CurrentViewExportRowScopeMode;
  columnMode: CurrentViewExportColumnMode;
  visibleFields: FieldConfig[];
  exportableFields: FieldConfig[];
  currentPageEntityIds: number[];
  selectedEntityIds: number[];
}

export interface ExportRiskSummaryInput {
  rowCount: number | undefined;
  fields: FieldConfig[];
  schemaRole: SchemaRole | null;
}

export function buildCurrentViewExportSpec(
  input: CurrentViewExportSpecInput
): ExportSpec {
  const exportFields = resolveExportFields(
    input.columnMode,
    input.visibleFields,
    input.exportableFields
  );
  const snapshotAll = input.rowScopeMode === "snapshot_all";
  const selectedEntityIds = rowScopeEntityIds(input);

  return {
    schema_id: input.schemaId,
    schema_version: input.schemaVersion,
    scope: "current_view",
    format: input.format,
    time: {
      at: input.scope.at || "",
      retro: Boolean(input.scope.retro),
    },
    row_scope: {
      mode: input.rowScopeMode,
      selected_entity_ids: selectedEntityIds,
    },
    filters: snapshotAll ? [] : input.scope.filters ?? [],
    search: snapshotAll ? "" : input.scope.search ?? "",
    ordering: input.scope.ordering || "business_code",
    change_set: snapshotAll ? null : normalizeChangeSet(input.scope.change_set),
    columns: {
      mode: input.columnMode,
      field_keys: exportFields.map((field) => field.key),
    },
  };
}

export function currentExportJobParamsFromSpec(
  spec: ExportSpec
): CurrentExportJobParams {
  return {
    at: spec.time.at,
    retro: spec.time.retro,
    search: spec.search,
    ordering: spec.ordering || "business_code",
    change_set: spec.change_set,
    filters: spec.filters,
    format: spec.format,
    export_spec: spec,
  };
}

export function resolveExportFields(
  mode: CurrentViewExportColumnMode,
  visibleFields: FieldConfig[],
  exportableFields: FieldConfig[]
) {
  return mode === "visible_columns" ? visibleFields : exportableFields;
}

export function formatExportFormat(format: ExportFormat) {
  return format === "xlsx" ? "Excel" : "CSV";
}

export function rowScopeLabel(mode: CurrentViewExportRowScopeMode) {
  if (mode === "current_page") return "当前页";
  if (mode === "selected_entities") return "选中行";
  if (mode === "snapshot_all") return "当前快照全量";
  return "当前筛选结果";
}

export function columnModeLabel(mode: CurrentViewExportColumnMode) {
  return mode === "all_exportable" ? "全部可见字段" : "当前显示列";
}

export function orderingLabel(ordering: string | undefined) {
  const value = ordering || "business_code";
  if (value === "business_code") return "实体编号升序";
  if (value === "-business_code") return "实体编号降序";
  if (value.startsWith("-")) return `${value.slice(1)} 降序`;
  return `${value} 升序`;
}

export function filterSummary(scope: StatsCurrentScopeParams) {
  const parts = [
    scope.search?.trim() ? `搜索：${scope.search.trim()}` : "无搜索词",
    scope.change_set ? `仅看批次 #${scope.change_set}` : "全部批次",
  ];
  if (scope.filters && scope.filters.length > 0) {
    parts.push(`结构化筛选：${scope.filters.length} 条`);
  }
  return parts;
}

export function buildExportRiskSummary(input: ExportRiskSummaryInput) {
  const risks: string[] = [];
  if (input.rowCount === undefined) {
    risks.push("预计行数待统计");
  } else if (input.rowCount > LARGE_EXPORT_WARNING_THRESHOLD) {
    risks.push(
      `预计 ${input.rowCount.toLocaleString()} 行，可能触发大批量确认`
    );
  }

  const sensitiveFields = input.fields.filter(
    (field) => field.sensitive && canViewFieldValue(field, input.schemaRole)
  );
  if (sensitiveFields.length > 0) {
    risks.push(
      `包含敏感字段：${sensitiveFields
        .slice(0, 4)
        .map((field) => field.label)
        .join("、")}${sensitiveFields.length > 4 ? ` 等 ${sensitiveFields.length} 个` : ""}`
    );
  }

  return risks.length > 0 ? risks : ["未发现明显风险"];
}

function normalizeChangeSet(value: StatsCurrentScopeParams["change_set"]) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canViewFieldValue(field: FieldConfig, role: SchemaRole | null) {
  if (!field.sensitive) return true;
  const visibleRoles =
    field.masking?.visible_roles && field.masking.visible_roles.length > 0
      ? field.masking.visible_roles
      : ["admin", "owner"];
  return role !== null && visibleRoles.includes(role);
}

function rowScopeEntityIds(input: CurrentViewExportSpecInput) {
  if (input.rowScopeMode === "current_page") return uniqueEntityIds(input.currentPageEntityIds);
  if (input.rowScopeMode === "selected_entities") return uniqueEntityIds(input.selectedEntityIds);
  return [];
}

function uniqueEntityIds(values: number[]) {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
