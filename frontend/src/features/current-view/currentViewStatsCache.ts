import type { SchemaRole, FieldConfig } from "@/api/schemas";
import {
  normalizeStatsFlowDimension,
  type StatsCurrentScopeParams,
  type StatsFlowParams,
  type TrendUnitParam,
} from "@/api/stats";

export const STATS_STALE_TIME_MS = 60_000;
export const STATS_GC_TIME_MS = 10 * 60_000;

export const STATS_QUERY_CACHE_OPTIONS = {
  staleTime: STATS_STALE_TIME_MS,
  gcTime: STATS_GC_TIME_MS,
} as const;

export const statsQueryKeys = {
  summary(
    schemaId: number,
    userId: number | undefined,
    schemaVersion: number,
    scope: StatsCurrentScopeParams
  ) {
    return [
      "schema-stats-summary",
      schemaId,
      userCacheScope(userId),
      schemaVersion,
      normalizedStatsScope(scope),
    ] as const;
  },
  trend(
    schemaId: number,
    userId: number | undefined,
    schemaVersion: number,
    at: string,
    unit: TrendUnitParam
  ) {
    return [
      "schema-stats-trend",
      schemaId,
      userCacheScope(userId),
      schemaVersion,
      at,
      unit,
    ] as const;
  },
  distribution(
    schemaId: number,
    userId: number | undefined,
    schemaVersion: number,
    scope: StatsCurrentScopeParams,
    fieldKey: string | undefined
  ) {
    return [
      "schema-stats-distribution",
      schemaId,
      userCacheScope(userId),
      schemaVersion,
      normalizedStatsScope(scope),
      fieldKey ?? null,
    ] as const;
  },
  flow(
    schemaId: number,
    userId: number | undefined,
    schemaVersion: number,
    params: StatsFlowParams
  ) {
    return [
      "schema-stats-flow",
      schemaId,
      userCacheScope(userId),
      schemaVersion,
      normalizedFlowScope(params),
    ] as const;
  },
};

export function firstVisibleDistributableField(
  fields: FieldConfig[],
  role: SchemaRole | null | undefined
) {
  return fields.find((field) => isDistributable(field) && canViewFieldValue(field, role));
}

function normalizedStatsScope(scope: StatsCurrentScopeParams) {
  return {
    at: scope.at ?? "",
    retro: Boolean(scope.retro),
    search: scope.search ?? "",
    ordering: scope.ordering || "business_code",
    change_set: scope.change_set ?? null,
    filters: scope.filters ?? [],
  };
}

function normalizedFlowScope(scope: StatsFlowParams) {
  return {
    left_at: scope.left_at ?? "",
    right_at: scope.right_at ?? "",
    dimension: normalizeStatsFlowDimension(scope.dimension),
    retro: Boolean(scope.retro),
    search: scope.search ?? "",
    ordering: scope.ordering || "business_code",
  };
}

function userCacheScope(userId: number | undefined) {
  return userId ?? "anonymous";
}

function isDistributable(field: FieldConfig) {
  return !field.deprecated && ["enum", "multi-enum", "boolean"].includes(field.type);
}

function canViewFieldValue(field: FieldConfig, role: SchemaRole | null | undefined) {
  if (!field.sensitive) return true;
  const visibleRoles =
    field.masking?.visible_roles && field.masking.visible_roles.length > 0
      ? field.masking.visible_roles
      : ["admin", "owner"];
  return role !== null && role !== undefined && visibleRoles.includes(role);
}
