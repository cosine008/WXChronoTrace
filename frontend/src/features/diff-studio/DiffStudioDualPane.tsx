import type { ChangeSetFieldDiffRow, DiffMode, DiffSide, SnapshotDiffScope } from "@/api/schemas";
import { stringifyCell } from "@/features/current-view/currentViewUtils";
import { cn } from "@/lib/utils";

import { entityDisplayLabel, rowActionLabel } from "./diffStudioTransforms";

interface Props {
  mode: DiffMode;
  rows: ChangeSetFieldDiffRow[];
  selectedId: string | null;
  selectedPaneSide?: DiffSide;
  snapshotScope: SnapshotDiffScope | null;
  onSelect: (id: string, paneSide?: DiffSide) => void;
}

export function DiffStudioDualPane({
  mode,
  rows,
  selectedId,
  selectedPaneSide,
  snapshotScope,
  onSelect,
}: Props) {
  const leftRows = mode === "snapshot" ? rows : rows.filter((row) => row.side === "left");
  const rightRows = mode === "snapshot" ? rows : rows.filter((row) => row.side === "right");

  return (
    <section className="grid min-h-0 grid-cols-1 lg:grid-cols-2">
      <DiffPane
        mode={mode}
        paneSide="left"
        title={mode === "snapshot" ? "A Snapshot" : "A ChangeSet"}
        subtitle={mode === "snapshot" ? snapshotScope?.left_at ?? "before" : "left"}
        rows={leftRows}
        selectedId={selectedId}
        selectedPaneSide={selectedPaneSide}
        onSelect={onSelect}
      />
      <DiffPane
        mode={mode}
        paneSide="right"
        title={mode === "snapshot" ? "B Snapshot" : "B ChangeSet"}
        subtitle={mode === "snapshot" ? snapshotScope?.right_at ?? "after" : "right"}
        rows={rightRows}
        selectedId={selectedId}
        selectedPaneSide={selectedPaneSide}
        onSelect={onSelect}
        className="border-t border-border lg:border-l lg:border-t-0"
      />
    </section>
  );
}

function DiffPane(props: {
  mode: DiffMode;
  paneSide: DiffSide;
  title: string;
  subtitle: string;
  rows: ChangeSetFieldDiffRow[];
  selectedId: string | null;
  selectedPaneSide?: DiffSide;
  onSelect: (id: string, paneSide?: DiffSide) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-0 grid-rows-[auto_minmax(0,1fr)]", props.className)}>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
          <span className="font-mono text-xs uppercase text-muted-foreground">{props.subtitle}</span>
        </div>
      </div>

      {props.rows.length === 0 ? (
        <div className="flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {props.mode === "snapshot" ? "No snapshot rows on this page." : "No rows on this side."}
        </div>
      ) : (
        <div className="min-h-0 overflow-y-auto p-3">
          <ul className="grid gap-2">
            {props.rows.map((row) => {
              const active =
                row.id === props.selectedId &&
                (props.mode !== "snapshot" || props.paneSide === props.selectedPaneSide);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(row.id, props.paneSide)}
                    className={cn(
                      "diff-studio-panel grid w-full gap-2 border border-border bg-card px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
                      active
                        ? "diff-studio-selected border-[var(--color-status-info)] text-foreground"
                        : "text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                    aria-pressed={active}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {entityDisplayLabel(row)}
                        </div>
                        <div className="truncate text-xs">
                          {row.field.label} / {row.field.key}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px]">
                        <div className="font-medium text-foreground">{rowActionLabel(row.action)}</div>
                        {props.mode === "changeset" ? (
                          <div className="font-mono text-muted-foreground">#{row.change_set_id}</div>
                        ) : null}
                      </div>
                    </div>

                    {props.mode === "snapshot" ? (
                      <dl className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                        <dt className="font-mono text-muted-foreground">value</dt>
                        <dd className="truncate text-foreground">
                          {displayValue(props.paneSide === "left" ? row.before : row.after)}
                        </dd>
                      </dl>
                    ) : (
                      <dl className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                        <dt className="font-mono text-muted-foreground">before</dt>
                        <dd className="truncate text-foreground">{displayValue(row.before)}</dd>
                        <dt className="font-mono text-muted-foreground">after</dt>
                        <dd className="truncate text-foreground">{displayValue(row.after)}</dd>
                      </dl>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function displayValue(value: unknown) {
  return stringifyCell(value) || "-";
}
