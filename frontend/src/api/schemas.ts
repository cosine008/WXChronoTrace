import { api } from "@/lib/api";

export type FieldType =
  | "text"
  | "longtext"
  | "markdown"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "enum"
  | "multi-enum"
  | "person"
  | "reference"
  | "auto-number"
  | "attachment"
  | "image"
  | "formula";

export type TemporalMode = "continuous" | "periodic";
export type PeriodUnit = "day" | "week" | "month" | "quarter" | "half_year" | "year";
export type SchemaVisibility = "private" | "shared" | "public";
export type SchemaRole = "admin" | "owner" | "editor" | "viewer";
export type FieldMaskMode = "full" | "partial" | "none";
export type IdentityMode = "single" | "composite";
export type SequenceResetPeriod = "none" | "month" | "quarter" | "year";
export type LabelTemplateCode = "asset_standard" | "small" | "document_cover";

export const LABEL_TEMPLATE_CODES: LabelTemplateCode[] = [
  "asset_standard",
  "small",
  "document_cover",
];

export const LABEL_TEMPLATE_LABELS: Record<LabelTemplateCode, string> = {
  asset_standard: "固定资产",
  small: "小标签",
  document_cover: "档案封面",
};

export interface LabelTemplateSettings {
  code?: LabelTemplateCode;
  enabled: boolean;
  label: string;
  field_keys: string[];
  show_display_code: boolean;
  show_label_code: boolean;
  show_qr: boolean;
  show_barcode: boolean;
  show_scan_url: boolean;
  show_brand: boolean;
  show_hint: boolean;
}

export interface LabelPrintConfig {
  default_template_code: LabelTemplateCode;
  templates: Partial<Record<LabelTemplateCode, LabelTemplateSettings>>;
}

export interface EntityCodeConfig {
  prefix: string;
  padding: number;
  start_sequence: number;
  sequence_reset_period: SequenceResetPeriod;
}

export interface FieldMaskingConfig {
  mode?: FieldMaskMode;
  visible_roles?: SchemaRole[];
}

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  indexed?: boolean;
  deprecated?: boolean;
  sensitive?: boolean;
  hidden?: boolean;
  system?: boolean;
  identity_mode?: IdentityMode;
  identity_field_keys?: string[];
  masking?: FieldMaskingConfig;
  validators?: Record<string, unknown>;
  introduced_in_version?: number;
}

export interface DataSchema {
  id: number;
  schema_code: string;
  name: string;
  description: string;
  icon: string;
  temporal_mode: TemporalMode;
  period_unit: PeriodUnit | null;
  identity_mode: IdentityMode;
  identity_field_key: string;
  identity_field_keys: string[];
  identity_display_template: string;
  fields_config: FieldConfig[];
  label_print_config: Partial<LabelPrintConfig> | Record<string, never>;
  field_count: number;
  current_version: number;
  config_migrated_at: string;
  row_count: number;
  last_data_change_at: string | null;
  last_modified_at: string;
  visibility: SchemaVisibility;
  approval_required: boolean;
  created_at: string;
  is_archived: boolean;
  role: SchemaRole | null;
  owner: {
    id: number;
    username: string;
  };
}

export interface SchemaCreatePayload {
  schema_code: string;
  name: string;
  description: string;
  icon: string;
  temporal_mode: TemporalMode;
  period_unit: PeriodUnit | null;
  identity_mode?: IdentityMode;
  identity_field_key: string;
  identity_field_keys?: string[];
  fields_config: FieldConfig[];
  visibility: SchemaVisibility;
  approval_required: boolean;
}

export type SchemaUpdatePayload = Partial<
  Pick<DataSchema, "name" | "description" | "icon" | "visibility" | "approval_required">
>;

export type SchemaListOrdering =
  | "created_at"
  | "-created_at"
  | "field_count"
  | "-field_count"
  | "last_data_change_at"
  | "-last_data_change_at"
  | "last_modified_at"
  | "-last_modified_at"
  | "name"
  | "-name"
  | "row_count"
  | "-row_count"
  | "schema_code"
  | "-schema_code";

export interface ListSchemasParams {
  includeArchived?: boolean;
  ordering?: SchemaListOrdering;
}

export interface IdentityDisplayTemplatePayload {
  identity_display_template: string;
}

export interface LabelPrintConfigPayload {
  label_print_config: LabelPrintConfig;
}

export interface SchemaIconUploadResponse {
  url: string;
  name: string;
  content_type: string;
  size: number;
}

export type FieldPatchPayload = Partial<
  Pick<
    FieldConfig,
    "label" | "required" | "indexed" | "validators" | "deprecated" | "sensitive" | "masking"
  >
>;

export interface Collaborator {
  user_id: number;
  username: string;
  role: "editor" | "viewer";
  added_at: string;
  is_employed: boolean;
}

export interface CurrentViewRecord {
  record_id: number;
  entity_id: number;
  business_code: string;
  display_code: string;
  data_payload: Record<string, unknown>;
  row_status: "new" | "modified" | "terminated" | "unchanged";
  changed_fields: string[];
  valid_from: string;
  valid_to: string | null;
  schema_version: number;
  change_set_id: number;
  recorded_by_id: number;
  recorded_at: string;
}

export interface CurrentViewResponse {
  schema: DataSchema;
  schema_id: number;
  at: string;
  retro: boolean;
  schema_version: number;
  fields_config: FieldConfig[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: CurrentViewRecord[];
}

export type CurrentViewFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "between"
  | "in"
  | "not_in";

export interface CurrentViewFilter {
  field: string;
  operator: CurrentViewFilterOperator;
  value?: unknown;
}

export interface CurrentRecordsParams {
  at?: string;
  retro?: boolean;
  search?: string;
  ordering?: string;
  change_set?: number | string;
  filters?: CurrentViewFilter[];
  page?: number;
  page_size?: number;
}

export interface CurrentRecordLocateParams extends CurrentRecordsParams {
  entity_id: number;
}

export interface CurrentRecordLocateResponse {
  schema_id: number;
  at: string;
  retro: boolean;
  entity_id: number;
  ordering: string;
  page_size: number;
  supported: boolean;
  found?: boolean;
  reason?: string;
  record_id?: number;
  page?: number;
  offset?: number;
  position?: number;
  count?: number;
}

export type ChangeSetStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "applied"
  | "reverted";

export type ChangeAction = "create" | "update" | "terminate";

export interface ChangeSetSummary {
  id: number;
  schema_id: number;
  summary: string;
  status: ChangeSetStatus;
  source: "manual" | "excel" | "api" | "revert";
  approval_required: boolean;
  approver_id: number | null;
  approver_username: string | null;
  created_at: string;
  created_by_id: number;
  created_by_username: string;
  applied_at: string | null;
  revert_of_id: number | null;
  entry_count: number;
  action_counts: Record<ChangeAction, number>;
}

export interface ChangeSetEntry {
  id: number;
  entity_id: number;
  business_code: string;
  display_code: string;
  action: ChangeAction;
  data_before: Record<string, unknown> | null;
  data_after: Record<string, unknown> | null;
  changed_fields: string[];
  valid_from: string;
  valid_to: string | null;
  new_record_id: number | null;
}

export interface ChangeSetDetail extends ChangeSetSummary {
  entries: ChangeSetEntry[];
}

export interface ChangeSetFieldAggregate {
  key: string;
  label: string;
  change_count: number;
  entity_count: number;
  action_counts: Record<ChangeAction, number>;
}

export interface ChangeSetEntriesPage {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: ChangeSetEntry[];
}

export interface ChangeSetDetailPaged extends ChangeSetSummary {
  field_aggregates: ChangeSetFieldAggregate[];
  entries_page: ChangeSetEntriesPage;
}

export interface ChangeSetDetailPageParams {
  entries_page?: number;
  entries_page_size?: number;
}

export interface ChangeSetCompareActionRow {
  action: ChangeAction;
  left: number;
  right: number;
  delta: number;
}

export interface ChangeSetCompareFieldRow {
  key: string;
  label: string;
  left_changes: number;
  right_changes: number;
  left_entities: number;
  right_entities: number;
  delta: number;
}

export interface ChangeSetCompareEntityOverlap {
  left_entity_count: number;
  right_entity_count: number;
  shared_entity_count: number;
  left_only_entity_count: number;
  right_only_entity_count: number;
}

export interface ChangeSetCompareResponse {
  left: ChangeSetSummary;
  right: ChangeSetSummary;
  action_rows: ChangeSetCompareActionRow[];
  field_rows: ChangeSetCompareFieldRow[];
  entity_overlap: ChangeSetCompareEntityOverlap;
}

export type DiffMode = "changeset" | "snapshot";
export type DiffSide = "left" | "right";

export interface DiffEntityRef {
  id: number | null;
  business_code: string | null;
  display_code: string;
}

export interface DiffFieldRef {
  key: string;
  label: string;
}

export interface DiffTopField {
  key: string;
  label: string;
  count: number;
}

export interface DiffSummary {
  diff_count: number;
  affected_entity_count: number;
  top_fields: DiffTopField[];
  action_counts: Record<ChangeAction, number>;
}

export interface ChangeSetFieldDiffRow {
  id: string;
  side: DiffSide;
  entity: DiffEntityRef;
  field: DiffFieldRef;
  before: unknown;
  after: unknown;
  action: ChangeAction;
  entry_id: number;
  change_set_id: number;
  recorded_at: string;
  valid_from: string | null;
}

export interface ChangeSetFieldDiffResponse {
  diff_mode: "changeset";
  left: ChangeSetSummary;
  right: ChangeSetSummary;
  summary: DiffSummary;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: ChangeSetFieldDiffRow[];
}

export interface ChangeSetFieldDiffParams {
  left: number | string;
  right: number | string;
  page?: number;
  page_size?: number;
  group?: string;
}

export interface SnapshotDiffScope {
  left_at: string;
  right_at: string;
  retro: boolean;
  search: string;
  ordering: string;
  mode: "summary" | "entities" | "fields";
}

export interface SnapshotDiffRow {
  id: string;
  entity: DiffEntityRef;
  field: DiffFieldRef;
  before: unknown;
  after: unknown;
  action: ChangeAction;
  left_record_id: number | null;
  right_record_id: number | null;
  left_change_set_id: number | null;
  right_change_set_id: number | null;
  recorded_at: string | null;
}

export interface SnapshotDiffSummary extends DiffSummary {
  left_count: number;
  right_count: number;
}

export interface SnapshotDiffResponse {
  diff_mode: "snapshot";
  scope: SnapshotDiffScope;
  summary: SnapshotDiffSummary;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: SnapshotDiffRow[];
}

export interface SnapshotDiffParams {
  left_at: string;
  right_at: string;
  retro?: boolean;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
  mode?: "summary" | "entities" | "fields";
}

export interface CellEditResponse extends ChangeSetSummary {
  entry: ChangeSetEntry;
}

export interface DraftOverlayCell {
  key: string;
  entity_id: number;
  field_key: string;
  value: unknown;
  status: "draft";
  change_set_id: number;
  entry_id: number;
}

export interface DraftOverlayResponse {
  at: string;
  cells: DraftOverlayCell[];
  create_rows: CurrentViewRecord[];
  change_sets: ChangeSetSummary[];
}

export interface FieldFileAsset {
  id: number;
  schema_id: number;
  field_key: string;
  name: string;
  content_type: string;
  size: number;
  download_url: string;
  preview_url: string | null;
  preview_type?: FieldFilePreviewType | null;
  preview_status?: FieldFilePreviewStatus | null;
  extracted_at?: string | null;
  extraction_truncated?: boolean;
  created_at?: string | null;
  uploaded_by_id: number;
}

export type FieldFilePreviewStatus = "pending" | "ready" | "unsupported" | "failed";
export type FieldFilePreviewType = "text" | "none";

export interface FieldFilePreviewResponse {
  asset_id: number;
  filename: string;
  content_type: string;
  preview_type: FieldFilePreviewType;
  status: FieldFilePreviewStatus;
  text: string;
  truncated: boolean;
  extracted_at: string | null;
  download_url: string;
}

export interface ChangeSetListResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: ChangeSetSummary[];
}

export interface ChangeSetListParams {
  page?: number;
  page_size?: number;
  status?: ChangeSetStatus | "";
  created_by?: number | string;
  created_from?: string;
  created_to?: string;
}

export interface TimelineRecord {
  record_id: number;
  schema_version: number;
  data_payload: Record<string, unknown>;
  valid_from: string;
  valid_to: string | null;
  change_set_id: number;
  change_summary: string;
  recorded_by_id: number;
  recorded_at: string;
}

export interface EntityTimelineResponse {
  entity: {
    id: number;
    schema_id: number;
    business_code: string;
    display_code: string;
    created_at: string;
    created_by_id: number;
  };
  schema: DataSchema;
  records: TimelineRecord[];
}

export interface CellEditPayload {
  field_key: string;
  value: unknown;
  at: string;
}

export interface ChangeSetSubmitPayload {
  summary?: string;
  approver_id?: number;
}

export interface ChangeSetRejectPayload {
  reason?: string;
}

export interface ChangeSetCreatePayload {
  summary: string;
}

export interface ChangeSetEntryPayload {
  action: ChangeAction;
  entity_id?: number;
  valid_from: string;
  valid_to?: string | null;
  data_after?: Record<string, unknown>;
}

export interface ImportPreviewSummary {
  create: number;
  update: number;
  missing: number;
  invalid: number;
  unchanged: number;
}

export interface ImportPreviewRow {
  row_number?: number;
  business_code: string;
  display_code: string;
  action: ChangeAction | "invalid" | "unchanged" | "keep";
  entity_id?: number;
  valid_from: string;
  data_before?: Record<string, unknown>;
  data_after: Record<string, unknown> | null;
  changed_fields: string[];
  errors: Array<{ path: string; code: string; message: string }>;
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

export interface IdentityWarning {
  code: string;
  message: string;
}

export interface ImportPreviewResponse {
  schema_id: number;
  at: string;
  missing_policy: "keep" | "terminate";
  mappings: Array<{ source_column: string; field_key: string; matched: boolean }>;
  summary: ImportPreviewSummary;
  identity_diagnostics: IdentityDiagnostics;
  rows: ImportPreviewRow[];
  missing: ImportPreviewRow[];
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export async function listSchemas(params: ListSchemasParams | boolean = {}) {
  const normalized = typeof params === "boolean" ? { includeArchived: params } : params;
  const { data } = await api.get<PaginatedResponse<DataSchema> | DataSchema[]>(
    "/schemas/",
    {
      params: compactParams({
        include_archived: normalized.includeArchived ? true : undefined,
        ordering: normalized.ordering,
      }),
    }
  );
  return Array.isArray(data) ? data : data.results;
}

export async function createSchema(payload: SchemaCreatePayload) {
  const { data } = await api.post<DataSchema>("/schemas/", payload);
  return data;
}

export async function getSchema(id: number | string) {
  const { data } = await api.get<DataSchema>(`/schemas/${id}/`);
  return data;
}

export async function getCurrentRecords(id: number | string, params: CurrentRecordsParams) {
  const { data } = await api.get<CurrentViewResponse>(`/schemas/${id}/records/`, {
    params: compactCurrentRecordsParams(params),
  });
  return data;
}

export async function locateCurrentRecord(
  id: number | string,
  params: CurrentRecordLocateParams
) {
  const { data } = await api.get<CurrentRecordLocateResponse>(
    `/schemas/${id}/records/locate`,
    { params: compactCurrentRecordsParams(params) }
  );
  return data;
}

export async function getDraftOverlay(id: number | string, at: string) {
  const { data } = await api.get<DraftOverlayResponse>(`/schemas/${id}/draft-overlay`, {
    params: { at },
  });
  return data;
}

export async function createChangeSet(schemaId: number | string, payload: ChangeSetCreatePayload) {
  const { data } = await api.post<ChangeSetDetail>(`/schemas/${schemaId}/changesets/`, payload);
  return data;
}

export async function addChangeSetEntry(
  changeSetId: number | string,
  payload: ChangeSetEntryPayload
) {
  const { data } = await api.post<ChangeSetEntry>(`/changesets/${changeSetId}/entries/`, payload);
  return data;
}

export async function editRecordCell(
  schemaId: number | string,
  entityId: number | string,
  payload: CellEditPayload
){
  const { data } = await api.post<CellEditResponse>(
    `/schemas/${schemaId}/records/${entityId}/cell/`,
    payload
  );
  return data;
}

export async function deleteChangeSet(changeSetId: number | string) {
  await api.delete(`/changesets/${changeSetId}/`);
}

export async function deleteChangeSetEntry(
  changeSetId: number | string,
  entryId: number | string
) {
  await api.delete(`/changesets/${changeSetId}/entries/${entryId}/`);
}

export async function listSchemaChangesets(
  id: number | string,
  params: ChangeSetListParams | number = 1
) {
  const queryParams = typeof params === "number" ? { page: params } : compactParams(params);
  const { data } = await api.get<ChangeSetListResponse>(`/schemas/${id}/changesets/`, {
    params: queryParams,
  });
  return data;
}

export async function listPendingChangeSets(page = 1) {
  const { data } = await api.get<ChangeSetListResponse>("/changesets/pending/", {
    params: { page },
  });
  return data;
}

export async function getSchemaChangeset(id: number | string, changeSetId: number | string) {
  const { data } = await api.get<ChangeSetDetail>(`/schemas/${id}/changesets/${changeSetId}/`);
  return data;
}

export async function getSchemaChangesetPage(
  id: number | string,
  changeSetId: number | string,
  params: ChangeSetDetailPageParams
) {
  const { data } = await api.get<ChangeSetDetailPaged>(
    `/schemas/${id}/changesets/${changeSetId}/`,
    { params: compactParams(params) }
  );
  return data;
}

export async function compareSchemaChangesets(
  id: number | string,
  left: number | string,
  right: number | string
) {
  const { data } = await api.get<ChangeSetCompareResponse>(
    `/schemas/${id}/changesets/compare`,
    { params: { left, right } }
  );
  return data;
}

export async function getChangeSetFieldDiffs(
  id: number | string,
  params: ChangeSetFieldDiffParams
) {
  const { data } = await api.get<ChangeSetFieldDiffResponse>(
    `/schemas/${id}/changesets/compare/field-diffs`,
    { params: compactParams(params) }
  );
  return data;
}

export async function getSnapshotDiff(id: number | string, params: SnapshotDiffParams) {
  const { data } = await api.get<SnapshotDiffResponse>(`/schemas/${id}/snapshot-diff`, {
    params: compactParams(params),
  });
  return data;
}

export async function submitChangeSet(
  changeSetId: number | string,
  payload: ChangeSetSubmitPayload
) {
  const { data } = await api.post<ChangeSetDetail>(`/changesets/${changeSetId}/submit`, payload);
  return data;
}

export async function approveChangeSet(changeSetId: number | string) {
  const { data } = await api.post<ChangeSetDetail>(`/changesets/${changeSetId}/approve`);
  return data;
}

export async function rejectChangeSet(
  changeSetId: number | string,
  payload: ChangeSetRejectPayload
) {
  const { data } = await api.post<ChangeSetDetail>(`/changesets/${changeSetId}/reject`, payload);
  return data;
}

export async function revertChangeSet(changeSetId: number | string) {
  const { data } = await api.post<ChangeSetDetail>(`/changesets/${changeSetId}/revert`);
  return data;
}

export async function downloadImportTemplate(schemaId: number | string) {
  const { data } = await api.get<Blob>(`/schemas/${schemaId}/import/template`, {
    responseType: "blob",
  });
  return data;
}

export async function previewImport(schemaId: number | string, formData: FormData) {
  const { data } = await api.post<ImportPreviewResponse>(
    `/schemas/${schemaId}/import/preview`,
    formData
  );
  return data;
}

export async function commitImport(schemaId: number | string, formData: FormData) {
  const { data } = await api.post<ChangeSetDetail>(`/schemas/${schemaId}/import/commit`, formData);
  return data;
}

export async function getEntityTimeline(entityId: number | string) {
  const { data } = await api.get<EntityTimelineResponse>(`/entities/${entityId}/timeline/`);
  return data;
}

export async function updateSchema(id: number | string, payload: SchemaUpdatePayload) {
  const { data } = await api.patch<DataSchema>(`/schemas/${id}/`, payload);
  return data;
}

export async function updateIdentityDisplayTemplate(
  id: number | string,
  payload: IdentityDisplayTemplatePayload
) {
  const { data } = await api.patch<DataSchema>(
    `/schemas/${id}/identity-display-template`,
    payload
  );
  return data;
}

export async function updateLabelPrintConfig(
  id: number | string,
  payload: LabelPrintConfigPayload
) {
  const { data } = await api.patch<DataSchema>(`/schemas/${id}/label-print-config/`, payload);
  return data;
}

export async function uploadSchemaIcon(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<SchemaIconUploadResponse>("/schema-icons/", formData);
  return data;
}

export async function addSchemaField(id: number | string, field: FieldConfig) {
  const { data } = await api.post<FieldConfig>(`/schemas/${id}/fields/`, field);
  return data;
}

export async function updateSchemaField(
  id: number | string,
  fieldKey: string,
  payload: FieldPatchPayload
) {
  const { data } = await api.patch<FieldConfig>(`/schemas/${id}/fields/${fieldKey}/`, payload);
  return data;
}

export async function uploadFieldFile(
  id: number | string,
  fieldKey: string,
  file: File
) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<FieldFileAsset>(
    `/schemas/${id}/fields/${fieldKey}/files/`,
    formData
  );
  return data;
}

export async function getFieldFilePreview(assetId: number | string) {
  const { data } = await api.get<FieldFilePreviewResponse>(`/files/${assetId}/preview`);
  return data;
}

export async function archiveSchema(id: number | string) {
  const { data } = await api.post<DataSchema>(`/schemas/${id}/archive`);
  return data;
}

export async function handoverSchema(id: number | string, ownerId: number) {
  const { data } = await api.post<DataSchema>(`/schemas/${id}/handover`, { owner_id: ownerId });
  return data;
}

export async function listCollaborators(id: number | string) {
  const { data } = await api.get<Collaborator[]>(`/schemas/${id}/collaborators/`);
  return data;
}

export async function addCollaborator(
  id: number | string,
  payload: Pick<Collaborator, "user_id" | "role">
) {
  const { data } = await api.post<Collaborator>(`/schemas/${id}/collaborators/`, payload);
  return data;
}

export async function updateCollaborator(
  id: number | string,
  userId: number,
  role: Collaborator["role"]
) {
  const { data } = await api.patch<Collaborator>(`/schemas/${id}/collaborators/${userId}/`, {
    role,
  });
  return data;
}

export async function removeCollaborator(id: number | string, userId: number) {
  await api.delete(`/schemas/${id}/collaborators/${userId}/`);
}

function compactParams<T extends object>(params: T) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}

function compactCurrentRecordsParams(params: CurrentRecordsParams) {
  return compactParams({
    ...params,
    filters: serializeCurrentViewFilters(params.filters),
  });
}

function serializeCurrentViewFilters(filters: CurrentViewFilter[] | undefined) {
  return filters && filters.length > 0 ? JSON.stringify(filters) : undefined;
}

export function defaultLabelTemplateSettings(code: LabelTemplateCode): LabelTemplateSettings {
  return {
    code,
    enabled: true,
    label: LABEL_TEMPLATE_LABELS[code],
    field_keys: [],
    show_display_code: true,
    show_label_code: true,
    show_qr: true,
    show_barcode: true,
    show_scan_url: true,
    show_brand: true,
    show_hint: true,
  };
}

export function normalizeLabelPrintConfig(
  value: Partial<LabelPrintConfig> | Record<string, never> | null | undefined
): LabelPrintConfig {
  const rawTemplates = value && typeof value === "object" ? value.templates : undefined;
  const templates = Object.fromEntries(
    LABEL_TEMPLATE_CODES.map((code) => {
      const raw = rawTemplates?.[code];
      return [
        code,
        {
          ...defaultLabelTemplateSettings(code),
          ...(raw ?? {}),
          code,
          label: raw?.label || LABEL_TEMPLATE_LABELS[code],
          field_keys: Array.isArray(raw?.field_keys) ? raw.field_keys : [],
          enabled: raw?.enabled ?? true,
        },
      ];
    })
  ) as Record<LabelTemplateCode, LabelTemplateSettings>;
  const defaultTemplateCode = value?.default_template_code;
  const fallbackDefault =
    defaultTemplateCode && templates[defaultTemplateCode]?.enabled
      ? defaultTemplateCode
      : "asset_standard";
  if (!templates[fallbackDefault].enabled) templates[fallbackDefault].enabled = true;
  return {
    default_template_code: fallbackDefault,
    templates,
  };
}
