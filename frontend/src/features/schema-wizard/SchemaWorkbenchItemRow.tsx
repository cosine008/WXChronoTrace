import { type ReactNode } from "react";

import type { WorkbenchItem } from "@/api/workbench";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
} from "@/features/workbench/WorkbenchObjectMarkers";
import { safeWorkbenchObjectTitle } from "@/features/workbench/workbenchObjectMeta";

export function WorkbenchItemRow(props: {
  item: WorkbenchItem;
  disabled?: boolean;
  actionLabel: string;
  actionClassName: string;
  actionIcon?: ReactNode;
  onAction: () => void;
}) {
  return (
    <div className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0 grid gap-1">
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type={props.item.type} />
            <span className="font-mono text-[11px] text-muted-foreground">#{props.item.id}</span>
          </div>
          <WorkbenchSignalRail pinned={props.item.is_pinned} sensitive={props.item.is_sensitive} />
        </div>
        <div className="truncate text-sm font-medium text-foreground">
          {safeWorkbenchObjectTitle(props.item)}
        </div>
        {!props.item.is_sensitive && props.item.summary.trim() && (
          <div className="line-clamp-2 text-xs text-muted-foreground">{props.item.summary.trim()}</div>
        )}
        {props.item.is_sensitive && (
          <div className="text-xs text-muted-foreground">
            敏感内容只展示标题与类型，不展示正文或材料说明。
          </div>
        )}
      </div>
      <button type="button" disabled={props.disabled} onClick={props.onAction} className={props.actionClassName}>
        {props.actionIcon}
        {props.actionLabel}
      </button>
    </div>
  );
}
