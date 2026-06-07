import { X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import type {
  ChangeSetFieldDiffRow,
  DiffMode,
  DiffSide,
  SnapshotDiffRow,
  SnapshotDiffScope,
} from "@/api/schemas";
import { DiffCell } from "@/components/badges";
import { stringifyCell, toCurrentViewOrdering } from "@/features/current-view/currentViewUtils";

import { entityDisplayLabel, rowActionLabel } from "./diffStudioTransforms";

interface Props {
  mode: DiffMode;
  schemaId: number;
  row: ChangeSetFieldDiffRow;
  snapshotRow?: SnapshotDiffRow | null;
  snapshotPaneSide?: DiffSide;
  snapshotScope?: SnapshotDiffScope | null;
  onClose: () => void;
}

export function DiffStudioEvidenceDrawer({
  mode,
  schemaId,
  row,
  snapshotRow = null,
  snapshotPaneSide,
  snapshotScope = null,
  onClose,
}: Props) {
  const location = useLocation();
  const beforeText = stringifyCell(row.before) || "-";
  const afterText = stringifyCell(row.after) || "-";
  const metroRecordId = resolveMetroRecordId(mode, snapshotRow, snapshotPaneSide);
  const entityMetroTo =
    normalizePositiveNumber(row.entity.id) !== null
      ? buildEntityMetroTo({
          schemaId,
          entityId: normalizePositiveNumber(row.entity.id)!,
          fieldKey: row.field.key,
          mode,
          recordId: metroRecordId,
          pathname: location.pathname,
          search: location.search,
        })
      : null;
  const currentViewTo =
    mode === "snapshot"
      ? snapshotScope
        ? snapshotRecordsTo(schemaId, snapshotScope, snapshotPaneSide ?? "right")
        : `/schemas/${schemaId}/records`
      : `/schemas/${schemaId}/records?change_set=${row.change_set_id}`;
  const leftSnapshotTo =
    mode === "snapshot" && snapshotScope
      ? snapshotRecordsTo(schemaId, snapshotScope, "left")
      : null;
  const rightSnapshotTo =
    mode === "snapshot" && snapshotScope
      ? snapshotRecordsTo(schemaId, snapshotScope, "right")
      : null;

  return (
    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-border">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">Evidence</h2>
          <p className="truncate text-xs text-muted-foreground">
            {entityDisplayLabel(row)} / {row.field.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          aria-label="Close evidence drawer"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 py-4">
        <div className="grid gap-4">
          <section className="grid gap-2 border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              摘要
            </h3>
            <div className="grid gap-1 text-sm">
              <div className="text-foreground">{entityDisplayLabel(row)}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="border border-border px-2 py-1">{diffModeLabel(mode)}</span>
                <span className="border border-border px-2 py-1">{rowActionLabel(row.action)}</span>
                <span className="font-mono">{row.field.label}</span>
                <span className="font-mono text-muted-foreground/80">{row.field.key}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              渲染值沿用当前字段可见性与脱敏规则。
            </p>
            <div className="flex flex-wrap gap-2">
              {entityMetroTo ? (
                <Link
                  to={entityMetroTo}
                  className="inline-flex h-9 items-center justify-center border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  打开实体 Metro
                </Link>
              ) : (
                <span className="inline-flex h-9 items-center justify-center border border-dashed border-border px-3 text-sm text-muted-foreground">
                  实体 ID 缺失，无法打开 Metro
                </span>
              )}
              <Link
                to={currentViewTo}
                className="inline-flex h-9 items-center justify-center border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                Open Records View
              </Link>
              {leftSnapshotTo && rightSnapshotTo ? (
                <>
                  <Link
                    to={leftSnapshotTo}
                    className="inline-flex h-9 items-center justify-center border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    Open A Snapshot
                  </Link>
                  <Link
                    to={rightSnapshotTo}
                    className="inline-flex h-9 items-center justify-center border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    Open B Snapshot
                  </Link>
                </>
              ) : null}
            </div>
          </section>

          <section className="grid gap-2 border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              字段变化
            </h3>
            <DiffCell before={beforeText} after={afterText} />
            <div className="grid gap-1 text-xs">
              <div className="text-foreground">{row.field.label}</div>
              <div className="font-mono text-muted-foreground">{row.field.key}</div>
            </div>
          </section>

          <section className="grid gap-2 border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              原始证据
            </h3>
            {mode === "snapshot" ? (
              <dl className="grid grid-cols-[136px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">entity_id</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(row.entity.id)}</dd>
                <dt className="text-muted-foreground">field_key</dt>
                <dd className="font-mono text-foreground">{row.field.key}</dd>
                <dt className="text-muted-foreground">action</dt>
                <dd className="text-foreground">{rowActionLabel(row.action)}</dd>
                <dt className="text-muted-foreground">left_record_id</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(snapshotRow?.left_record_id)}</dd>
                <dt className="text-muted-foreground">right_record_id</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(snapshotRow?.right_record_id)}</dd>
                <dt className="text-muted-foreground">left_change_set_id</dt>
                <dd className="font-mono text-foreground">
                  {formatMetaValue(snapshotRow?.left_change_set_id)}
                </dd>
                <dt className="text-muted-foreground">right_change_set_id</dt>
                <dd className="font-mono text-foreground">
                  {formatMetaValue(snapshotRow?.right_change_set_id)}
                </dd>
                <dt className="text-muted-foreground">left_at</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(snapshotScope?.left_at)}</dd>
                <dt className="text-muted-foreground">right_at</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(snapshotScope?.right_at)}</dd>
                <dt className="text-muted-foreground">recorded_at</dt>
                <dd className="font-mono text-foreground">
                  {formatMetaValue(snapshotRow?.recorded_at)}
                </dd>
                <dt className="text-muted-foreground">record_id</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(metroRecordId)}</dd>
              </dl>
            ) : (
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">entity_id</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(row.entity.id)}</dd>
                <dt className="text-muted-foreground">field_key</dt>
                <dd className="font-mono text-foreground">{row.field.key}</dd>
                <dt className="text-muted-foreground">entry_id</dt>
                <dd className="font-mono text-foreground">{row.entry_id}</dd>
                <dt className="text-muted-foreground">change_set_id</dt>
                <dd className="font-mono text-foreground">{row.change_set_id}</dd>
                <dt className="text-muted-foreground">action</dt>
                <dd className="text-foreground">{rowActionLabel(row.action)}</dd>
                <dt className="text-muted-foreground">recorded_at</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(row.recorded_at)}</dd>
                <dt className="text-muted-foreground">valid_from</dt>
                <dd className="font-mono text-foreground">{formatMetaValue(row.valid_from)}</dd>
              </dl>
            )}
          </section>
        </div>
      </div>
    </aside>
  );
}

function formatMetaValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function snapshotRecordsTo(schemaId: number, scope: SnapshotDiffScope, side: DiffSide) {
  const params = new URLSearchParams({
    at: side === "left" ? scope.left_at : scope.right_at,
    retro: String(scope.retro),
    search: scope.search,
    ordering: toCurrentViewOrdering(scope.ordering),
  });
  return `/schemas/${schemaId}/records?${params.toString()}`;
}

function diffModeLabel(mode: DiffMode) {
  return mode === "snapshot" ? "Snapshot Diff" : "ChangeSet Diff";
}

function resolveMetroRecordId(
  mode: DiffMode,
  snapshotRow: SnapshotDiffRow | null,
  snapshotPaneSide: DiffSide | undefined
) {
  if (mode !== "snapshot" || !snapshotRow) {
    return null;
  }
  if (snapshotPaneSide === "left") {
    return normalizePositiveNumber(snapshotRow.left_record_id);
  }
  if (snapshotPaneSide === "right") {
    return normalizePositiveNumber(snapshotRow.right_record_id);
  }
  return normalizePositiveNumber(snapshotRow.right_record_id ?? snapshotRow.left_record_id);
}

function buildEntityMetroTo({
  schemaId,
  entityId,
  fieldKey,
  mode,
  recordId,
  pathname,
  search,
}: {
  schemaId: number;
  entityId: number;
  fieldKey: string;
  mode: DiffMode;
  recordId: number | null;
  pathname: string;
  search: string;
}) {
  const params = new URLSearchParams(search);
  params.set("source", "diff-studio");
  params.set("mode", mode);
  params.set("field", fieldKey);
  params.set("return_to", `${pathname}${search}`);
  if (recordId !== null) {
    params.set("record_id", String(recordId));
  } else {
    params.delete("record_id");
  }
  return `/schemas/${schemaId}/entity-metro/${entityId}?${params.toString()}`;
}

function normalizePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
