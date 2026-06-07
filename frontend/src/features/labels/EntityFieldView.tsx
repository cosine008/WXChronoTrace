import type { ScanResolvedResult } from "@/api/labels";
import { cn } from "@/lib/utils";
import { stringifyCell } from "@/features/current-view/currentViewUtils";

export function EntityFieldView({ result, className }: { result: ScanResolvedResult; className?: string }) {
  const entries = Object.entries(result.record?.data_payload ?? {}).filter(([, value]) => value !== "");
  return (
    <section className={cn("grid gap-5", className)}>
      <div className="grid gap-1 border-b border-border pb-4">
        <p className="font-mono text-xs uppercase text-muted-foreground">Entity</p>
        <h1 className="break-words text-4xl font-semibold tracking-normal md:text-5xl">
          {result.entity.display_code}
        </h1>
        <p className="font-mono text-xs text-muted-foreground">#{result.entity.id}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Fact label="valid from" value={result.record?.valid_from ?? "无当前记录"} />
        <Fact label="schema version" value={result.record ? `v${result.record.schema_version}` : "-"} />
      </div>

      <div className="grid gap-2">
        {entries.slice(0, 8).map(([key, value]) => (
          <Fact key={key} label={key} value={stringifyCell(value)} />
        ))}
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-12 grid-cols-[120px_minmax(0,1fr)] items-start gap-3 border-b border-border/70 py-2">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-sm">{value || "-"}</span>
    </div>
  );
}
