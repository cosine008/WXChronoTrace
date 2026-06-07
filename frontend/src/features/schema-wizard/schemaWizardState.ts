import type {
  EntityCodeConfig,
  FieldConfig,
  FieldType,
  PeriodUnit,
  SchemaCreatePayload,
  SchemaVisibility,
  TemporalMode,
} from "@/api/schemas";
import {
  GENERATED_ENTITY_CODE_FIELD_KEY,
  defaultEntityCodeConfig,
  normalizeEntityCodeConfig,
  syncEntityCodeConfigForSchemaCode,
} from "@/lib/schemaFields";

export type WizardStep = "basic" | "temporal" | "fields" | "identity" | "visibility";

export interface WizardState {
  schemaCode: string;
  /** 用户是否手动改过 schemaCode；为 false 时随 name 自动同步。 */
  schemaCodeManual: boolean;
  name: string;
  description: string;
  icon: string;
  temporalMode: TemporalMode;
  periodUnit: PeriodUnit;
  fields: FieldConfig[];
  selectedFieldKey: string;
  identityFieldKey: string;
  entityCodeConfig: EntityCodeConfig;
  visibility: SchemaVisibility;
  approvalRequired: boolean;
}

export const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "basic", label: "基本信息" },
  { id: "temporal", label: "时态模式" },
  { id: "fields", label: "字段设计" },
  { id: "identity", label: "实体标识" },
  { id: "visibility", label: "可见性" },
];

export const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "短文本" },
  { value: "longtext", label: "长文本" },
  { value: "markdown", label: "Markdown" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "datetime", label: "日期时间" },
  { value: "boolean", label: "布尔" },
  { value: "enum", label: "单选枚举" },
  { value: "multi-enum", label: "多选枚举" },
  { value: "person", label: "人员" },
  { value: "reference", label: "引用" },
  { value: "auto-number", label: "自动编号" },
  { value: "attachment", label: "附件" },
  { value: "image", label: "图片" },
  { value: "formula", label: "公式" },
];

export function fieldTypeLabel(type: FieldType) {
  return FIELD_TYPES.find((item) => item.value === type)?.label ?? type;
}

export const DEFAULT_FIELD: FieldConfig = {
  key: "asset_no",
  label: "资产编号",
  type: "text",
  required: true,
  indexed: true,
  validators: { max_length: 32 },
};

export function generatedEntityCodeField(
  schemaCode: string,
  config?: Partial<EntityCodeConfig> | null
): FieldConfig {
  const normalizedConfig = normalizeEntityCodeConfig(schemaCode, config);
  return {
    key: GENERATED_ENTITY_CODE_FIELD_KEY,
    label: "实体编码",
    type: "auto-number",
    required: true,
    indexed: true,
    validators: { ...normalizedConfig },
  };
}

export const initialWizardState: WizardState = {
  schemaCode: "",
  schemaCodeManual: false,
  name: "",
  description: "",
  icon: "boxes",
  temporalMode: "continuous",
  periodUnit: "month",
  fields: [DEFAULT_FIELD],
  selectedFieldKey: DEFAULT_FIELD.key,
  identityFieldKey: DEFAULT_FIELD.key,
  entityCodeConfig: defaultEntityCodeConfig(""),
  visibility: "private",
  approvalRequired: false,
};

export function makeEmptyField(index: number): FieldConfig {
  return {
    key: `field_${index}`,
    label: `字段 ${index}`,
    type: "text",
    required: false,
    indexed: false,
    validators: {},
  };
}

export function defaultValidatorsForType(type: FieldType): Record<string, unknown> {
  if (type === "enum" || type === "multi-enum") return { options: ["选项一", "选项二"] };
  if (type === "image") {
    return { allowed_extensions: ["jpg", "jpeg", "png", "webp"], max_files: 5 };
  }
  if (type === "attachment") {
    return { allowed_extensions: ["pdf", "docx", "xlsx"], max_files: 3 };
  }
  if (type === "formula") return { expression: "", result_type: "text" };
  if (type === "markdown") return { max_length: 10000 };
  return {};
}

export function normalizeSchemaCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+/g, "_");
}

/** 表名变化时同步 schemaCode（仅当用户没手动改过）。 */
export function syncSchemaCodeFromName(state: WizardState, name: string): WizardState {
  if (state.schemaCodeManual) return { ...state, name };
  const schemaCode = normalizeSchemaCode(name);
  return {
    ...state,
    name,
    schemaCode,
    entityCodeConfig: syncEntityCodeConfigForSchemaCode(
      state.entityCodeConfig,
      state.schemaCode,
      schemaCode
    ),
  };
}

/** 用户在 schemaCode 输入框里编辑——切到手动模式；清空后回到自动模式。 */
export function setSchemaCodeManually(state: WizardState, raw: string): WizardState {
  const value = normalizeSchemaCode(raw);
  if (!value) {
    const schemaCode = normalizeSchemaCode(state.name);
    return {
      ...state,
      schemaCode,
      schemaCodeManual: false,
      entityCodeConfig: syncEntityCodeConfigForSchemaCode(
        state.entityCodeConfig,
        state.schemaCode,
        schemaCode
      ),
    };
  }
  return {
    ...state,
    schemaCode: value,
    schemaCodeManual: true,
    entityCodeConfig: syncEntityCodeConfigForSchemaCode(
      state.entityCodeConfig,
      state.schemaCode,
      value
    ),
  };
}

export function isFieldKeyValid(value: string) {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

export function buildPayload(state: WizardState): SchemaCreatePayload {
  return {
    schema_code: state.schemaCode,
    name: state.name.trim(),
    description: state.description.trim(),
    icon: state.icon.trim(),
    temporal_mode: state.temporalMode,
    period_unit: state.temporalMode === "periodic" ? state.periodUnit : null,
    identity_field_key: state.identityFieldKey,
    fields_config: fieldsForPayload(state),
    visibility: state.visibility,
    approval_required: state.approvalRequired,
  };
}

export function validateStep(step: WizardStep, state: WizardState): string | null {
  if (step === "basic") return validateBasic(state);
  if (step === "temporal") return null;
  if (step === "fields") return validateFields(state.fields);
  if (step === "identity") return validateIdentity(state);
  return null;
}

function validateBasic(state: WizardState) {
  if (!state.name.trim()) return "表名不能为空";
  if (!state.schemaCode) return "请填写表编码，或先输入表名自动生成";
  if (!isFieldKeyValid(state.schemaCode)) return "表编码必须是小写 snake_case";
  return null;
}

function validateFields(fields: FieldConfig[]) {
  if (fields.length === 0) return "至少需要 1 个字段";
  const keys = new Set<string>();
  for (const field of fields) {
    if (!isFieldKeyValid(field.key)) return `${field.label || field.key} 的字段编码不合法`;
    if (!field.label.trim()) return `${field.key} 的显示名不能为空`;
    if (keys.has(field.key)) return `字段编码 ${field.key} 重复`;
    keys.add(field.key);
  }
  return null;
}

function validateIdentity(state: WizardState) {
  if (state.identityFieldKey === GENERATED_ENTITY_CODE_FIELD_KEY) {
    const config = normalizeEntityCodeConfig(state.schemaCode, state.entityCodeConfig);
    if (config.padding < 0) return "实体编码数字位数不能小于 0";
    if (config.start_sequence < 1) return "实体编码起始序号必须大于 0";
    return null;
  }
  const exists = state.fields.some((field) => field.key === state.identityFieldKey);
  return exists ? null : "实体标识字段必须存在";
}

function fieldsForPayload(state: WizardState) {
  if (state.identityFieldKey !== GENERATED_ENTITY_CODE_FIELD_KEY) return state.fields;
  return [
    generatedEntityCodeField(state.schemaCode, state.entityCodeConfig),
    ...state.fields.filter((field) => field.key !== GENERATED_ENTITY_CODE_FIELD_KEY),
  ];
}
