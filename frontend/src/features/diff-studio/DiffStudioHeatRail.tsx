import type { ChangeSetFieldDiffRow } from "@/api/schemas";
import { cn } from "@/lib/utils";

import type { HeatBucket } from "./diffStudioTransforms";

interface Props {
  buckets: HeatBucket[];
  rows: ChangeSetFieldDiffRow[];
  selectedId: string | null;
  page: number;
  totalPages: number;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
}

export function DiffStudioHeatRail({
  buckets,
  rows,
  selectedId,
  page,
  totalPages,
  onSelect,
  onPage,
}: Props) {
  const safeTotalPages = Math.max(totalPages, 1);
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);

  const handlePage = (nextPage: number) => {
    const clamped = Math.min(safeTotalPages, Math.max(1, nextPage));
    onPage(clamped);
  };

  return (
    <footer className="grid gap-3 border-t border-border px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
      <div className="text-xs text-muted-foreground">
        第 <span className="font-mono text-foreground">{page}</span> /{" "}
        <span className="font-mono text-foreground">{safeTotalPages}</span> 页 · 本页{" "}
        <span className="font-mono text-foreground">{rows.length}</span> 行
      </div>

      <div className="flex min-h-10 items-end gap-1 overflow-x-auto" aria-label="差异密度热轨">
        {buckets.length === 0 ? (
          <div className="text-xs text-muted-foreground">当前页暂无热度分布。</div>
        ) : (
          buckets.map((bucket) => {
            const active = selectedId !== null && bucket.rowIds.includes(selectedId);
            const height = 18 + Math.round((bucket.count / maxCount) * 22);
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() => onSelect(bucket.rowIds[0])}
                className={cn(
                  "w-4 shrink-0 border border-border bg-muted/40 transition-colors hover:border-foreground hover:bg-accent",
                  active && "border-foreground bg-foreground/20"
                )}
                style={{ height }}
                aria-label={`定位到第 ${bucket.index + 1} 个热度桶，共 ${bucket.count} 行`}
                title={`热度桶 ${bucket.index + 1} · ${bucket.count} 行`}
              />
            );
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handlePage(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-9 min-w-20 items-center justify-center border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="上一页"
          title="上一页"
        >
          上一页
        </button>
        <button
          type="button"
          onClick={() => handlePage(page + 1)}
          disabled={page >= safeTotalPages}
          className="inline-flex h-9 min-w-20 items-center justify-center border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="下一页"
          title="下一页"
        >
          下一页
        </button>
      </div>
    </footer>
  );
}
