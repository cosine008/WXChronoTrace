import {
  ChevronLeft,
  ChevronRight,
  GitCommitVertical,
  Loader2,
} from "lucide-react";
import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import type { ChangeInspectorTab } from "./ChangeStreamPanel";

export function CollapsedChangeInspector(props: {
  totalCount: number;
  loading: boolean;
  onExpand: () => void;
}) {
  return (
    <aside className="max-xl:sticky max-xl:bottom-0 max-xl:z-20 max-xl:min-h-0 max-xl:flex-row max-xl:justify-between max-xl:px-3 max-xl:shadow-2xl flex min-h-40 flex-col items-center gap-3 overflow-hidden border border-border bg-background px-2 py-3 xl:sticky xl:top-4">
      <button
        type="button"
        title="展开变更检查器"
        aria-label="展开变更检查器"
        onClick={props.onExpand}
        className="grid size-9 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <GitCommitVertical className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-mono text-xs text-muted-foreground">{props.totalCount}</span>
      {props.loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
    </aside>
  );
}

export function ChangeInspectorHeader(props: {
  totalCount: number;
  selectedId?: number;
  loading: boolean;
  onCollapse: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <GitCommitVertical className="size-4 text-muted-foreground" aria-hidden />
          变更检查器
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          共 {props.totalCount} 批{props.selectedId ? ` · 当前 #${props.selectedId}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {props.loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        <button
          type="button"
          title="收起变更检查器"
          aria-label="收起变更检查器"
          onClick={props.onCollapse}
          className="grid size-8 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function InspectorTabs(props: {
  active: ChangeInspectorTab;
  hasDetail: boolean;
  hasEntity: boolean;
  onChange: (tab: ChangeInspectorTab) => void;
}) {
  const tabs: Array<{ id: ChangeInspectorTab; label: string; disabled?: boolean }> = [
    { id: "batches", label: "批次" },
    { id: "detail", label: "明细", disabled: !props.hasDetail },
    { id: "entity", label: "实体", disabled: !props.hasEntity },
    { id: "compare", label: "对比" },
  ];
  return (
    <div
      role="tablist"
      aria-label="变更检查器视图"
      onKeyDown={(event) => handleTabKey(event, tabs, props.active, props.onChange)}
      className="grid grid-cols-4 border-b border-border p-1"
    >
      {tabs.map((tab) => (
        <InspectorTabButton
          key={tab.id}
          id={tab.id}
          active={props.active === tab.id}
          label={tab.label}
          disabled={tab.disabled}
          onClick={() => props.onChange(tab.id)}
        />
      ))}
    </div>
  );
}

function InspectorTabButton(props: {
  id: ChangeInspectorTab;
  active: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      id={`change-inspector-tab-${props.id}`}
      role="tab"
      aria-selected={props.active}
      aria-controls={`change-inspector-panel-${props.id}`}
      tabIndex={props.active ? 0 : -1}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "h-8 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40",
        props.active && "bg-foreground text-background hover:text-background"
      )}
    >
      {props.label}
    </button>
  );
}

function handleTabKey(
  event: KeyboardEvent<HTMLDivElement>,
  tabs: Array<{ id: ChangeInspectorTab; disabled?: boolean }>,
  active: ChangeInspectorTab,
  onChange: (tab: ChangeInspectorTab) => void
) {
  const enabledTabs = tabs.filter((tab) => !tab.disabled);
  const activeIndex = enabledTabs.findIndex((tab) => tab.id === active);
  if (activeIndex < 0) return;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();

  if (event.key === "Home") {
    onChange(enabledTabs[0].id);
    return;
  }
  if (event.key === "End") {
    onChange(enabledTabs[enabledTabs.length - 1].id);
    return;
  }

  const direction = event.key === "ArrowRight" ? 1 : -1;
  const nextIndex = (activeIndex + direction + enabledTabs.length) % enabledTabs.length;
  onChange(enabledTabs[nextIndex].id);
}
