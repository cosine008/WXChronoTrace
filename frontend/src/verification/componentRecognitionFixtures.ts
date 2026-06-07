import type { AuditLogEntry } from "@/api/audit";
import type { ChangeSetSummary, FieldConfig } from "@/api/schemas";
import type {
  WorkbenchDataCardItem,
  WorkbenchMaterialItem,
  WorkbenchNoteListItem,
} from "@/api/workbench";
import type { SchemaObjectModel } from "@/components/schema/SchemaObjectRow";
import { defaultEntityCodeConfig } from "@/lib/schemaFields";
import type { WizardState } from "@/features/schema-wizard/schemaWizardState";

const createdAt = "2026-05-26T09:18:00+08:00";
const updatedAt = "2026-05-26T10:26:00+08:00";

export const sampleFields: FieldConfig[] = [
  { key: "asset_no", label: "资产编号", type: "text", required: true, indexed: true },
  { key: "owner", label: "负责人", type: "person", indexed: true },
  { key: "purchase_date", label: "购置日期", type: "date", required: true },
  { key: "cost", label: "原值", type: "number", sensitive: true },
  { key: "status", label: "状态", type: "enum", validators: { options: ["在用", "维修", "报废"] } },
  { key: "attachments", label: "附件", type: "attachment", hidden: true },
  { key: "depreciation", label: "折旧公式", type: "formula", system: true },
];

export const schemaObjects: SchemaObjectModel[] = [
  {
    id: 18,
    name: "固定资产台账",
    schemaCode: "asset_register",
    icon: "boxes",
    temporalMode: "continuous",
    visibility: "shared",
    role: "owner",
    approvalRequired: true,
    fieldCount: sampleFields.length,
    currentVersion: 7,
    rowCount: 1284,
    owner: { username: "admin" },
    createdBy: { username: "admin" },
    fieldPreview: sampleFields,
    lastModifiedAt: updatedAt,
    lastChangeAt: "2026-05-25T17:48:00+08:00",
    pendingChangesetCount: 3,
    changeCount: 42,
  },
  {
    id: 23,
    name: "离职交接资料",
    schemaCode: "handover_pack",
    icon: "folder",
    temporalMode: "periodic",
    visibility: "private",
    role: "viewer",
    isArchived: true,
    fieldCount: 0,
    currentVersion: 2,
    rowCount: 0,
    owner: { username: "hr_ops" },
    createdBy: { username: "hr_ops" },
    fieldPreview: [],
    lastModifiedAt: "2026-05-20T16:12:00+08:00",
    pendingChangesetCount: 0,
    changeCount: 8,
  },
];

export const changesets: ChangeSetSummary[] = [
  changeSet(301, "5 月资产状态批量更新", "2026-01-16", 8, { create: 1, update: 7, terminate: 0 }),
  changeSet(302, "入库导入 3 批", "2026-03-08", 34, { create: 24, update: 9, terminate: 1 }),
  changeSet(303, "年度盘点终止项", "2026-04-18", 96, { create: 0, update: 62, terminate: 34 }),
  changeSet(304, "审批后回写", "2026-06-12", 16, { create: 4, update: 12, terminate: 0 }),
];

export const auditEntries: AuditLogEntry[] = [
  audit(1, "login", "user", 7, "admin", false, { ip: "127.0.0.1" }, "2026-05-26T08:58:00+08:00"),
  audit(2, "schema.update", "schema", 18, "admin", false, { field: "visibility", after: "shared" }),
  audit(3, "export.xlsx", "export_job", 501, "auditor", true, { rows: 12000, format: "xlsx" }),
  audit(4, "permission.grant", "schema", 18, "admin", true, { user: "finance", role: "editor" }),
];

export const dataCardItem: WorkbenchDataCardItem = {
  ...baseWorkbenchItem(11, "data_card", "社保缴费口径 2026", "用于导入校验和字段说明。"),
  is_pinned: true,
  tags: ["口径", "社保"],
  detail: {
    category: "social_security",
    applicable_year: 2026,
    applicable_region: "上海",
    applicable_subject: "员工社保",
    effective_from: "2026-01-01",
    effective_to: null,
    status: "confirmed",
    remark: "",
    fields: [
      fieldValue(1, "养老", "16", "percent"),
      fieldValue(2, "医疗", "9.5", "percent"),
    ],
  },
};

export const noteItem: WorkbenchNoteListItem = {
  ...baseWorkbenchItem(12, "note", "字段口径确认纪要", "记录字段设计中的审批边界与例外项。"),
  tags: ["字段设计", "待确认"],
  detail: { stage: "field_design", status: "pending_confirm" },
};

export const materialItem: WorkbenchMaterialItem = {
  ...baseWorkbenchItem(13, "material", "2026_import_template.xlsx", "导入模板与样例数据。"),
  is_sensitive: true,
  tags: ["导入", "模板"],
  detail: {
    original_name: "asset_register_import_template.xlsx",
    content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 246_128,
    checksum: "sha256:ct-visual-sample",
    description: "导入模板与字段说明。",
    preview_status: "failed",
    download_url: "#",
    preview_url: null,
  },
};

export const wizardState: WizardState = {
  schemaCode: "asset_register",
  schemaCodeManual: false,
  name: "固定资产台账",
  description: "追踪资产从采购、领用、维修到终止的完整时间状态。",
  icon: "boxes",
  temporalMode: "continuous",
  periodUnit: "month",
  fields: sampleFields.slice(0, 5),
  selectedFieldKey: "owner",
  identityFieldKey: "asset_no",
  entityCodeConfig: defaultEntityCodeConfig("asset_register"),
  visibility: "shared",
  approvalRequired: true,
};

function changeSet(
  id: number,
  summary: string,
  date: string,
  entryCount: number,
  actionCounts: ChangeSetSummary["action_counts"]
): ChangeSetSummary {
  return {
    id,
    schema_id: 18,
    summary,
    status: "applied",
    source: "manual",
    approval_required: true,
    approver_id: 1,
    approver_username: "admin",
    created_at: `${date}T09:00:00+08:00`,
    created_by_id: 1,
    created_by_username: "admin",
    applied_at: `${date}T11:20:00+08:00`,
    revert_of_id: null,
    entry_count: entryCount,
    action_counts: actionCounts,
  };
}

function audit(
  id: number,
  action: string,
  targetType: string,
  targetId: number,
  actor: string,
  sensitive: boolean,
  detail: Record<string, unknown>,
  time = updatedAt
): AuditLogEntry {
  return {
    id,
    actor_id: id,
    actor_username: actor,
    action,
    target_type: targetType,
    target_id: targetId,
    target_schema_id: targetType === "schema" ? 18 : null,
    target_schema_name: targetType === "schema" ? "固定资产台账" : null,
    detail,
    is_sensitive: sensitive,
    ip_address: "127.0.0.1",
    created_at: time,
  };
}

function baseWorkbenchItem<T extends "data_card" | "note" | "material">(
  id: number,
  type: T,
  title: string,
  summary: string
) {
  return {
    id,
    type,
    title,
    summary,
    tags: [],
    is_pinned: false,
    is_archived: false,
    is_sensitive: false,
    deleted_at: null,
    last_used_at: null,
    created_at: createdAt,
    updated_at: updatedAt,
    links: [{ id: id * 10, target_item: null, target_schema: { id: 18, name: "固定资产台账", accessible: true } }],
  };
}

function fieldValue(id: number, name: string, value: string, unit: string) {
  return { id, name, value, unit, value_type: "number" as const, remark: "", sort_order: id };
}
