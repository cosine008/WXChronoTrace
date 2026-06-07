import { useMemo, useState } from "react";

import type {
  ChangeSetCompareResponse,
  ChangeSetFieldDiffResponse,
  DataSchema,
  DiffSide,
  DiffMode,
  SnapshotDiffResponse,
} from "@/api/schemas";
import { cn } from "@/lib/utils";

import { DiffStudioDualPane } from "./DiffStudioDualPane";
import { DiffStudioEvidenceDrawer } from "./DiffStudioEvidenceDrawer";
import { DiffStudioHeatRail } from "./DiffStudioHeatRail";
import { DiffStudioOutline } from "./DiffStudioOutline";
import { DiffStudioToolbar } from "./DiffStudioToolbar";
import { buildHeatBuckets, buildOutlineItems, type OutlineMode } from "./diffStudioTransforms";

interface Props {
  schema: DataSchema;
  compare: ChangeSetCompareResponse;
  fieldDiffs: ChangeSetFieldDiffResponse;
  mode: DiffMode;
  page: number;
  modeLabel: string;
  snapshotContext: Pick<SnapshotDiffResponse, "results" | "scope"> | null;
  onPage: (page: number) => void;
}

export function DiffStudioShell({
  schema,
  compare,
  fieldDiffs,
  mode,
  page,
  modeLabel,
  snapshotContext,
  onPage,
}: Props) {
  const rows = fieldDiffs.results;
  const [outlineMode, setOutlineMode] = useState<OutlineMode>("entity");
  const [selectedState, setSelectedState] = useState<SelectedRowState | null | undefined>(
    undefined
  );
  const selectedId =
    selectedState === undefined
      ? rows[0]?.id ?? null
      : selectedState !== null && rows.some((row) => row.id === selectedState.id)
        ? selectedState.id
        : selectedState === null
          ? null
          : rows[0]?.id ?? null;
  const selectedPaneSide =
    mode !== "snapshot"
      ? selectedState?.paneSide
      : selectedState === undefined
        ? "right"
        : selectedState !== null &&
            selectedState.id === selectedId &&
            selectedState.paneSide !== undefined
          ? selectedState.paneSide
          : selectedId === null
            ? undefined
            : "right";

  const outlineItems = useMemo(() => buildOutlineItems(rows, outlineMode), [rows, outlineMode]);
  const heatBuckets = useMemo(() => buildHeatBuckets(rows), [rows]);
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId]
  );
  const selectedSnapshotRow = useMemo(() => {
    if (mode !== "snapshot" || !snapshotContext || selectedId === null) {
      return null;
    }
    return snapshotContext.results.find((row) => row.id === selectedId) ?? null;
  }, [mode, selectedId, snapshotContext]);

  return (
    <section className="diff-studio-workbench diff-studio-stage diff-studio-enter grid min-h-[calc(100vh-112px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border border-border bg-background">
      <DiffStudioToolbar
        schema={schema}
        compare={compare}
        fieldDiffs={fieldDiffs}
        mode={mode}
        modeLabel={modeLabel}
        snapshotScope={snapshotContext?.scope ?? null}
      />

      <div
        className={cn(
          "grid min-h-0",
          selected
            ? "grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_320px]"
            : "grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]"
        )}
      >
        <DiffStudioOutline
          mode={outlineMode}
          items={outlineItems}
          selectedId={selectedId}
          rows={rows}
          onModeChange={setOutlineMode}
          onSelect={(id) => setSelectedState({ id })}
        />
        <DiffStudioDualPane
          mode={mode}
          rows={rows}
          selectedId={selectedId}
          selectedPaneSide={selectedPaneSide}
          snapshotScope={snapshotContext?.scope ?? null}
          onSelect={(id, paneSide) => setSelectedState({ id, paneSide })}
        />
        {selected ? (
          <DiffStudioEvidenceDrawer
            mode={mode}
            schemaId={schema.id}
            row={selected}
            snapshotRow={selectedSnapshotRow}
            snapshotPaneSide={selectedPaneSide}
            snapshotScope={snapshotContext?.scope ?? null}
            onClose={() => setSelectedState(null)}
          />
        ) : null}
      </div>

      <DiffStudioHeatRail
        buckets={heatBuckets}
        rows={rows}
        selectedId={selectedId}
        page={page}
        totalPages={fieldDiffs.total_pages}
        onSelect={(id) => setSelectedState({ id })}
        onPage={onPage}
      />
    </section>
  );
}

type SelectedRowState = {
  id: string;
  paneSide?: DiffSide;
};
