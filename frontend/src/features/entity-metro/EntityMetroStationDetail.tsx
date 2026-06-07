import { FileJson } from "lucide-react";

import { ValidityRange } from "@/components/badges";

import { entityMetroFieldKindLabel } from "./entityMetroLabels.ts";
import type { EntityMetroStationDetailProps } from "./entityMetroTypes.ts";

export function EntityMetroStationDetail(props: EntityMetroStationDetailProps) {
  if (!props.station) {
    return (
      <section className="border border-dashed border-border px-4 py-10 text-sm text-muted-foreground">
        选择一个站点后查看摘要、关键字段变化和完整 payload。
      </section>
    );
  }

  const { station } = props;
  return (
    <section className="grid gap-4 border border-border bg-card/80 p-4">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{station.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{station.summary}</p>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            v{station.schemaVersion} / #{station.record.record_id}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ValidityRange from={station.record.valid_from} to={station.record.valid_to} />
          <span>#{station.record.change_set_id}</span>
          <span>{station.record.recorded_at}</span>
        </div>
      </header>

      <section className="grid gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          关键字段变化
        </div>
        {station.fieldChanges.length > 0 ? (
          <ul className="grid gap-2">
            {station.fieldChanges.map((change) => (
              <li
                key={change.key}
                className={`border px-3 py-2 text-xs ${
                  change.highlighted
                    ? "border-cyan-400/40 bg-cyan-500/5"
                    : "border-border bg-background/70"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-muted-foreground">{change.label}</span>
                  <span
                    title={`kind: ${change.kind}`}
                    className="border border-border px-1.5 py-0.5 text-[10px]"
                  >
                    {entityMetroFieldKindLabel(change.kind)}
                  </span>
                  {change.highlighted ? (
                    <span className="border border-cyan-400/40 px-1.5 py-0.5 text-[10px] text-cyan-200">
                      当前定位
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">变更前：</span>{" "}
                    {formatValue(change.before)}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">变更后：</span>{" "}
                    {formatValue(change.after)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            当前站点没有额外字段变化，主要用于标记生命周期节点。
          </div>
        )}
      </section>

      <details className="border border-border bg-background/60">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-foreground">
          <FileJson className="size-3.5" aria-hidden />
          完整 payload
        </summary>
        <pre className="overflow-x-auto border-t border-border px-3 py-3 text-[11px] text-muted-foreground">
          {JSON.stringify(station.record.data_payload, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function formatValue(value: unknown) {
  if (value === undefined) {
    return "缺失";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value || "—";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
