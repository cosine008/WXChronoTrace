import { api } from "@/lib/api";
import type {
  ExportFormat,
  ExportJobRiskDetails,
  ExportJobRiskFlag,
  ExportJobStatus,
} from "./stats";

export type AdminExportTab = "jobs" | "events";
export type AdminExportRisk = ExportJobRiskFlag;
export type AdminExportEventSource = "export_job" | "sync_export" | "unknown" | (string & {});

export interface AdminUserRef {
  id: number;
  username: string;
}

export interface AdminExportSchemaRef {
  id: number;
  schema_code: string;
  name: string;
}

export interface AdminExportAuditEventRef {
  id: number;
  action: string;
  actor_username?: string | null;
  created_at: string;
}

export interface AdminExportQuerySnapshot {
  [key: string]: unknown;
}

export interface AdminExportJobRow {
  job_code: string;
  status: ExportJobStatus;
  owner: AdminUserRef;
  schema: AdminExportSchemaRef;
  export_scope: string;
  format: ExportFormat;
  row_count_estimate: number | null;
  row_count_actual: number | null;
  risk_flags: AdminExportRisk[];
  risk_details: ExportJobRiskDetails;
  filename: string | null;
  file_size_bytes: number;
  has_file: boolean;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string | null;
}

export interface AdminExportJobDetail extends AdminExportJobRow {
  query_snapshot: AdminExportQuerySnapshot | null;
  audit_events: AdminExportAuditEventRef[];
}

export interface AdminExportJobSummary {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  expired: number;
  high_risk: number;
}

export interface AdminExportJobListResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: AdminExportJobSummary;
  results: AdminExportJobRow[];
}

export interface AdminExportJobParams {
  page?: number;
  page_size?: number;
  status?: ExportJobStatus;
  format?: ExportFormat;
  schema_id?: number | string;
  schema?: string;
  owner?: string;
  risk?: AdminExportRisk;
  created_after?: string;
  created_before?: string;
  finished_after?: string;
  finished_before?: string;
  expires_before?: string;
  has_file?: "true" | "false";
}

export interface AdminExportEventRow {
  id: number;
  actor: AdminUserRef | null;
  action: string;
  target_type: string;
  target_id: number | null;
  schema_code: string | null;
  schema_name: string | null;
  format: ExportFormat | string | null;
  row_count: number | null;
  job_code: string | null;
  risk_flags: AdminExportRisk[];
  file_size_bytes: number | null;
  created_at: string;
  source: AdminExportEventSource;
}

export interface AdminExportEventDetail extends AdminExportEventRow {
  query_snapshot: AdminExportQuerySnapshot | null;
  detail: Record<string, unknown> | null;
}

export interface AdminExportEventSummary {
  total: number;
  with_job: number;
  without_job: number;
  high_risk: number;
  large_export: number;
  sensitive_fields: number;
}

export interface AdminExportEventListResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: AdminExportEventSummary;
  results: AdminExportEventRow[];
}

export interface AdminExportEventParams {
  page?: number;
  page_size?: number;
  actor?: string;
  schema?: string;
  target_type?: string;
  format?: ExportFormat;
  risk?: AdminExportRisk;
  job_code?: string;
  min_rows?: number | string;
  source?: AdminExportEventSource;
  created_after?: string;
  created_before?: string;
}

export async function listAdminExportJobs(params: AdminExportJobParams = {}) {
  const { data } = await api.get<AdminExportJobListResponse>("/admin/export-jobs", {
    params: compactParams(params),
  });
  return data;
}

export async function getAdminExportJob(jobCode: string) {
  const { data } = await api.get<AdminExportJobDetail>(`/admin/export-jobs/${jobCode}`);
  return data;
}

export async function listAdminExportEvents(params: AdminExportEventParams = {}) {
  const { data } = await api.get<AdminExportEventListResponse>("/admin/export-events", {
    params: compactParams(params),
  });
  return data;
}

export async function getAdminExportEvent(auditLogId: number | string) {
  const { data } = await api.get<AdminExportEventDetail>(`/admin/export-events/${auditLogId}`);
  return data;
}

export function compactParams(params: object) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
