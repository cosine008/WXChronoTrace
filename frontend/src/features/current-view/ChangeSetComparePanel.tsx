import { Link } from "react-router-dom";
import { GitCompareArrows, Maximize2, RotateCcw } from "lucide-react";

import type { ChangeSetCompareResponse, ChangeSetSummary } from "@/api/schemas";
import { ChangeBadge, StatusBadge } from "@/components/badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { cn } from "@/lib/utils";
import { changeActionLabel, signedCount } from "./changeStreamLabels";

export function ChangeSetComparePanel(props: {
  schemaId: number;
  leftId?: number;
  rightId?: number;
  comparison?: ChangeSetCompareResponse;
  loading: boolean;
  error?: unknown;
  onBack: () => void;
  onClear: () => void;
  onOpenDetail: (id: number) => void;
}) {
  if (!props.leftId || !props.rightId) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <EmptyState
          title="选择两个批次"
          description="回到批次列表，用 A / B 按钮选择两个批次后查看审计对比。"
          minH="min-h-full"
          action={<BackButton onClick={props.onBack} />}
        />
      </div>
    );
  }

  if (props.loading) {
    return <LoadingState minH="min-h-full" label="加载批次对比" />;
  }

  if (props.error || !props.comparison) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <ErrorState
          title="批次对比加载失败"
          error={props.error}
          minH="min-h-64"
        />
        <div className="mt-2 flex justify-center">
          <BackButton onClick={props.onBack} />
        </div>
      </div>
    );
  }

  const comparison = props.comparison;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="grid gap-3">
        <section className="border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <GitCompareArrows className="size-4 text-muted-foreground" aria-hidden />
                批次对比
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                A #{comparison.left.id} 与 B #{comparison.right.id} 的审计差异。
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                当前面板保留摘要；完整双屏、证据抽屉和热力轨在全屏工作台中查看。
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <BackButton onClick={props.onBack} />
              <button
                type="button"
                onClick={props.onClear}
                className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                清除
              </button>
              <Link
                to={`/schemas/${props.schemaId}/diff-studio?mode=changeset&left=${comparison.left.id}&right=${comparison.right.id}`}
                className="inline-flex h-8 items-center gap-1 border border-foreground bg-foreground px-2 text-xs text-background hover:opacity-85"
              >
                <Maximize2 className="size-3.5" aria-hidden />
                打开 Diff Studio
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-2 md:grid-cols-2">
          <CompareSide label="A" detail={comparison.left} onOpen={props.onOpenDetail} />
          <CompareSide label="B" detail={comparison.right} onOpen={props.onOpenDetail} />
        </div>

        <section className="border border-border bg-card p-3">
          <h3 className="text-sm font-semibold">操作差异</h3>
          <div className="mt-3 grid gap-2">
            {comparison.action_rows.map((row) => (
              <div
                key={row.action}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border border-border px-2 py-2 text-xs"
              >
                <span>{changeActionLabel(row.action)}</span>
                <span className="font-mono">A {row.left}</span>
                <span className="font-mono">B {row.right}</span>
                <span className={cn("font-mono", row.delta !== 0 && "font-semibold")}>
                  {signedCount(row.delta)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-border bg-card p-3">
          <h3 className="text-sm font-semibold">实体影响面</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <Metric label="A 实体" value={comparison.entity_overlap.left_entity_count} />
            <Metric label="B 实体" value={comparison.entity_overlap.right_entity_count} />
            <Metric label="共同实体" value={comparison.entity_overlap.shared_entity_count} />
            <Metric label="仅 A" value={comparison.entity_overlap.left_only_entity_count} />
            <Metric label="仅 B" value={comparison.entity_overlap.right_only_entity_count} />
          </div>
        </section>

        <section className="border border-border bg-card p-3">
          <h3 className="text-sm font-semibold">字段分布差异</h3>
          {comparison.field_rows.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">两个批次都没有字段级差异。</p>
          ) : (
            <div className="mt-3 grid max-h-72 gap-1 overflow-auto pr-1">
              {comparison.field_rows.map((field) => (
                <div
                  key={field.key}
                  className="grid gap-1 border border-border px-2 py-2 text-xs"
                >
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{field.label}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {field.key}
                      </span>
                    </span>
                    <span className="font-mono">{signedCount(field.delta)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    <span>A {field.left_changes} 次 / {field.left_entities} 实体</span>
                    <span>B {field.right_changes} 次 / {field.right_entities} 实体</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CompareSide(props: {
  label: "A" | "B";
  detail: ChangeSetSummary;
  onOpen: (id: number) => void;
}) {
  return (
    <section className="min-w-0 border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-xs">{props.label}</span>
            <StatusBadge variant={props.detail.status} />
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold">{props.detail.summary}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            #{props.detail.id} · {props.detail.created_by_username}
          </p>
        </div>
        <button
          type="button"
          onClick={() => props.onOpen(props.detail.id)}
          className="h-8 shrink-0 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          明细
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ChangeBadge kind="new" count={props.detail.action_counts.create} mutedWhenZero />
        <ChangeBadge kind="modified" count={props.detail.action_counts.update} mutedWhenZero />
        <ChangeBadge kind="terminated" count={props.detail.action_counts.terminate} mutedWhenZero />
      </div>
    </section>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="border border-border px-2 py-2">
      <div className="font-mono text-sm font-semibold">{props.value}</div>
      <div className="text-[10px] text-muted-foreground">{props.label}</div>
    </div>
  );
}

function BackButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="h-8 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      批次
    </button>
  );
}
