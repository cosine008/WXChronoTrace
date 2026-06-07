import { api } from "@/lib/api";
import type { SchemaVisibility } from "@/api/schemas";

interface UserSummary {
  id: number;
  username: string;
}

export interface AdminSchemaLedgerRow {
  id: number;
  schema_code: string;
  name: string;
  description: string;
  visibility: SchemaVisibility;
  approval_required: boolean;
  is_archived: boolean;
  owner: UserSummary;
  created_by: UserSummary;
  field_count: number;
  current_version: number;
  created_at: string;
  updated_at: string;
  pending_changeset_count: number;
  change_count: number;
  last_change_at: string | null;
}

export interface AdminSchemaLedgerResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: AdminSchemaLedgerRow[];
}

export interface AdminSchemaLedgerParams {
  page?: number;
  page_size?: number;
  owner?: string;
  visibility?: SchemaVisibility | "";
  archived?: "false" | "true" | "all";
  approval_required?: "false" | "true" | "";
  changed_after?: string;
  changed_before?: string;
}

export async function listAdminSchemas(params: AdminSchemaLedgerParams) {
  const { data } = await api.get<AdminSchemaLedgerResponse>("/admin/schemas", {
    params: compactParams(params),
  });
  return data;
}

function compactParams(params: AdminSchemaLedgerParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
