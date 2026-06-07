import {
  type StatsFlow,
  type StatsFlowDimensionKind,
  type StatsFlowLink,
} from "../../api/stats.ts";
import type { FieldConfig, SchemaRole } from "../../api/schemas.ts";

const FLOW_DIMENSION_ORDER: StatsFlowDimensionKind[] = ["status", "department", "labels"];
const FLOW_DIMENSION_SPECS: Record<
  StatsFlowDimensionKind,
  {
    fieldType: FieldConfig["type"];
    keyAliases: Set<string>;
    labelAliases: Set<string>;
  }
> = {
  status: {
    fieldType: "enum",
    keyAliases: new Set(["status", "state"]),
    labelAliases: new Set(["状态"]),
  },
  department: {
    fieldType: "enum",
    keyAliases: new Set(["department", "dept", "team", "org"]),
    labelAliases: new Set(["部门", "组织", "团队", "科室"]),
  },
  labels: {
    fieldType: "multi-enum",
    keyAliases: new Set(["label", "labels", "tag", "tags"]),
    labelAliases: new Set(["标签", "标记"]),
  },
};

export function normalizeFlowDimension(
  value: StatsFlowDimensionKind | string | null | undefined
): StatsFlowDimensionKind {
  return parseFlowDimension(value) ?? "status";
}

export function parseFlowDimension(
  value: StatsFlowDimensionKind | string | null | undefined
): StatsFlowDimensionKind | null {
  const normalized = value?.trim();
  return normalized === "status" || normalized === "department" || normalized === "labels"
    ? normalized
    : null;
}

export function availableFlowDimensions(
  fields: FieldConfig[],
  role?: SchemaRole | null
): StatsFlowDimensionKind[] {
  return FLOW_DIMENSION_ORDER.filter((dimension) =>
    fields.some((field) => fieldMatchesFlowDimension(field, dimension, role))
  );
}

export function defaultFlowDimensionForFields(
  fields: FieldConfig[],
  role?: SchemaRole | null
): StatsFlowDimensionKind | null {
  return availableFlowDimensions(fields, role)[0] ?? null;
}

export function flowDimensionIsAvailable(
  dimension: StatsFlowDimensionKind,
  fields: FieldConfig[],
  role?: SchemaRole | null
) {
  return availableFlowDimensions(fields, role).includes(dimension);
}

export function defaultFlowDates(leftAt?: string | null, rightAt?: string | null) {
  const normalizedRight = normalizeDateValue(rightAt) ?? todayInputValue();
  const normalizedLeft = normalizeDateValue(leftAt) ?? normalizedRight;
  return {
    left_at: normalizedLeft,
    right_at: normalizedRight,
  };
}

export function flowSnapshotDiffUrl(
  flow: Pick<StatsFlow, "snapshot_diff_to">,
  link?: Pick<StatsFlowLink, "snapshot_diff_to"> | null
) {
  return link?.snapshot_diff_to ?? flow.snapshot_diff_to ?? null;
}

export function topChangedLinks(links: StatsFlowLink[], limit = links.length) {
  if (limit <= 0) {
    return [];
  }
  return links
    .filter((link) => link.changed)
    .sort((left, right) => right.value - left.value || left.from.localeCompare(right.from))
    .slice(0, limit);
}

export function heatIntensity(count: number, max: number) {
  if (max <= 0 || count <= 0) {
    return 0;
  }
  const ratio = Math.min(count / max, 1);
  return Number(Math.max(ratio, 0.16).toFixed(2));
}

function normalizeDateValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function fieldMatchesFlowDimension(
  field: FieldConfig,
  dimension: StatsFlowDimensionKind,
  role?: SchemaRole | null
) {
  const spec = FLOW_DIMENSION_SPECS[dimension];
  return (
    field.type === spec.fieldType &&
    fieldIsFlowUsable(field, role) &&
    (spec.keyAliases.has(normalizeFlowKeyAlias(field.key)) ||
      spec.labelAliases.has(normalizeFlowLabelAlias(field.label)))
  );
}

function fieldIsFlowUsable(field: FieldConfig, role?: SchemaRole | null) {
  return (
    !field.deprecated &&
    !field.hidden &&
    !field.system &&
    field.key !== "__identity_code" &&
    canViewFieldValue(field, role)
  );
}

function canViewFieldValue(field: FieldConfig, role?: SchemaRole | null) {
  if (!field.sensitive) {
    return true;
  }
  const visibleRoles =
    field.masking?.visible_roles && field.masking.visible_roles.length > 0
      ? field.masking.visible_roles
      : ["admin", "owner"];
  return role !== null && role !== undefined && visibleRoles.includes(role);
}

function normalizeFlowKeyAlias(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeFlowLabelAlias(value: string) {
  return value.trim();
}
