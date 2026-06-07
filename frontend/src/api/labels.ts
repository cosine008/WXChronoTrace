import { api } from "@/lib/api";
import { normalizeLabelInput } from "@/features/labels/labelCode";
import type { LabelPrintConfig } from "@/api/schemas";

export type LabelStatus = "active" | "revoked" | "lost" | "replaced";
export type LabelScanOutcome =
  | "resolved"
  | "login_required"
  | "denied"
  | "revoked"
  | "replaced"
  | "not_found"
  | "invalid";
export type LabelScanSource =
  | "qr_url"
  | "barcode_input"
  | "scanner_console"
  | "mobile_camera"
  | "api";

export interface EntityLabel {
  id: number;
  label_code: string;
  entity_id: number;
  schema_id: number;
  status: LabelStatus;
  template_code: string;
  issued_at: string;
  issued_by_id: number;
  printed_at: string | null;
  printed_by_id: number | null;
  revoked_at: string | null;
  revoked_by_id: number | null;
  revoked_reason: string;
  replaced_by_id: number | null;
  last_scanned_at: string | null;
  scan_count: number;
}

export interface EntityLabelListResponse {
  count: number;
  results: EntityLabel[];
}

export interface LabelCreatePayload {
  template_code?: string;
  replace_existing_active?: boolean;
  reason?: string;
}

export interface LabelBulkCreatePayload {
  entity_ids: number[];
  template_code?: string;
  skip_existing_active?: boolean;
  create_missing?: boolean;
}

export interface LabelBulkCreateResponse {
  created: EntityLabel[];
  skipped: Array<{ entity_id: number; reason: string; label?: EntityLabel }>;
}

export interface LabelPrintPayload {
  format?: "svg";
  template_code?: string;
}

export interface LabelPreviewPayload extends LabelPrintPayload {
  label_print_config?: LabelPrintConfig;
}

export interface LabelSheetPrintPayload extends LabelPrintPayload {
  label_ids: number[];
}

export interface LabelReasonPayload {
  reason: string;
}

export interface LabelReplacePayload extends LabelReasonPayload {
  template_code?: string;
}

export interface LabelReplaceResponse {
  old_label: EntityLabel;
  new_label: EntityLabel;
}

export interface ScanEntity {
  id: number;
  schema_id: number;
  business_code: string;
  display_code: string;
}

export interface ScanRecord {
  record_id: number;
  data_payload: Record<string, unknown>;
  valid_from: string;
  valid_to: string | null;
  schema_version: number;
  change_set_id: number;
  recorded_by_id: number;
  recorded_at: string;
}

export interface ScanChangeSummary {
  record_id: number;
  change_set_id: number;
  change_summary: string;
  valid_from: string;
  valid_to: string | null;
  recorded_at: string;
}

export interface ScanAttachmentField {
  field_key: string;
  label: string;
  value: unknown;
}

export interface ScanCapabilities {
  can_manage_labels: boolean;
  can_start_change_set_draft: boolean;
}

export interface ScanResultBase {
  outcome: LabelScanOutcome;
  message?: string;
}

export interface ScanResolvedResult extends ScanResultBase {
  outcome: "resolved";
  label: EntityLabel;
  entity: ScanEntity;
  record: ScanRecord | null;
  recent_changes: ScanChangeSummary[];
  attachments: ScanAttachmentField[];
  capabilities: ScanCapabilities;
}

export interface ScanStatusResult extends ScanResultBase {
  outcome: Exclude<LabelScanOutcome, "resolved">;
  label?: EntityLabel;
  replacement?: EntityLabel | null;
}

export type LabelScanResult = ScanResolvedResult | ScanStatusResult;

export async function listEntityLabels(entityId: number | string) {
  const { data } = await api.get<EntityLabelListResponse>(`/entities/${entityId}/labels/`);
  return data;
}

export async function listSchemaActiveLabelSamples(schemaId: number | string) {
  const { data } = await api.get<EntityLabelListResponse>(
    `/schemas/${schemaId}/labels/active-samples/`
  );
  return data;
}

export async function createEntityLabel(entityId: number | string, payload: LabelCreatePayload) {
  const { data } = await api.post<EntityLabel>(`/entities/${entityId}/labels/`, payload);
  return data;
}

export async function bulkCreateLabels(schemaId: number | string, payload: LabelBulkCreatePayload) {
  const { data } = await api.post<LabelBulkCreateResponse>(
    `/schemas/${schemaId}/labels/bulk-create/`,
    payload
  );
  return data;
}

export async function scanLabel(labelCode: string, source: LabelScanSource = "api") {
  const target = safeNormalizeLabelInput(labelCode);
  const { data } = await api.get<LabelScanResult>(`/scan/${encodeURIComponent(target)}/`, {
    params: { source },
    validateStatus: (status) => status < 500,
  });
  return data;
}

export async function printLabel(labelId: number | string, payload: LabelPrintPayload = {}) {
  const { data } = await api.post<Blob>(`/labels/${labelId}/print/`, payload, {
    responseType: "blob",
  });
  return data;
}

export async function previewLabel(labelId: number | string, payload: LabelPreviewPayload = {}) {
  const { data } = await api.post<Blob>(`/labels/${labelId}/preview/`, payload, {
    responseType: "blob",
  });
  return data;
}

export async function printLabelSheet(schemaId: number | string, payload: LabelSheetPrintPayload) {
  const { data } = await api.post<Blob>(`/schemas/${schemaId}/labels/a4-print/`, payload, {
    responseType: "blob",
  });
  return data;
}

export async function previewLabelSheet(schemaId: number | string, payload: LabelSheetPrintPayload) {
  const { data } = await api.post<Blob>(`/schemas/${schemaId}/labels/a4-preview/`, payload, {
    responseType: "blob",
  });
  return data;
}

export async function revokeLabel(labelId: number | string, payload: LabelReasonPayload) {
  const { data } = await api.post<EntityLabel>(`/labels/${labelId}/revoke/`, payload);
  return data;
}

export async function replaceLabel(labelId: number | string, payload: LabelReplacePayload) {
  const { data } = await api.post<LabelReplaceResponse>(`/labels/${labelId}/replace/`, payload);
  return data;
}

function safeNormalizeLabelInput(labelCode: string) {
  try {
    return normalizeLabelInput(labelCode);
  } catch {
    return labelCode.trim() || "invalid";
  }
}
