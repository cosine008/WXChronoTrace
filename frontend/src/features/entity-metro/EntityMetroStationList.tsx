import { ArrowRight } from "lucide-react";

import { entityMetroReasonLabel } from "./entityMetroLabels.ts";
import type { EntityMetroStationListProps } from "./entityMetroTypes.ts";

export function EntityMetroStationList(props: EntityMetroStationListProps) {
  if (props.stations.length === 0) {
    return (
      <div className="border border-dashed border-border px-4 py-10 text-sm text-muted-foreground">
        当前上下文没有可展示的版本站点。
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto border border-border bg-background/60">
      <div className="absolute left-6 right-6 top-7 h-px bg-border" aria-hidden />
      <ol className="relative flex min-w-max items-start gap-3 px-4 py-4">
        {props.stations.map((station, index) => {
          const selected = station.id === props.selectedStationId;
          const highlighted = station.id === props.highlightedStationId || station.highlighted;
          const widthClass = props.variant === "fullscreen" ? "w-52" : "w-44";
          return (
            <li key={station.id} className={`flex shrink-0 flex-col gap-3 ${widthClass}`}>
              <button
                type="button"
                onClick={() => props.onSelect(station.id)}
                className={`group text-left transition-colors motion-reduce:transition-none ${
                  selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`relative z-10 inline-flex size-4 shrink-0 border-2 border-background ${
                      station.level === "key" ? "rounded-sm" : "rounded-full"
                    } ${
                      highlighted
                        ? "bg-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_0_18px_rgba(34,211,238,0.3)]"
                        : station.level === "key"
                          ? "bg-foreground"
                          : "bg-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{station.title}</div>
                    <div className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      v{station.schemaVersion} / #{station.record.record_id}
                    </div>
                  </div>
                  {index < props.stations.length - 1 ? (
                    <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                  ) : null}
                </div>
              </button>
              <button
                type="button"
                onClick={() => props.onSelect(station.id)}
                className={`nd-interactive-surface min-h-28 border px-3 py-3 text-left transition-colors motion-reduce:transition-none ${
                  selected
                    ? "border-foreground bg-card"
                    : highlighted
                      ? "border-cyan-400/40 bg-cyan-500/5"
                      : "border-border bg-card/70 hover:border-foreground/50"
                }`}
              >
                <div className="line-clamp-2 text-xs text-muted-foreground">{station.summary}</div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {station.reasonCodes.map((reasonCode) => (
                    <span
                      key={reasonCode}
                      title={`reason: ${reasonCode}`}
                      className="border border-border px-1.5 py-0.5 text-[10px]"
                    >
                      {entityMetroReasonLabel(reasonCode)}
                    </span>
                  ))}
                  {station.reasonCodes.length === 0 ? (
                    <span className="border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      普通版本
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
