import type { SchemaListOrdering } from "@/api/schemas";

const STORAGE_VERSION = 1;

export type SchemaListSortField =
  | "last_modified_at"
  | "name"
  | "row_count"
  | "field_count"
  | "schema_code"
  | "created_at";

export interface SchemaListPreferences {
  version: typeof STORAGE_VERSION;
  sortField: SchemaListSortField;
  sortDesc: boolean;
}

export const SCHEMA_LIST_SORT_OPTIONS: Array<{
  value: SchemaListSortField;
  label: string;
}> = [
  { value: "last_modified_at", label: "最后修改" },
  { value: "name", label: "名称" },
  { value: "row_count", label: "数据量" },
  { value: "field_count", label: "字段数" },
  { value: "schema_code", label: "编码" },
  { value: "created_at", label: "创建时间" },
];

export function defaultSchemaListPreferences(): SchemaListPreferences {
  return {
    version: STORAGE_VERSION,
    sortField: "last_modified_at",
    sortDesc: true,
  };
}

export function defaultSortDesc(field: SchemaListSortField) {
  return field !== "name" && field !== "schema_code";
}

export function loadSchemaListPreferences(): SchemaListPreferences {
  const fallback = defaultSchemaListPreferences();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(preferenceKey());
    if (!raw) return fallback;
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function saveSchemaListPreferences(preferences: SchemaListPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(preferenceKey(), JSON.stringify(preferences));
  } catch {
    // localStorage can be unavailable in privacy modes; keep the in-memory state.
  }
}

export function toSchemaOrdering(preferences: SchemaListPreferences): SchemaListOrdering {
  return `${preferences.sortDesc ? "-" : ""}${preferences.sortField}` as SchemaListOrdering;
}

function normalizePreferences(value: unknown): SchemaListPreferences {
  const fallback = defaultSchemaListPreferences();
  if (!isRecord(value) || value.version !== STORAGE_VERSION) return fallback;
  const sortField = isSchemaListSortField(value.sortField) ? value.sortField : fallback.sortField;
  return {
    version: STORAGE_VERSION,
    sortField,
    sortDesc: typeof value.sortDesc === "boolean" ? value.sortDesc : defaultSortDesc(sortField),
  };
}

function isSchemaListSortField(value: unknown): value is SchemaListSortField {
  return (
    value === "last_modified_at" ||
    value === "name" ||
    value === "row_count" ||
    value === "field_count" ||
    value === "schema_code" ||
    value === "created_at"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preferenceKey() {
  return `chronotrace:dashboard-schema-list:v${STORAGE_VERSION}`;
}
