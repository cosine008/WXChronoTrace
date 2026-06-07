import { List, Route } from "lucide-react";

import type { EntityMetroToolbarProps, EntityMetroViewMode } from "./entityMetroTypes.ts";

const VIEW_MODE_META: Array<{
  value: EntityMetroViewMode;
  label: string;
  Icon: typeof Route;
}> = [
  { value: "key-stations", label: "关键站点", Icon: Route },
  { value: "all-versions", label: "全部版本", Icon: List },
];

export function EntityMetroToolbar(props: EntityMetroToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-background/80 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">KEY {props.keyStationCount}</span>
        <span className="font-mono">MINOR {props.minorStationCount}</span>
        {props.highlightedStationId ? (
          <span className="border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 font-mono text-cyan-200">
            CONTEXT LOCKED
          </span>
        ) : null}
      </div>
      <div
        className={`inline-flex border border-border bg-background ${
          props.variant === "fullscreen" ? "p-1" : "p-0.5"
        }`}
        role="tablist"
        aria-label="Entity metro view mode"
      >
        {VIEW_MODE_META.map(({ value, label, Icon }) => {
          const active = props.viewMode === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => props.onViewModeChange(value)}
              className={`inline-flex h-8 items-center gap-2 px-3 text-xs transition-colors motion-reduce:transition-none ${
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
