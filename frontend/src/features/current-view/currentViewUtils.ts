import type { SortingState } from "@tanstack/react-table";

import type { FieldConfig } from "@/api/schemas";

export const FIELD_PREFIX = "field:";
const META_ORDERING_FIELDS = new Set([
  "business_code",
  "valid_from",
  "valid_to",
  "schema_version",
  "recorded_at",
]);

export function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function timePointKind(at: string) {
  const today = todayInputValue();
  if (at === today) return "now";
  return at < today ? "past" : "future";
}

export function toApiOrdering(sorting: SortingState) {
  const first = sorting[0];
  if (!first) return "business_code";
  const field = first.id.startsWith(FIELD_PREFIX) ? first.id.slice(FIELD_PREFIX.length) : first.id;
  return first.desc ? `-${field}` : field;
}

export function toCurrentViewOrdering(ordering: string) {
  if (ordering === "display_code") return "business_code";
  if (ordering === "-display_code") return "-business_code";
  return ordering;
}

export function fromApiOrdering(ordering: string): SortingState {
  const normalized = toCurrentViewOrdering(ordering).trim();
  if (!normalized) return [{ id: "business_code", desc: false }];
  const desc = normalized.startsWith("-");
  const field = desc ? normalized.slice(1) : normalized;
  if (!field) return [{ id: "business_code", desc: false }];
  return [
    {
      id: META_ORDERING_FIELDS.has(field) ? field : `${FIELD_PREFIX}${field}`,
      desc,
    },
  ];
}

export function stringifyCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyCellItem).join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stringifyCellItem(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object" || Array.isArray(value)) return String(value);
  if ("name" in value && typeof value.name === "string") return value.name;
  if ("display" in value && typeof value.display === "string") return value.display;
  if ("id" in value && typeof value.id === "number") return `#${value.id}`;
  if ("asset_id" in value && typeof value.asset_id === "number") return `#${value.asset_id}`;
  return JSON.stringify(value);
}

export function recordDisplayCode(record: { business_code: string; display_code?: string }) {
  return record.display_code || record.business_code;
}

export function coerceEditValue(field: FieldConfig, raw: string): unknown {
  if (raw === "") return "";
  if (field.type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  if (field.type === "boolean") {
    return ["true", "1", "是", "yes", "on"].includes(raw.trim().toLowerCase());
  }
  if (field.type === "multi-enum") {
    return raw
      .split(/[,\t、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return raw;
}

export function fieldByKey(fields: FieldConfig[]) {
  return Object.fromEntries(fields.map((field) => [field.key, field]));
}
