import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export type StatusVariant =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "applied"
  | "reverted";

type StatusBadgeSize = "xs" | "sm";

const VARIANT_CONFIG: Record<
  StatusVariant,
  { label: string; code: string; step: number; className: string; marker: string }
> = {
  draft: {
    label: "草稿",
    code: "D",
    step: 0,
    className: "border-border text-muted-foreground",
    marker: "bg-muted-foreground",
  },
  submitted: {
    label: "已提交",
    code: "S",
    step: 1,
    className:
      "border-[var(--color-status-info)] text-[var(--color-status-info)]",
    marker: "bg-[var(--color-status-info)]",
  },
  approved: {
    label: "已通过",
    code: "A",
    step: 2,
    className:
      "border-[var(--color-status-new)] text-[var(--color-status-new)]",
    marker: "bg-[var(--color-status-new)]",
  },
  rejected: {
    label: "已驳回",
    code: "R",
    step: 2,
    className:
      "border-[var(--color-status-error)] text-[var(--color-status-error)]",
    marker: "bg-[var(--color-status-error)]",
  },
  applied: {
    label: "已生效",
    code: "LIVE",
    step: 3,
    className:
      "border-[var(--color-status-new)] bg-[var(--color-status-new)] text-white",
    marker: "bg-white",
  },
  reverted: {
    label: "已撤销",
    code: "REV",
    step: 4,
    className: "border-border text-muted-foreground",
    marker: "bg-muted-foreground",
  },
};

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant: StatusVariant;
  label?: string;
  size?: StatusBadgeSize;
}

/** ChangeSet 状态标。对照 SRS 第 4.6 节状态机 */
export function StatusBadge({ variant, label, size = "sm", className, ...rest }: Props) {
  const cfg = VARIANT_CONFIG[variant];
  const compact = size === "xs";

  return (
    <span
      className={cn(
        "inline-grid grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden rounded-full border bg-card text-xs font-medium",
        compact ? "h-6" : "h-7",
        cfg.className,
        variant === "reverted" && "border-dashed",
        className
      )}
      title={`${cfg.label} · 流程位置 ${cfg.step + 1}/5`}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-full items-center gap-0.5 border-r border-current/35 px-1.5",
          compact && "px-1"
        )}
      >
        {[0, 1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "block rounded-full",
              compact ? "size-1" : "size-1.5",
              step <= cfg.step ? cfg.marker : "bg-border",
              variant === "rejected" && step === cfg.step && "rounded-sm",
              variant === "reverted" && step === cfg.step && "rotate-45 rounded-sm"
            )}
          />
        ))}
      </span>
      <span className={cn("flex min-w-0 items-baseline gap-1 px-2", compact && "px-1.5")}>
        <span className="font-mono text-[10px] font-semibold tabular">{cfg.code}</span>
        <span className="truncate">{label ?? cfg.label}</span>
      </span>
    </span>
  );
}
