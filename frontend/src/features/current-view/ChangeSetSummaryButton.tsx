import { GitCompareArrows } from "lucide-react";

import type { ChangeSetSummary } from "@/api/schemas";
import { ChangeBadge, StatusBadge } from "@/components/badges";
import { cn } from "@/lib/utils";

export function ChangeSetSummaryButton(props: {
  item: ChangeSetSummary;
  selected: boolean;
  compareLeft?: boolean;
  compareRight?: boolean;
  onClick: () => void;
  onCompareLeft?: () => void;
  onCompareRight?: () => void;
}) {
  return (
    <div
      className={cn(
        "nd-interactive-row border-b border-border",
        props.selected && "nd-active-row bg-muted"
      )}
    >
      <button
        type="button"
        onClick={props.onClick}
        aria-label={`查看批次 #${props.item.id} 明细`}
        className="grid w-full gap-2 px-3 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{props.item.summary}</span>
          <StatusBadge variant={props.item.status} size="xs" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ChangeBadge
            kind="new"
            count={props.item.action_counts.create}
            size="xs"
            mutedWhenZero
          />
          <ChangeBadge
            kind="modified"
            count={props.item.action_counts.update}
            size="xs"
            mutedWhenZero
          />
          <ChangeBadge
            kind="terminated"
            count={props.item.action_counts.terminate}
            size="xs"
            mutedWhenZero
          />
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
          <span>{props.item.applied_at?.slice(0, 10) ?? props.item.created_at.slice(0, 10)}</span>
          <span>#{props.item.id}</span>
        </div>
      </button>
      {(props.onCompareLeft || props.onCompareRight) && (
        <div className="flex items-center gap-1 px-3 pb-3">
          <GitCompareArrows className="size-3.5 text-muted-foreground" aria-hidden />
          <CompareSlotButton
            label="A"
            selected={Boolean(props.compareLeft)}
            onClick={props.onCompareLeft}
            itemId={props.item.id}
          />
          <CompareSlotButton
            label="B"
            selected={Boolean(props.compareRight)}
            onClick={props.onCompareRight}
            itemId={props.item.id}
          />
        </div>
      )}
    </div>
  );
}

function CompareSlotButton(props: {
  label: "A" | "B";
  selected: boolean;
  itemId: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!props.onClick}
      onClick={props.onClick}
      aria-pressed={props.selected}
      aria-label={`设为对比 ${props.label}：批次 #${props.itemId}`}
      className={cn(
        "h-6 border border-border px-2 font-mono text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground",
        props.selected && "border-foreground bg-foreground text-background hover:text-background"
      )}
    >
      {props.label}
    </button>
  );
}
