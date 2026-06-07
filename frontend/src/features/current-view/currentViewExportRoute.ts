import type { CurrentViewFilter } from "@/api/schemas";
import type { ExportFormat } from "@/api/stats";

import { todayInputValue } from "./currentViewUtils";

const TRUE_QUERY_VALUES = new Set(["1", "true", "yes", "on"]);
const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface CurrentViewExportRouteShape {
  format: ExportFormat;
  at: string;
  retro: boolean;
  search: string;
  ordering: string;
  filters: CurrentViewFilter[];
  changeSetId?: number;
  page: number;
  pageSize?: number;
  currentPageEntityIds: number[];
  selectedEntityIds: number[];
  visibleFieldKeys?: string[];
  jobCode?: string;
}

export interface CurrentViewExportRouteState extends CurrentViewExportRouteShape {
  schemaId: number;
}

export type ParsedCurrentViewExportRouteState = CurrentViewExportRouteShape;

export function buildCurrentViewExportPath(input: CurrentViewExportRouteState): string {
  const query = buildExportRouteQuery(input);
  return buildPath(`/schemas/${input.schemaId}/records/export`, query);
}

export function parseCurrentViewExportSearch(
  searchParams: URLSearchParams
): ParsedCurrentViewExportRouteState {
  return {
    format: parseExportFormat(searchParams.get("format")),
    at: normalizeAtQueryValue(searchParams.get("at")),
    retro: parseBooleanQueryValue(searchParams.get("retro")),
    search: searchParams.get("search") ?? "",
    ordering: searchParams.get("ordering") || "business_code",
    filters: parseFiltersQueryValue(searchParams.get("filters")),
    changeSetId: parsePositiveInt(searchParams.get("change_set")),
    page: parsePositiveInt(searchParams.get("page")) ?? 1,
    pageSize: parsePositiveInt(searchParams.get("page_size")),
    currentPageEntityIds: parseEntityIdListParam(searchParams.get("current_page_entity_ids")),
    selectedEntityIds: parseEntityIdListParam(searchParams.get("selected_entity_ids")),
    visibleFieldKeys: parseStringListParam(searchParams.get("visible_field_keys")),
    jobCode: parseNonBlankString(searchParams.get("job")),
  };
}

export function buildCurrentViewRecordsReturnPath(
  input: ParsedCurrentViewExportRouteState & { schemaId: number }
): string {
  const query = new URLSearchParams();
  setQueryValue(query, "at", input.at);
  query.set("retro", String(Boolean(input.retro)));
  setQueryValue(query, "search", input.search);
  setQueryValue(query, "ordering", input.ordering);
  setQueryValue(query, "filters", serializeFiltersQueryValue(input.filters));
  setQueryValue(query, "change_set", serializePositiveInt(input.changeSetId));
  setQueryValue(query, "page", serializePositiveInt(input.page));
  setQueryValue(query, "page_size", serializePositiveInt(input.pageSize));
  return buildPath(`/schemas/${input.schemaId}/records`, query);
}

export function parseEntityIdListParam(value: string | null): number[] {
  if (!value) return [];
  return normalizeEntityIds(
    value
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((item) => Number.isInteger(item) && item > 0)
  );
}

export function serializeEntityIdListParam(values: number[]): string | undefined {
  const normalized = normalizeEntityIds(values);
  return normalized.length > 0 ? normalized.join(",") : undefined;
}

function buildExportRouteQuery(input: CurrentViewExportRouteShape) {
  const query = new URLSearchParams();
  query.set("format", input.format);
  setQueryValue(query, "at", input.at);
  query.set("retro", String(Boolean(input.retro)));
  setQueryValue(query, "search", input.search);
  setQueryValue(query, "ordering", input.ordering);
  setQueryValue(query, "filters", serializeFiltersQueryValue(input.filters));
  setQueryValue(query, "change_set", serializePositiveInt(input.changeSetId));
  setQueryValue(query, "page", serializePositiveInt(input.page));
  setQueryValue(query, "page_size", serializePositiveInt(input.pageSize));
  setQueryValue(
    query,
    "current_page_entity_ids",
    serializeEntityIdListParam(input.currentPageEntityIds)
  );
  setQueryValue(
    query,
    "selected_entity_ids",
    serializeEntityIdListParam(input.selectedEntityIds)
  );
  setQueryValue(query, "visible_field_keys", serializeStringListParam(input.visibleFieldKeys));
  setQueryValue(query, "job", input.jobCode);
  return query;
}

function buildPath(basePath: string, query: URLSearchParams) {
  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

function setQueryValue(query: URLSearchParams, key: string, value: string | undefined) {
  if (value === undefined || value === "") return;
  query.set(key, value);
}

function serializeFiltersQueryValue(filters: CurrentViewFilter[]) {
  return filters.length > 0 ? JSON.stringify(filters) : undefined;
}

function serializePositiveInt(value: number | undefined) {
  return value !== undefined && Number.isInteger(value) && value > 0 ? String(value) : undefined;
}

function parseExportFormat(value: string | null): ExportFormat {
  return value === "csv" ? "csv" : "xlsx";
}

function normalizeAtQueryValue(value: string | null) {
  if (!value || !YYYY_MM_DD_PATTERN.test(value)) return todayInputValue();
  const [year, month, day] = value.split("-").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return todayInputValue();
  }
  return value;
}

function parseBooleanQueryValue(value: string | null) {
  return value !== null && TRUE_QUERY_VALUES.has(value.trim().toLowerCase());
}

function parseFiltersQueryValue(value: string | null): CurrentViewFilter[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isCurrentViewFilter) : [];
  } catch {
    return [];
  }
}

function isCurrentViewFilter(value: unknown): value is CurrentViewFilter {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.field === "string" && typeof record.operator === "string";
}

function parsePositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonBlankString(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeEntityIds(values: number[]) {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function parseStringListParam(value: string | null) {
  if (value === null) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    return normalizeStringList(parsed);
  } catch {
    return normalizeStringList(value.split(","));
  }
}

function serializeStringListParam(values: string[] | undefined) {
  return values === undefined ? undefined : JSON.stringify(normalizeStringList(values));
}

function normalizeStringList(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
