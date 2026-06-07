import type { ChangeSetDetail, CurrentViewRecord, DraftOverlayCell } from "@/api/schemas";

export type DraftCellStatus = "draft" | "saving" | "failed";

export interface DraftCellOverlay {
  value: unknown;
  status: DraftCellStatus;
  changeSetId?: number;
  entryId?: number;
  message?: string;
}

export type DraftCellMap = Record<string, DraftCellOverlay>;

export function draftCellKey(at: string, entityId: number, fieldKey: string) {
  return `${at}:${entityId}:${fieldKey}`;
}

export function buildServerDraftCells(details: ChangeSetDetail[], at: string): DraftCellMap {
  const cells: DraftCellMap = {};
  for (const detail of details) {
    for (const entry of detail.entries) {
      if (entry.valid_from !== at || !entry.data_after || entry.action === "terminate") continue;
      const fields = entry.action === "create" ? Object.keys(entry.data_after) : entry.changed_fields;
      for (const field of fields) {
        if (!(field in entry.data_after)) continue;
        cells[draftCellKey(at, entry.entity_id, field)] = {
          value: entry.data_after[field],
          status: "draft",
          changeSetId: detail.id,
          entryId: entry.id,
        };
      }
    }
  }
  return cells;
}

export function buildDraftCellsFromOverlay(cells: DraftOverlayCell[]): DraftCellMap {
  return Object.fromEntries(
    cells.map((cell) => [
      cell.key,
      {
        value: cell.value,
        status: cell.status,
        changeSetId: cell.change_set_id,
        entryId: cell.entry_id,
      } satisfies DraftCellOverlay,
    ])
  );
}

export function mergeDraftCells(serverCells: DraftCellMap, localCells: DraftCellMap): DraftCellMap {
  return { ...serverCells, ...localCells };
}

export function buildDraftRows(
  details: ChangeSetDetail[],
  records: CurrentViewRecord[],
  at: string,
  currentSchemaVersion: number
): CurrentViewRecord[] {
  const existingEntityIds = new Set(records.map((record) => record.entity_id));
  return details.flatMap((detail) =>
    detail.entries
      .filter(
        (entry) =>
          entry.action === "create" &&
          entry.valid_from === at &&
          entry.data_after &&
          !existingEntityIds.has(entry.entity_id)
      )
      .map((entry) => ({
        record_id: -(entry.new_record_id ?? entry.id),
        entity_id: entry.entity_id,
        business_code: entry.business_code,
        display_code: entry.display_code,
        data_payload: entry.data_after ?? {},
        row_status: "new" as const,
        changed_fields: Object.keys(entry.data_after ?? {}),
        valid_from: entry.valid_from,
        valid_to: entry.valid_to,
        schema_version: currentSchemaVersion,
        change_set_id: detail.id,
        recorded_by_id: detail.created_by_id,
        recorded_at: detail.created_at,
      }))
  );
}

export function draftRowsFromOverlay(
  createRows: CurrentViewRecord[],
  records: CurrentViewRecord[]
): CurrentViewRecord[] {
  const existingEntityIds = new Set(records.map((record) => record.entity_id));
  return createRows.filter((row) => !existingEntityIds.has(row.entity_id));
}
