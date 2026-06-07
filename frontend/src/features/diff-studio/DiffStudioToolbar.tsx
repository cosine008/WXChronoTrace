import { ArrowLeftRight, Download, GitCompareArrows } from "lucide-react";
import { Link } from "react-router-dom";

import { toCurrentViewOrdering } from "@/features/current-view/currentViewUtils";
import type {
  ChangeSetCompareResponse,
  ChangeSetFieldDiffResponse,
  ChangeSetSummary,
  DataSchema,
  DiffMode,
  SnapshotDiffScope,
} from "@/api/schemas";

interface Props {
  schema: DataSchema;
  compare: ChangeSetCompareResponse;
  fieldDiffs: ChangeSetFieldDiffResponse;
  mode: DiffMode;
  modeLabel: string;
  snapshotScope?: SnapshotDiffScope | null;
}

export function DiffStudioToolbar({
  schema,
  compare,
  fieldDiffs,
  mode,
  modeLabel,
  snapshotScope = null,
}: Props) {
  const exportHintId = "diff-studio-export-hint";
  const currentViewTo =
    mode === "snapshot" && snapshotScope
      ? snapshotRecordsTo(schema.id, snapshotScope, "right")
      : compare.right.id > 0
      ? `/schemas/${schema.id}/records?change_set=${compare.right.id}`
      : `/schemas/${schema.id}/records`;

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="grid gap-2">
        <div className="inline-flex w-fit items-center gap-2 border border-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <GitCompareArrows className="size-3.5" aria-hidden />
          {modeLabel}
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">{schema.name}</h1>
          <p className="text-xs text-muted-foreground">Schema #{schema.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 border border-border px-2 py-1">
            <span className="font-mono text-foreground">{compareSideLabel("A", compare.left)}</span>
            <ArrowLeftRight className="size-3.5" aria-hidden />
            <span className="font-mono text-foreground">{compareSideLabel("B", compare.right)}</span>
          </span>
          <span className="border border-border px-2 py-1">字段差异 {fieldDiffs.summary.diff_count}</span>
          <span className="border border-border px-2 py-1">
            影响实体 {fieldDiffs.summary.affected_entity_count}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={currentViewTo}
          className="inline-flex h-9 items-center border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          定位当前视图
        </Link>
        <button
          type="button"
          aria-describedby={exportHintId}
          aria-disabled="true"
          onClick={(event) => event.preventDefault()}
          title="P1 暂不提供导出，导出能力将在后续任务补齐。"
          className="inline-flex h-9 cursor-not-allowed items-center gap-2 border border-border px-3 text-sm text-muted-foreground opacity-60"
        >
          <Download className="size-4" aria-hidden />
          导出
        </button>
        <span id={exportHintId} className="sr-only">
          P1 暂不提供导出，导出能力将在后续任务补齐。
        </span>
      </div>
    </header>
  );
}

function compareSideLabel(label: "A" | "B", summary: ChangeSetSummary) {
  if (summary.id > 0) {
    return `${label} #${summary.id}`;
  }
  return summary.summary || summary.applied_at || summary.created_at;
}

function snapshotRecordsTo(schemaId: number, scope: SnapshotDiffScope, side: "left" | "right") {
  const params = new URLSearchParams({
    at: side === "left" ? scope.left_at : scope.right_at,
    retro: String(scope.retro),
    search: scope.search,
    ordering: toCurrentViewOrdering(scope.ordering),
  });
  return `/schemas/${schemaId}/records?${params.toString()}`;
}
