import type { FieldType } from "@/api/schemas";
import type {
  ExcelIntakePayload,
  ExcelIntakeScanResponse,
  FieldDraft,
  SchemaDraft,
} from "@/api/excelIntake";
import {
  GENERATED_ENTITY_CODE_FIELD_KEY,
  IDENTITY_CODE_FIELD_KEY,
  PERSON_CODE_FIELD_KEY,
} from "@/lib/schemaFields";

export type IntakeStep = "upload" | "sheet" | "fields" | "strategy" | "preview";

export const INTAKE_STEPS: Array<{ id: IntakeStep; label: string }> = [
  { id: "upload", label: "上传" },
  { id: "sheet", label: "Sheet" },
  { id: "fields", label: "字段" },
  { id: "strategy", label: "策略" },
  { id: "preview", label: "预览" },
];

export const INTAKE_FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "短文本" },
  { value: "longtext", label: "长文本" },
  { value: "markdown", label: "Markdown" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "boolean", label: "布尔" },
  { value: "enum", label: "枚举" },
];

export interface IntakeStrategy {
  validFrom: string;
  missingPolicy: "keep" | "terminate";
  sourceTracking: boolean;
  summary: string;
}

export function initialStrategy(): IntakeStrategy {
  const today = todayInputValue();
  return {
    validFrom: today,
    missingPolicy: "keep",
    sourceTracking: true,
    summary: `Excel 接入草稿 ${today}`,
  };
}

export function todayInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export function buildIntakePayload(args: {
  scan: ExcelIntakeScanResponse;
  sheetName: string;
  headerRow: number;
  dataStartRow: number;
  schema: SchemaDraft;
  fields: FieldDraft[];
  strategy: IntakeStrategy;
}): ExcelIntakePayload {
  return {
    upload_token: args.scan.upload_token,
    sheet_name: args.sheetName,
    header_row: args.headerRow,
    data_start_row: args.dataStartRow,
    valid_from: args.strategy.validFrom,
    missing_policy: args.strategy.missingPolicy,
    source_tracking: args.strategy.sourceTracking,
    summary: args.strategy.summary,
    schema: {
      schema_code: args.schema.schema_code,
      name: args.schema.name,
      description: args.schema.description,
      icon: args.schema.icon,
      temporal_mode: args.schema.temporal_mode,
      period_unit: args.schema.temporal_mode === "periodic" ? args.schema.period_unit : null,
      identity_mode: args.schema.identity_mode,
      identity_field_key: args.schema.identity_field_key,
      identity_field_keys: args.schema.identity_field_keys,
      entity_code_config: args.schema.entity_code_config,
      visibility: args.schema.visibility,
      approval_required: args.schema.approval_required,
    },
    ...(args.fields.length > 0 ? { fields_config: args.fields } : {}),
  };
}

export function updateFieldType(field: FieldDraft, type: FieldType): FieldDraft {
  if (type === "enum" && !Array.isArray(field.validators?.options)) {
    return {
      ...field,
      type,
      validators: { options: uniqueSamples(field.samples) },
    };
  }
  if (field.type === "enum" && type !== "enum") {
    return { ...field, type, validators: {} };
  }
  return { ...field, type };
}

export function validImportedFields(fields: FieldDraft[]) {
  return fields.filter((field) => field.import);
}

export function validateReadyForPreview(
  scan: ExcelIntakeScanResponse | null,
  sheetName: string,
  schema: SchemaDraft | null,
  fields: FieldDraft[]
) {
  if (!scan) return "请先上传 Excel";
  if (!sheetName) return "请选择 Sheet";
  if (!schema?.name.trim()) return "表名不能为空";
  if (!schema.schema_code.trim()) return "schema_code 不能为空";
  if (schema.identity_mode === "composite") {
    const importedKeys = new Set(validImportedFields(fields).map((field) => field.key));
    const selectedKeys = schema.identity_field_keys.filter((key) => importedKeys.has(key));
    if (selectedKeys.length < 2) return "组合实体标识至少需要选择 2 个导入字段";
    return null;
  }
  if ([GENERATED_ENTITY_CODE_FIELD_KEY, PERSON_CODE_FIELD_KEY].includes(schema.identity_field_key)) {
    return null;
  }
  if (!validImportedFields(fields).some((field) => field.key === schema.identity_field_key)) {
    return "实体标识字段必须存在且参与导入";
  }
  return null;
}

export function nextCompositeIdentityKeys(schema: SchemaDraft, fieldKey: string) {
  const current = new Set(schema.identity_field_keys);
  if (current.has(fieldKey)) current.delete(fieldKey);
  else current.add(fieldKey);
  return Array.from(current);
}

export function identitySchemaPatch(schema: SchemaDraft, mode: SchemaDraft["identity_mode"]) {
  if (mode === "composite") {
    return {
      ...schema,
      identity_mode: "composite" as const,
      identity_field_key: IDENTITY_CODE_FIELD_KEY,
      identity_field_keys: schema.identity_field_keys,
    };
  }
  return {
    ...schema,
    identity_mode: "single" as const,
    identity_field_keys: [],
  };
}

export function stringifyCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function uniqueSamples(samples: string[]) {
  const values = Array.from(new Set(samples.map((item) => item.trim()).filter(Boolean)));
  return values.length > 0 ? values : ["选项1"];
}
