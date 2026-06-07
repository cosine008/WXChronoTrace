import { api } from "@/lib/api";
import type {
  ChangeSetDetail,
  DataSchema,
  EntityCodeConfig,
  FieldConfig,
  IdentityMode,
  IdentityWarning,
  ImportPreviewRow,
  ImportPreviewSummary,
  PeriodUnit,
  SchemaVisibility,
  TemporalMode,
} from "@/api/schemas";

export interface SheetSummary {
  name: string;
  row_count: number;
  column_count: number;
  recommended_header_row: number;
  recommended_data_start_row: number;
  preview_rows: unknown[][];
}

export interface ExcelIntakeScanResponse {
  upload_token: string;
  expires_in_seconds: number;
  filename: string;
  sheets: SheetSummary[];
}

export type IdentityQualityLevel = "recommended" | "neutral" | "risk" | "discouraged";

export interface IdentityQuality {
  level: IdentityQualityLevel;
  label: string;
  score: number;
  reasons: string[];
}

export interface FieldDraft extends FieldConfig {
  source_column: string;
  source_index: number;
  import: boolean;
  identity_candidate: boolean;
  identity_quality?: IdentityQuality;
  empty_rate: number;
  unique_rate: number;
  samples: string[];
  warnings: string[];
}

export interface SchemaDraft {
  schema_code: string;
  name: string;
  description: string;
  icon: string;
  temporal_mode: TemporalMode;
  period_unit: PeriodUnit | null;
  identity_mode: IdentityMode;
  identity_field_key: string;
  identity_field_keys: string[];
  visibility: SchemaVisibility;
  approval_required: boolean;
  entity_code_config?: EntityCodeConfig;
  fields_config: FieldConfig[];
}

export interface ImportPlan {
  sheet_name: string;
  header_row: number;
  data_start_row: number;
  valid_from: string;
  missing_policy: "keep" | "terminate";
  source_tracking: boolean;
}

export interface IdentityDuplicateValue {
  value: string;
  count: number;
  row_numbers: number[];
}

export interface IdentityDiagnostics {
  mode: IdentityMode;
  status: "ok" | "error";
  identity_field_key: string;
  identity_field_keys?: string[];
  identity_field_labels?: string[];
  identity_field_label: string;
  message: string;
  duplicate_values: IdentityDuplicateValue[];
}

export interface ExcelIntakePreviewResponse {
  schema_draft: SchemaDraft;
  fields: FieldDraft[];
  import_plan: ImportPlan;
  summary: ImportPreviewSummary;
  identity_diagnostics: IdentityDiagnostics;
  identity_warnings: IdentityWarning[];
  rows: ImportPreviewRow[];
  errors: Array<{ path: string; code: string; message: string }>;
}

export interface ExcelIntakePayload {
  upload_token: string;
  sheet_name: string;
  header_row: number;
  data_start_row: number;
  valid_from: string;
  missing_policy: "keep" | "terminate";
  source_tracking: boolean;
  summary?: string;
  schema: Omit<SchemaDraft, "fields_config">;
  fields_config?: FieldDraft[];
}

export interface ExcelIntakeCommitResponse {
  schema: DataSchema;
  change_set: ChangeSetDetail;
  import_summary: ImportPreviewSummary;
  rows: ImportPreviewRow[];
}

export async function scanExcelIntake(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ExcelIntakeScanResponse>("/excel-intake/scan", formData);
  return data;
}

export async function previewExcelIntake(payload: ExcelIntakePayload) {
  const { data } = await api.post<ExcelIntakePreviewResponse>("/excel-intake/preview", payload);
  return data;
}

export async function commitExcelIntake(payload: ExcelIntakePayload) {
  const { data } = await api.post<ExcelIntakeCommitResponse>("/excel-intake/commit", payload);
  return data;
}
