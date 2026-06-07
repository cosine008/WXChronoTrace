import type { FieldConfig } from "@/api/schemas";
import {
  GRID_META_COLUMNS,
  clampGridColumnWidth,
  fieldColumnId,
  type GridColumnWidthMap,
} from "./currentGridColumns";
import type { GridDensity } from "./currentGridDensity";

const STORAGE_VERSION = 1;
const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = new Set([50, 100, 200]);

export interface CurrentViewPreferences {
  version: typeof STORAGE_VERSION;
  density: GridDensity;
  inspectorCollapsed: boolean;
  hiddenFields: Record<string, boolean>;
  columnWidths: GridColumnWidthMap;
  pageSize: number;
}

export function loadCurrentViewPreferences(schemaId: number): CurrentViewPreferences {
  const fallback = defaultCurrentViewPreferences();
  if (!Number.isFinite(schemaId) || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(preferenceKey(schemaId));
    if (!raw) return fallback;
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function saveCurrentViewPreferences(
  schemaId: number,
  preferences: CurrentViewPreferences
) {
  if (!Number.isFinite(schemaId) || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(preferenceKey(schemaId), JSON.stringify(preferences));
  } catch {
    // localStorage can be unavailable in privacy modes; ignore and keep session state.
  }
}

export function sanitizeHiddenFields(
  hiddenFields: Record<string, boolean>,
  fields: FieldConfig[]
) {
  const fieldKeys = new Set(fields.map((field) => field.key));
  return Object.fromEntries(
    Object.entries(hiddenFields).filter(([key, hidden]) => fieldKeys.has(key) && hidden)
  );
}

export function sanitizeColumnWidths(
  columnWidths: GridColumnWidthMap,
  fields: FieldConfig[]
) {
  const validColumnIds = new Set([
    GRID_META_COLUMNS.entity,
    GRID_META_COLUMNS.validFrom,
    GRID_META_COLUMNS.schemaVersion,
    ...fields.map((field) => fieldColumnId(field.key)),
  ]);
  return Object.fromEntries(
    Object.entries(columnWidths)
      .filter(([id]) => validColumnIds.has(id))
      .map(([id, width]) => [id, clampGridColumnWidth(width)])
  );
}

export function defaultCurrentViewPreferences(): CurrentViewPreferences {
  return {
    version: STORAGE_VERSION,
    density: "standard",
    inspectorCollapsed: false,
    hiddenFields: {},
    columnWidths: {},
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

function normalizePreferences(value: unknown): CurrentViewPreferences {
  const fallback = defaultCurrentViewPreferences();
  if (!isRecord(value) || value.version !== STORAGE_VERSION) return fallback;
  return {
    version: STORAGE_VERSION,
    density: isGridDensity(value.density) ? value.density : fallback.density,
    inspectorCollapsed:
      typeof value.inspectorCollapsed === "boolean"
        ? value.inspectorCollapsed
        : fallback.inspectorCollapsed,
    hiddenFields: isRecord(value.hiddenFields)
      ? Object.fromEntries(
          Object.entries(value.hiddenFields).filter(
            (entry): entry is [string, true] => typeof entry[0] === "string" && entry[1] === true
          )
        )
      : fallback.hiddenFields,
    columnWidths: isRecord(value.columnWidths)
      ? Object.fromEntries(
          Object.entries(value.columnWidths)
            .filter((entry): entry is [string, number] => typeof entry[1] === "number")
            .map(([id, width]) => [id, clampGridColumnWidth(width)])
        )
      : fallback.columnWidths,
    pageSize:
      typeof value.pageSize === "number" && PAGE_SIZE_OPTIONS.has(value.pageSize)
        ? value.pageSize
        : fallback.pageSize,
  };
}

function isGridDensity(value: unknown): value is GridDensity {
  return value === "compact" || value === "standard" || value === "comfortable";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preferenceKey(schemaId: number) {
  return `chronotrace:current-view:v${STORAGE_VERSION}:schema:${schemaId}`;
}
