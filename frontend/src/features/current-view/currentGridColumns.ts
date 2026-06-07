import type { FieldConfig } from "@/api/schemas";
import { FIELD_PREFIX } from "./currentViewUtils";

export const GRID_COLUMN_MIN_WIDTH = 80;
export const GRID_COLUMN_MAX_WIDTH = 640;

export const GRID_META_COLUMNS = {
  selection: "row_select",
  entity: "business_code",
  validFrom: "valid_from",
  schemaVersion: "schema_version",
} as const;

export type GridColumnWidthMap = Record<string, number>;

export interface GridColumnSizing {
  id: string;
  width: number;
}

const DEFAULT_META_COLUMN_WIDTHS: GridColumnWidthMap = {
  [GRID_META_COLUMNS.selection]: 44,
  [GRID_META_COLUMNS.entity]: 144,
  [GRID_META_COLUMNS.validFrom]: 176,
  [GRID_META_COLUMNS.schemaVersion]: 80,
};

export function fieldColumnId(fieldKey: string) {
  return `${FIELD_PREFIX}${fieldKey}`;
}

export function defaultGridColumnWidth(field: FieldConfig) {
  if (field.type === "longtext" || field.type === "markdown") return 300;
  if (["attachment", "image"].includes(field.type)) return 240;
  if (["number", "date", "datetime", "boolean", "auto-number"].includes(field.type)) return 144;
  return 220;
}

export function defaultGridMetaColumnWidth(id: string) {
  return DEFAULT_META_COLUMN_WIDTHS[id] ?? 160;
}

export function clampGridColumnWidth(width: unknown, fallback = GRID_COLUMN_MIN_WIDTH) {
  const numericWidth = typeof width === "number" && Number.isFinite(width) ? width : fallback;
  return Math.min(GRID_COLUMN_MAX_WIDTH, Math.max(GRID_COLUMN_MIN_WIDTH, Math.round(numericWidth)));
}

export function buildGridColumnSizing(
  fields: FieldConfig[],
  columnWidths: GridColumnWidthMap
): GridColumnSizing[] {
  return [
    {
      id: GRID_META_COLUMNS.selection,
      width: defaultGridMetaColumnWidth(GRID_META_COLUMNS.selection),
    },
    {
      id: GRID_META_COLUMNS.entity,
      width: clampGridColumnWidth(
        columnWidths[GRID_META_COLUMNS.entity],
        defaultGridMetaColumnWidth(GRID_META_COLUMNS.entity)
      ),
    },
    {
      id: GRID_META_COLUMNS.validFrom,
      width: clampGridColumnWidth(
        columnWidths[GRID_META_COLUMNS.validFrom],
        defaultGridMetaColumnWidth(GRID_META_COLUMNS.validFrom)
      ),
    },
    ...fields.map((field) => {
      const id = fieldColumnId(field.key);
      return {
        id,
        width: clampGridColumnWidth(columnWidths[id], defaultGridColumnWidth(field)),
      };
    }),
    {
      id: GRID_META_COLUMNS.schemaVersion,
      width: clampGridColumnWidth(
        columnWidths[GRID_META_COLUMNS.schemaVersion],
        defaultGridMetaColumnWidth(GRID_META_COLUMNS.schemaVersion)
      ),
    },
  ];
}

export function gridColumnWidthById(columns: GridColumnSizing[]) {
  return Object.fromEntries(columns.map((column) => [column.id, column.width]));
}
