import { api } from "@/lib/api";
import type { ChangeSetSummary } from "@/api/schemas";

export interface AdminPendingChangeSet extends ChangeSetSummary {
  schema_name: string;
  schema_code: string;
  age_days: number;
  overdue: boolean;
}

export interface AdminPendingChangeSetResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: AdminPendingChangeSet[];
}

export interface AdminPendingChangeSetParams {
  page?: number;
  page_size?: number;
  schema?: string;
  creator?: string;
  approver?: string;
  min_age_days?: string;
}

export async function listAdminPendingChangeSets(params: AdminPendingChangeSetParams) {
  const { data } = await api.get<AdminPendingChangeSetResponse>(
    "/admin/changesets/pending",
    { params: compactParams(params) }
  );
  return data;
}

function compactParams(params: AdminPendingChangeSetParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
