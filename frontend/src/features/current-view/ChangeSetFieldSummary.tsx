import { BarChart3, X } from "lucide-react";

import type { ChangeSetFieldAggregate } from "@/api/schemas";
import { cn } from "@/lib/utils";

export function ChangeSetFieldSummary(props: {
  aggregates: ChangeSetFieldAggregate[];
  fieldLabels: Record<string, string>;
  selectedFieldKey: string | null;
  onSelectField: (fieldKey: string | null) => void;
}) {
  if (props.aggregates.length === 0) {
    return (
      <section className="border border-border bg-card p-3">
        <SectionTitle />
        <p className="mt-2 text-xs text-muted-foreground">该批次没有字段级差异。</p>
      </section>
    );
  }

  return (
    <section className="border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <SectionTitle />
        {props.selectedFieldKey && (
          <button
            type="button"
            onClick={() => props.onSelectField(null)}
            className="inline-flex h-7 shrink-0 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
            清除字段
          </button>
        )}
      </div>
      <div className="mt-3 grid max-h-56 gap-1 overflow-auto pr-1">
        {props.aggregates.map((field) => (
          <button
            key={field.key}
            type="button"
            onClick={() =>
              props.onSelectField(props.selectedFieldKey === field.key ? null : field.key)
            }
            aria-pressed={props.selectedFieldKey === field.key}
            className={cn(
              "grid gap-1 border border-border px-2 py-2 text-left hover:border-foreground",
              props.selectedFieldKey === field.key && "border-foreground bg-muted"
            )}
          >
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">
                  {props.fieldLabels[field.key] ?? field.label}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {field.key}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs">
                {field.change_count} 次 / {field.entity_count} 实体
              </span>
            </span>
            <span className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
              <span>新增 {field.action_counts.create}</span>
              <span>修改 {field.action_counts.update}</span>
              <span>终止 {field.action_counts.terminate}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SectionTitle() {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
        字段聚合
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        按字段统计全批次改动次数和影响实体，点击字段可聚焦当前页相关 diff。
      </p>
    </div>
  );
}
