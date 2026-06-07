import type { ChangeAction, ChangeSetFieldDiffRow } from "@/api/schemas";

export type OutlineMode = "entity" | "field" | "action";

export interface OutlineItem {
  id: string;
  label: string;
  sublabel: string;
  count: number;
  rowIds: string[];
}

export interface HeatBucket {
  id: string;
  index: number;
  count: number;
  rowIds: string[];
}

const ACTION_LABELS: Record<ChangeAction, string> = {
  create: "新增",
  update: "修改",
  terminate: "终止",
};

export function buildOutlineItems(
  rows: ChangeSetFieldDiffRow[],
  mode: OutlineMode
): OutlineItem[] {
  const groups = new Map<string, OutlineItem>();
  rows.forEach((row) => {
    const key = outlineKey(row, mode);
    const current = groups.get(key) ?? {
      id: key,
      label: outlineLabel(row, mode),
      sublabel: outlineSublabel(row, mode),
      count: 0,
      rowIds: [],
    };
    current.count += 1;
    current.rowIds.push(row.id);
    groups.set(key, current);
  });
  return [...groups.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label)
  );
}

export function buildHeatBuckets(rows: ChangeSetFieldDiffRow[], bucketCount = 28): HeatBucket[] {
  const size = Math.max(1, Math.ceil(rows.length / bucketCount));
  return Array.from({ length: Math.min(bucketCount, Math.max(rows.length, 1)) }, (_, index) => {
    const slice = rows.slice(index * size, index * size + size);
    return {
      id: `bucket-${index}`,
      index,
      count: slice.length,
      rowIds: slice.map((row) => row.id),
    };
  }).filter((bucket) => bucket.count > 0);
}

export function rowActionLabel(action: ChangeAction) {
  return ACTION_LABELS[action];
}

export function entityDisplayLabel(row: ChangeSetFieldDiffRow) {
  return (
    nonEmptyText(row.entity.display_code) ||
    nonEmptyText(row.entity.business_code) ||
    (row.entity.id !== null ? `实体 #${row.entity.id}` : "") ||
    `row:${row.id}`
  );
}

export function entitySublabel(row: ChangeSetFieldDiffRow) {
  return (
    nonEmptyText(row.entity.business_code) ||
    nonEmptyText(row.entity.display_code) ||
    (row.entity.id !== null ? `#${row.entity.id}` : "") ||
    `row:${row.id}`
  );
}

function outlineKey(row: ChangeSetFieldDiffRow, mode: OutlineMode) {
  if (mode === "entity") {
    if (row.entity.id !== null) {
      return `entity:id:${row.entity.id}`;
    }
    const businessCode = nonEmptyText(row.entity.business_code);
    if (businessCode) {
      return `entity:business:${businessCode}`;
    }
    const displayCode = nonEmptyText(row.entity.display_code);
    if (displayCode) {
      return `entity:display:${displayCode}`;
    }
    return `entity:row:${row.id}`;
  }
  if (mode === "field") {
    return `field:${row.field.key}`;
  }
  return `action:${row.action}`;
}

function outlineLabel(row: ChangeSetFieldDiffRow, mode: OutlineMode) {
  if (mode === "entity") {
    return entityDisplayLabel(row);
  }
  if (mode === "field") {
    return row.field.label;
  }
  return ACTION_LABELS[row.action];
}

function outlineSublabel(row: ChangeSetFieldDiffRow, mode: OutlineMode) {
  if (mode === "entity") {
    return entitySublabel(row);
  }
  if (mode === "field") {
    return row.field.key;
  }
  return row.action;
}

function nonEmptyText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : "";
}
