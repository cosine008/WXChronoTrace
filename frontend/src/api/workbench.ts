import { api } from "@/lib/api";

export type WorkbenchItemType = "data_card" | "note" | "material";
export type DataCardStatus = "draft" | "pending_confirm" | "confirmed" | "expired";
export type NoteStage =
  | "pre_schema"
  | "field_design"
  | "excel_import"
  | "validation"
  | "approval"
  | "stats_export"
  | "other";
export type NoteStatus = "normal" | "pending_confirm" | "confirmed";

export type DataCardCategory =
  | "organization"
  | "people"
  | "social_security"
  | "finance"
  | "policy"
  | "import_template"
  | "common_text"
  | "other";
export type DataCardFieldValueType =
  | "text"
  | "number"
  | "date"
  | "money"
  | "percent"
  | "boolean"
  | "url"
  | "longtext";
export type MaterialPreviewStatus = "none" | "image" | "text" | "failed";

export interface WorkbenchDataCardField {
  id: number;
  name: string;
  value: string;
  value_type: DataCardFieldValueType;
  unit: string;
  remark: string;
  sort_order: number;
}

export interface WorkbenchDataCardDetail {
  category: DataCardCategory;
  applicable_year: number | null;
  applicable_region: string;
  applicable_subject: string;
  effective_from: string | null;
  effective_to: string | null;
  status: DataCardStatus;
  remark: string;
  fields: WorkbenchDataCardField[];
}

export interface WorkbenchNoteDetail {
  markdown_content: string;
  stage: NoteStage;
  status: NoteStatus;
}

export interface WorkbenchNoteListDetail {
  stage: NoteStage;
  status: NoteStatus;
}

export interface WorkbenchMaterialDetail {
  original_name: string;
  content_type: string;
  size: number;
  checksum: string;
  description: string;
  preview_status: MaterialPreviewStatus;
  download_url: string;
  preview_url: string | null;
}

export type WorkbenchMissingDetail = Record<string, never>;

export interface WorkbenchLinkTargetSchema {
  id: number;
  name: string | null;
  accessible: boolean;
}

export interface WorkbenchLinkTargetItem {
  id: number;
  title: string | null;
  type: WorkbenchItemType | null;
  accessible: boolean;
}

export interface WorkbenchLinkSummary {
  id: number;
  target_item: WorkbenchLinkTargetItem | null;
  target_schema: WorkbenchLinkTargetSchema | null;
}

export interface WorkbenchItemBase {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  is_pinned: boolean;
  is_archived: boolean;
  is_sensitive: boolean;
  deleted_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  links: WorkbenchLinkSummary[];
}

export interface WorkbenchDataCardItem extends WorkbenchItemBase {
  type: "data_card";
  detail: WorkbenchDataCardDetail | WorkbenchMissingDetail;
}

export interface WorkbenchNoteItem extends WorkbenchItemBase {
  type: "note";
  detail: WorkbenchNoteDetail | WorkbenchMissingDetail;
}

export interface WorkbenchNoteListItem extends WorkbenchItemBase {
  type: "note";
  detail: WorkbenchNoteListDetail | WorkbenchMissingDetail;
}

export interface WorkbenchMaterialItem extends WorkbenchItemBase {
  type: "material";
  detail: WorkbenchMaterialDetail | WorkbenchMissingDetail;
}

export type WorkbenchItem =
  | WorkbenchDataCardItem
  | WorkbenchNoteItem
  | WorkbenchMaterialItem;

export interface WorkbenchListResponse {
  count: number;
  results: WorkbenchItem[];
}

export interface WorkbenchTypedListResponse<T extends WorkbenchItemBase> {
  count: number;
  results: T[];
}

export interface WorkbenchOverviewResponse {
  metrics: {
    data_card_count: number;
    note_count: number;
    material_count: number;
    storage_used_bytes: number;
  };
  note_summary: {
    total_count: number;
    pending_confirm_count: number;
    homepage_count: number;
  };
  pinned: WorkbenchItem[];
  recent_notes: WorkbenchNoteItem[];
  recent_materials: WorkbenchMaterialItem[];
}

export interface SchemaWorkbenchResponse {
  count: number;
  results: WorkbenchItem[];
}

export type MaterialChecklistStatus =
  | "missing"
  | "uploaded"
  | "pending_confirm"
  | "not_applicable";

export interface MaterialChecklistLinkedMaterial {
  id: number;
  title: string;
  type: "material";
}

export interface MaterialChecklistItem {
  id: number;
  title: string;
  status: MaterialChecklistStatus;
  linked_material: number | null;
  linked_material_item: MaterialChecklistLinkedMaterial | null;
  note: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MaterialChecklistResponse {
  count: number;
  results: MaterialChecklistItem[];
}

export interface QuickCreateSchemaNotePayload {
  content: string;
}

export interface MaterialChecklistPayload {
  title: string;
  status?: MaterialChecklistStatus;
  linked_material?: number | null;
  note?: string;
  sort_order?: number;
}

export interface WorkbenchDataCardFieldPayload {
  name: string;
  value?: string;
  value_type?: DataCardFieldValueType;
  unit?: string;
  remark?: string;
  sort_order?: number;
}

export interface CreateDataCardPayload {
  title: string;
  summary?: string;
  tags?: string[];
  is_pinned?: boolean;
  is_sensitive?: boolean;
  category?: DataCardCategory;
  applicable_year?: number | null;
  applicable_region?: string;
  applicable_subject?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  status?: DataCardStatus;
  remark?: string;
  fields?: WorkbenchDataCardFieldPayload[];
}

export type UpdateDataCardPayload = Partial<CreateDataCardPayload>;

export interface CopyDataCardTextResponse {
  text: string;
}

export interface CreateNotePayload {
  title: string;
  summary?: string;
  tags: string[];
  is_pinned?: boolean;
  is_sensitive?: boolean;
  markdown_content?: string;
  stage: NoteStage;
  status: NoteStatus;
}

export type UpdateNotePayload = Partial<CreateNotePayload>;

export type QuickCaptureNotePayload =
  | {
      markdown_content: string;
      content?: string;
      target_schema_id?: number | null;
    }
  | {
      content: string;
      markdown_content?: string;
      target_schema_id?: number | null;
    };

export interface QuickCaptureNoteResponse {
  item: WorkbenchNoteItem;
  warning: string | null;
}

export interface UpdateMaterialPayload {
  title?: string;
  summary?: string;
  tags?: string[];
  is_pinned?: boolean;
  is_sensitive?: boolean;
  description?: string;
}

export type CreateWorkbenchLinkPayload =
  | {
      source_item_id: number;
      target_item_id: number;
      target_schema_id?: never;
    }
  | {
      source_item_id: number;
      target_schema_id: number;
      target_item_id?: never;
    };

export interface CreateWorkbenchLinkResponse {
  id: number;
  source_item_id: number;
  target_item_id: number | null;
  target_schema_id: number | null;
  created: boolean;
}

export interface AdminWorkbenchUserRow {
  user_id: number;
  username: string;
  data_card_count: number;
  note_count: number;
  material_count: number;
  storage_used_bytes: number;
  upload_disabled: boolean;
}

export interface AdminWorkbenchUsersResponse {
  count: number;
  results: AdminWorkbenchUserRow[];
}

export async function getWorkbenchOverview() {
  const { data } = await api.get<WorkbenchOverviewResponse>("/workbench/overview/");
  return data;
}

export async function getSchemaWorkbench(schemaId: number) {
  const { data } = await api.get<SchemaWorkbenchResponse>(`/schemas/${schemaId}/workbench/`);
  return data;
}

export async function listWorkbenchItems(params?: { type?: WorkbenchItemType }) {
  const { data } = await api.get<WorkbenchListResponse>("/workbench/items/", {
    params: compactParams(params ?? {}),
  });
  return data;
}

export async function searchWorkbench(params: {
  q?: string;
  type?: WorkbenchItemType;
  tag?: string;
}) {
  const { data } = await api.get<WorkbenchListResponse>("/workbench/search/", {
    params: compactParams(params),
  });
  return data;
}

export async function deleteWorkbenchItem(id: number | string) {
  const { data } = await api.delete<WorkbenchItem>(`/workbench/items/${id}/`);
  return data;
}

export async function restoreWorkbenchItem(id: number | string) {
  const { data } = await api.post<WorkbenchItem>(`/workbench/trash/${id}/restore/`);
  return data;
}

export async function purgeWorkbenchItem(id: number | string) {
  await api.delete(`/workbench/trash/${id}/purge/`);
}

export async function createDataCard(payload: CreateDataCardPayload) {
  const { data } = await api.post<WorkbenchDataCardItem>("/workbench/data-cards/", payload);
  return data;
}

export async function listDataCards() {
  const { data } = await api.get<WorkbenchTypedListResponse<WorkbenchDataCardItem>>(
    "/workbench/data-cards/"
  );
  return data;
}

export async function getDataCard(id: number | string) {
  const { data } = await api.get<WorkbenchDataCardItem>(`/workbench/data-cards/${id}/`);
  return data;
}

export async function updateDataCard(id: number | string, payload: UpdateDataCardPayload) {
  const { data } = await api.patch<WorkbenchDataCardItem>(`/workbench/data-cards/${id}/`, payload);
  return data;
}

export async function copyDataCardText(id: number | string) {
  const { data } = await api.post<CopyDataCardTextResponse>(`/workbench/data-cards/${id}/copy-text/`);
  return data;
}

export async function createNote(payload: CreateNotePayload) {
  const { data } = await api.post<WorkbenchNoteItem>("/workbench/notes/", payload);
  return data;
}

export async function listNotes() {
  const { data } = await api.get<WorkbenchTypedListResponse<WorkbenchNoteListItem>>(
    "/workbench/notes/"
  );
  return data;
}

export async function getNote(id: number | string) {
  const { data } = await api.get<WorkbenchNoteItem>(`/workbench/notes/${id}/`);
  return data;
}

export async function updateNote(id: number | string, payload: UpdateNotePayload) {
  const { data } = await api.patch<WorkbenchNoteItem>(`/workbench/notes/${id}/`, payload);
  return data;
}

export async function quickCaptureNote(payload: QuickCaptureNotePayload) {
  const { data } = await api.post<QuickCaptureNoteResponse>("/workbench/notes/quick-capture/", payload);
  return data;
}

export async function quickCreateSchemaNote(schemaId: number, payload: QuickCreateSchemaNotePayload) {
  const { data } = await api.post<QuickCaptureNoteResponse>(
    `/schemas/${schemaId}/workbench/quick-note/`,
    payload
  );
  return data;
}

export async function uploadMaterial(formData: FormData) {
  const { data } = await api.post<WorkbenchMaterialItem>("/workbench/materials/", formData);
  return data;
}

export async function listMaterials() {
  const { data } = await api.get<WorkbenchTypedListResponse<WorkbenchMaterialItem>>(
    "/workbench/materials/"
  );
  return data;
}

export async function getMaterial(id: number | string) {
  const { data } = await api.get<WorkbenchMaterialItem>(`/workbench/materials/${id}/`);
  return data;
}

export async function updateMaterial(id: number | string, payload: UpdateMaterialPayload) {
  const { data } = await api.patch<WorkbenchMaterialItem>(`/workbench/materials/${id}/`, payload);
  return data;
}

export async function downloadMaterial(id: number | string) {
  const { data } = await api.get<Blob>(`/workbench/materials/${id}/download/`, {
    responseType: "blob",
  });
  return data;
}

export async function listMaterialChecklist(schemaId: number) {
  const { data } = await api.get<MaterialChecklistResponse>(
    `/schemas/${schemaId}/workbench/material-checklist/`
  );
  return data;
}

export async function createMaterialChecklistItem(schemaId: number, payload: MaterialChecklistPayload) {
  const { data } = await api.post<MaterialChecklistItem>(
    `/schemas/${schemaId}/workbench/material-checklist/`,
    payload
  );
  return data;
}

export async function updateMaterialChecklistItem(
  schemaId: number,
  itemId: number,
  payload: Partial<MaterialChecklistPayload>
) {
  const { data } = await api.patch<MaterialChecklistItem>(
    `/schemas/${schemaId}/workbench/material-checklist/${itemId}/`,
    payload
  );
  return data;
}

export async function deleteMaterialChecklistItem(schemaId: number, itemId: number) {
  await api.delete(`/schemas/${schemaId}/workbench/material-checklist/${itemId}/`);
}

export async function createWorkbenchLink(payload: CreateWorkbenchLinkPayload) {
  const { data } = await api.post<CreateWorkbenchLinkResponse>("/workbench/links/", payload);
  return data;
}

export async function deleteWorkbenchLink(id: number | string) {
  await api.delete(`/workbench/links/${id}/`);
}

export async function listWorkbenchTrash() {
  const { data } = await api.get<WorkbenchListResponse>("/workbench/trash/");
  return data;
}

export async function listAdminWorkbenchUsers() {
  const { data } = await api.get<AdminWorkbenchUsersResponse>("/admin/workbench/users/");
  return data;
}

function compactParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
