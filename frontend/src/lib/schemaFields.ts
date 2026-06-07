import type { EntityCodeConfig, FieldConfig, IdentityMode, SequenceResetPeriod } from "@/api/schemas";

export const IDENTITY_CODE_FIELD_KEY = "__identity_code";
export const GENERATED_ENTITY_CODE_FIELD_KEY = "entity_code";
export const PERSON_CODE_FIELD_KEY = "person_code";
export const DEFAULT_ENTITY_CODE_PADDING = 6;
export const DEFAULT_ENTITY_CODE_START_SEQUENCE = 1;

export function isSystemHiddenField(field: FieldConfig) {
  return Boolean(field.hidden || field.system || field.key === IDENTITY_CODE_FIELD_KEY);
}

export function visibleUserFields(fields: FieldConfig[]) {
  return fields.filter((field) => !isSystemHiddenField(field));
}

export function defaultEntityCodePrefix(schemaCode: string) {
  const normalized = schemaCode.trim().toUpperCase();
  return `${normalized || "ENTITY"}-`;
}

export function defaultEntityCodeConfig(schemaCode: string): EntityCodeConfig {
  return {
    prefix: defaultEntityCodePrefix(schemaCode),
    padding: DEFAULT_ENTITY_CODE_PADDING,
    start_sequence: DEFAULT_ENTITY_CODE_START_SEQUENCE,
    sequence_reset_period: "none",
  };
}

export function normalizeEntityCodeConfig(
  schemaCode: string,
  config?: Partial<EntityCodeConfig> | null
): EntityCodeConfig {
  const defaults = defaultEntityCodeConfig(schemaCode);
  return {
    prefix: typeof config?.prefix === "string" ? config.prefix : defaults.prefix,
    padding: positiveOrZero(config?.padding, defaults.padding),
    start_sequence: positiveInt(config?.start_sequence, defaults.start_sequence),
    sequence_reset_period: resetPeriod(config?.sequence_reset_period, defaults.sequence_reset_period),
  };
}

export function syncEntityCodeConfigForSchemaCode(
  config: EntityCodeConfig,
  previousSchemaCode: string,
  nextSchemaCode: string
): EntityCodeConfig {
  const previousPrefix = defaultEntityCodePrefix(previousSchemaCode);
  if (config.prefix && config.prefix !== previousPrefix) return config;
  return { ...config, prefix: defaultEntityCodePrefix(nextSchemaCode) };
}

export function formatEntityCodeSample(
  schemaCode: string,
  config?: Partial<EntityCodeConfig> | null,
  date = new Date()
) {
  const normalized = normalizeEntityCodeConfig(schemaCode, config);
  const period = entityCodePeriodToken(normalized.sequence_reset_period, date);
  const sequence = String(normalized.start_sequence).padStart(normalized.padding, "0");
  return `${normalized.prefix}${period ? `${period}-` : ""}${sequence}`;
}

export function buildIdentityCode(
  values: Record<string, unknown>,
  identityMode: IdentityMode,
  identityFieldKey: string,
  identityFieldKeys: string[]
) {
  if (identityMode === "composite") {
    const parts = identityFieldKeys.map((key) => stringifyValue(values[key]).trim());
    if (parts.some((part) => !part)) return "";
    return parts.map(escapeIdentityPart).join("|");
  }
  return stringifyValue(values[identityFieldKey]).trim();
}

export function identityFieldLabels(fields: FieldConfig[], fieldKeys: string[]) {
  const labels = Object.fromEntries(fields.map((field) => [field.key, field.label]));
  return fieldKeys.map((key) => labels[key] ?? key);
}

function escapeIdentityPart(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function positiveOrZero(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function positiveInt(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function resetPeriod(value: unknown, fallback: SequenceResetPeriod): SequenceResetPeriod {
  return value === "none" || value === "month" || value === "quarter" || value === "year"
    ? value
    : fallback;
}

function entityCodePeriodToken(period: SequenceResetPeriod, date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (period === "year") return String(year).padStart(4, "0");
  if (period === "month") return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  if (period === "quarter") return `${String(year).padStart(4, "0")}-Q${Math.floor((month - 1) / 3) + 1}`;
  return "";
}
