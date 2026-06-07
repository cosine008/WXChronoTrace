import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileClock } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { scanLabel } from "@/api/labels";
import { ErrorState, LoadingState } from "@/components/feedback";
import { cn } from "@/lib/utils";
import { EntityFieldView } from "./EntityFieldView";
import { LabelStateView } from "./LabelStateView";
import { LabelStatusPanel } from "./LabelStatusPanel";

export function ScanResultPage() {
  const { labelCode = "" } = useParams();
  const query = useQuery({
    queryKey: ["label-scan", labelCode],
    queryFn: () => scanLabel(labelCode, "qr_url"),
    enabled: Boolean(labelCode),
  });

  if (query.isLoading) return <LoadingState fullScreen label="解析标签" />;
  if (query.isError) {
    return <ErrorState fullScreen title="扫码失败" error={query.error} onRetry={() => query.refetch()} />;
  }
  if (!query.data) return <ErrorState fullScreen title="标签码缺失" message="无法解析当前路径。" />;
  if (query.data.outcome !== "resolved") return <LabelStateView result={query.data} />;

  const result = query.data;
  return (
    <main className="min-h-screen bg-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <Link
            to="/scan"
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm hover:border-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Scan
          </Link>
          <span className="font-mono text-xs uppercase text-muted-foreground">
            {result.label.label_code}
          </span>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <EntityFieldView result={result} />
          <LabelStatusPanel label={result.label} />
        </div>

        <section className="grid gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileClock className="size-4" aria-hidden />
            最近变化
          </div>
          <div className="grid gap-2">
            {result.recent_changes.map((item) => (
              <div
                key={`${item.change_set_id}-${item.record_id}`}
                className={cn("grid gap-1 border-b border-border/70 py-2 text-sm")}
              >
                <span>{item.change_summary}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  CS#{item.change_set_id} · {item.valid_from}
                </span>
              </div>
            ))}
          </div>
        </section>

        {result.capabilities.can_start_change_set_draft && (
          <section className="border-t border-border pt-4">
            <button
              type="button"
              disabled
              className="inline-flex h-10 cursor-not-allowed items-center border border-border px-3 text-sm text-muted-foreground"
            >
              发起变更
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
