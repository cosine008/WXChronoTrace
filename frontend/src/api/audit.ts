import { api } from "@/lib/api";

export interface AuditLogEntry {
  id: number;
  actor_id: number;
  actor_username: string;
  action: string;
  target_type: string;
  target_id: number | null;
  target_schema_id: number | null;
  target_schema_name: string | null;
  detail: Record<string, unknown>;
  is_sensitive: boolean;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: AuditLogEntry[];
}

export interface AuditLogListParams {
  page?: number;
  page_size?: number;
  actor?: string;
  actor_id?: number | string;
  action?: string;
  target_type?: string;
  target_id?: number | string;
  is_sensitive?: boolean | string;
  created_after?: string;
  created_before?: string;
}

export type AuditExportFormat = "csv" | "xlsx";

export interface AuditLogExportParams extends AuditLogListParams {
  format: AuditExportFormat;
}

export async function listAuditLogs(params: AuditLogListParams) {
  const { data } = await api.get<AuditLogListResponse>("/audit-logs/", {
    params: compactParams(params),
  });
  return data;
}

export async function listSensitiveAuditLogs(params: AuditLogListParams) {
  const { data } = await api.get<AuditLogListResponse>("/audit-logs/sensitive", {
    params: compactParams(params),
  });
  return data;
}

export async function downloadSensitiveAuditLogs(params: AuditLogExportParams) {
  const { data } = await api.get<Blob>("/audit-logs/sensitive/export", {
    params: compactParams(params),
    responseType: "blob",
  });
  return data;
}

function compactParams(params: AuditLogListParams | AuditLogExportParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
