import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  before: ReactNode;
  after: ReactNode;
  className?: string;
}

/** 字段 before → after 对比单元格。对照 SRS 11.10.2 */
export function DiffCell({ before, after, className }: Props) {
  return (
    <span
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 rounded-sm border border-[var(--color-status-modified)]/20 bg-[var(--color-status-modified)]/10 px-2 py-1 text-xs",
        className
      )}
    >
      <span className="min-w-0 break-words font-mono text-[var(--color-status-terminated)] line-through">
        {before}
      </span>
      <span className="shrink-0 text-muted-foreground">→</span>
      <span className="min-w-0 break-words font-mono font-semibold text-[var(--color-status-new)]">
        {after}
      </span>
    </span>
  );
}
