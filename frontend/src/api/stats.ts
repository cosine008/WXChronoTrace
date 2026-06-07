import { api } from "../lib/api.ts";
import type {
  CurrentRecordsParams,
  CurrentViewFilter,
  CurrentViewFilterOperator,
} from "./schemas";

export type TrendUnit = "day" | "week" | "month";
export type TrendUnitParam = TrendUnit | "auto";

export interface StatsSummary {
  schema_id: number;
  at: string;
  scope: StatsScope;
  metrics: {
    total: number;
    month_created: number;
    month_updated: number;
    month_terminated: number;
  };
  latest_change_at: string | null;
  latest_change_set_id: number | null;
}

export interface StatsTrend {
  schema_id: number;
  unit: TrendUnit;
  range: number;
  points: Array<{ at: string; count: number }>;
}

export interface StatsDistribution {
  schema_id: number;
  at: string;
  scope: StatsScope;
  field: { key: string; label: string; type: string };
  buckets: Array<{ value: string | number | boolean; count: number }>;
}

export type StatsFlowDimensionKind = "status" | "department" | "labels";
export type StatsFlowRawValue = string | number | boolean | null;
export type StatsFlowCountMode = "entities" | "label_assignments";

export interface StatsFlowScope {
  left_at: string;
  right_at: string;
  retro: boolean;
  search: string;
  ordering: string;
}

export interface StatsFlowDimension {
  kind: StatsFlowDimensionKind;
  key: string;
  label: string;
  type: string;
  multi_value: boolean;
  count_mode: StatsFlowCountMode;
}

export interface StatsFlowSummary {
  left_count: number;
  right_count: number;
  entity_count: number;
  changed_entity_count: number;
  entered_count: number;
  exited_count: number;
  unchanged_count: number;
  flow_count: number;
  top_flow: {
    from: string;
    to: string;
    value: number;
  } | null;
}

export interface StatsFlowNode {
  id: string;
  name: string;
  side: "left" | "right";
  value: StatsFlowRawValue;
  count: number;
}

export interface StatsFlowLink {
  source: string;
  target: string;
  value: number;
  from: string;
  to: string;
  changed: boolean;
  sample_entity_ids: number[];
  snapshot_diff_to: string | null;
}

export interface StatsFlowHeatPoint {
  at: string;
  count: number;
}

export interface StatsFlow {
  schema_id: number;
  dimension: StatsFlowDimension;
  scope: StatsFlowScope;
  summary: StatsFlowSummary;
  nodes: StatsFlowNode[];
  links: StatsFlowLink[];
  heat: StatsFlowHeatPoint[];
  snapshot_diff_to: string | null;
}

export interface StatsScope {
  at: string;
  retro: boolean;
  search: string;
  ordering: string;
  change_set: number | null;
  filters?: ExportSpecFilter[];
}

export interface DashboardSummary {
  schema_count: number;
  owned_schema_count: number;
  shared_schema_count: number;
  public_schema_count: number;
  archived_schema_count: number;
  pending_approval_count: number;
  recent_change_count: number;
  active_user_count: number;
}

export type ExportFormat = "xlsx" | "csv";
export type ExportJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "expired"
  | "canceled";
export type ExportJobScope = "current_view";
export type ExportJobRiskFlag = "large_export" | "sensitive_fields" | (string & {});
export type ExportRowScopeMode =
  | "filtered_result"
  | "current_page"
  | "selected_entities"
  | "snapshot_all";
export type ExportColumnMode = "visible_columns" | "all_exportable" | "selected";
export type ExportFilterOperator = CurrentViewFilterOperator;
export type CurrentExportParams = CurrentRecordsParams & { format: ExportFormat };
export type StatsCurrentScopeParams = Pick<
  CurrentRecordsParams,
  "at" | "retro" | "search" | "ordering" | "change_set" | "filters"
>;
export type CurrentExportJobParams = Omit<StatsCurrentScopeParams, "at" | "change_set"> & {
  at: string;
  change_set?: number | string | null;
  format: ExportFormat;
  export_spec?: ExportSpec;
  risk_confirmed?: boolean;
};
export type StatsDistributionParams = StatsCurrentScopeParams & { field?: string };

export type ExportSpecFilter = CurrentViewFilter;

export interface ExportSpec {
  schema_id: number;
  schema_version: number;
  scope: ExportJobScope;
  format: ExportFormat;
  time: {
    at: string;
    retro: boolean;
  };
  row_scope: {
    mode: ExportRowScopeMode;
    selected_entity_ids: number[];
  };
  filters: ExportSpecFilter[];
  search: string;
  ordering: string;
  change_set: number | null;
  columns: {
    mode: ExportColumnMode;
    field_keys: string[];
  };
}

export interface ExportSummary {
  row_scope_mode: ExportRowScopeMode | (string & {});
  column_mode: ExportColumnMode | (string & {});
  column_count: number | null;
  filter_count: number;
  search_present: boolean;
  change_set: number | null;
}

export interface StatsFlowParams {
  left_at: string;
  right_at: string;
  dimension?: StatsFlowDimensionKind;
  retro?: boolean;
  search?: string;
  ordering?: string;
}
export type StatsTrendParams = Pick<CurrentRecordsParams, "at"> & {
  unit?: TrendUnitParam;
  range?: number;
};

export interface ExportJobSchemaRef {
  id: number;
  schema_code: string;
  name: string;
}

export interface ExportJobRiskSensitiveField {
  key: string;
  label: string;
}

export interface ExportJobRiskDetails {
  large_export_threshold?: number;
  sensitive_fields?: ExportJobRiskSensitiveField[];
  [key: string]: unknown;
}

export interface CurrentExportRiskConfirmation {
  detail: string;
  risk_confirmation_required: true;
  row_count_estimate: number | null;
  risk_flags: ExportJobRiskFlag[];
  risk_details: ExportJobRiskDetails;
}

export interface CurrentExportQuerySnapshot {
  schema_id: number;
  user_id: number;
  at: string;
  retro: boolean;
  search: string;
  ordering: string;
  change_set: number | null;
  schema_version: number;
  format: ExportFormat;
  export_spec?: ExportSpec;
  requested_at?: string;
}

export interface ExportJob {
  job_code: string;
  status: ExportJobStatus;
  export_scope: ExportJobScope;
  format: ExportFormat;
  schema: ExportJobSchemaRef;
  query_snapshot: CurrentExportQuerySnapshot;
  export_summary: ExportSummary;
  row_count_estimate: number | null;
  row_count_actual: number | null;
  risk_flags: ExportJobRiskFlag[];
  risk_confirmation_required: boolean;
  risk_details: ExportJobRiskDetails;
  filename: string | null;
  file_size_bytes: number;
  error_code: string | null;
  error_message: string | null;
  expires_at: string | null;
  download_url: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ExportJobListParams {
  status?: ExportJobStatus;
  schema_id?: number | string;
  format?: ExportFormat;
  include_expired?: boolean;
  page?: number;
}

export interface ExportJobListResponse {
  count: number;
  results: ExportJob[];
  next?: string | null;
  previous?: string | null;
  page?: number;
  page_size?: number;
  total_pages?: number;
}

export async function getStatsSummary(id: number | string, params: StatsCurrentScopeParams) {
  const { data } = await api.get<StatsSummary>(`/schemas/${id}/stats/summary`, {
    params: compactCurrentScopeParams(params),
  });
  return data;
}

export async function getStatsTrend(id: number | string, params: StatsTrendParams) {
  const { data } = await api.get<StatsTrend>(`/schemas/${id}/stats/trend`, {
    params: compactParams({ ...params, unit: params.unit ?? "auto" }),
  });
  return data;
}

export async function getStatsDistribution(id: number | string, params: StatsDistributionParams) {
  const { data } = await api.get<StatsDistribution>(`/schemas/${id}/stats/distribution`, {
    params: compactCurrentScopeParams(params),
  });
  return data;
}

export async function getStatsFlow(id: number | string, params: StatsFlowParams) {
  const requestParams = {
    left_at: params.left_at,
    right_at: params.right_at,
    dimension: normalizeStatsFlowDimension(params.dimension),
    retro: params.retro === undefined ? undefined : String(Boolean(params.retro)),
    search: params.search,
    ordering: params.ordering ?? "business_code",
  };
  const { data } = await api.get<StatsFlow>(`/schemas/${id}/stats/flow`, {
    params: compactParams(requestParams),
  });
  return data;
}

export async function createCurrentExportJob(
  id: number | string,
  params: CurrentExportJobParams
) {
  const { data } = await api.post<ExportJob>(
    `/schemas/${id}/export/current/jobs`,
    compactParams(params)
  );
  return data;
}

export async function downloadCurrentViewExport(id: number | string, params: CurrentExportParams) {
  const { data } = await api.get<Blob>(`/schemas/${id}/export/current`, {
    params: compactCurrentScopeParams(params),
    responseType: "blob",
  });
  return data;
}

export async function listExportJobs(params: ExportJobListParams = {}) {
  const { data } = await api.get<ExportJobListResponse>("/export/jobs", {
    params: compactParams(params),
  });
  return data;
}

export async function getExportJob(jobCode: string) {
  const { data } = await api.get<ExportJob>(`/export/jobs/${jobCode}`);
  return data;
}

export async function downloadExportJob(jobCode: string) {
  const { data } = await api.get<Blob>(`/export/jobs/${jobCode}/download`, {
    responseType: "blob",
  });
  return data;
}

export async function downloadChangeSetExport(changeSetId: number | string) {
  const { data } = await api.get<Blob>(`/changesets/${changeSetId}/export`, {
    responseType: "blob",
  });
  return data;
}

export async function downloadEntityExport(entityId: number | string) {
  const { data } = await api.get<Blob>(`/entities/${entityId}/export`, {
    responseType: "blob",
  });
  return data;
}

export async function getDashboardSummary() {
  const { data } = await api.get<DashboardSummary>("/dashboard/");
  return data;
}

export function normalizeStatsFlowDimension(
  value: StatsFlowDimensionKind | string | null | undefined
): StatsFlowDimensionKind {
  const normalized = value?.trim();
  return normalized === "status" || normalized === "department" || normalized === "labels"
    ? normalized
    : "status";
}

function compactParams(params: object) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}

function compactCurrentScopeParams<T extends CurrentRecordsParams>(params: T) {
  return compactParams({
    ...params,
    filters: serializeCurrentViewFilters(params.filters),
  });
}

function serializeCurrentViewFilters(filters: CurrentViewFilter[] | undefined) {
  return filters && filters.length > 0 ? JSON.stringify(filters) : undefined;
}
