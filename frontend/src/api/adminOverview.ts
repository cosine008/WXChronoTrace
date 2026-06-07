import { api } from "@/lib/api";

export interface AdminOverview {
  users: {
    total: number;
    employed: number;
    left: number;
    superusers: number;
  };
  schemas: {
    active: number;
    public: number;
    archived: number;
    approval_required: number;
  };
  approvals: {
    pending: number;
    overdue: number;
    latest: AdminPendingApproval[];
  };
  sensitive_audit: {
    last_30_days: number;
    latest: AdminAuditEvent[];
  };
  exports: {
    large_last_30_days: number;
    recent_large: AdminLargeExport[];
  };
}

export interface AdminPendingApproval {
  id: number;
  schema_id: number;
  schema_name: string;
  summary: string;
  created_by_username: string;
  created_at: string;
}

export interface AdminAuditEvent {
  id: number;
  actor_username: string;
  action: string;
  target_type: string;
  target_id: number | null;
  target_schema_name: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AdminLargeExport {
  id: number;
  actor_username: string;
  target_type: string;
  target_id: number | null;
  row_count: number;
  format: string | null;
  schema_code: string | null;
  created_at: string;
}

export async function getAdminOverview() {
  const { data } = await api.get<AdminOverview>("/admin/overview");
  return data;
}
