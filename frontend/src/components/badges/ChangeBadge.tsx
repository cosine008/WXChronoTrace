import { cn } from "@/lib/utils";

type ChangeKind = "new" | "modified" | "terminated" | "failed";
type ChangeBadgeSize = "xs" | "sm";

const CONFIG: Record<
  ChangeKind,
  {
    symbol: string;
    label: string;
    text: string;
    border: string;
    bay: string;
    shape: string;
  }
> = {
  new: {
    symbol: "+",
    label: "新增",
    text: "text-[var(--color-status-new)]",
    border: "border-[var(--color-status-new)]",
    bay: "bg-[var(--color-status-new)]/10",
    shape: "border-solid",
  },
  modified: {
    symbol: "~",
    label: "修改",
    text: "text-[var(--color-status-modified)]",
    border: "border-[var(--color-status-modified)] border-dashed",
    bay: "bg-[var(--color-status-modified)]/10",
    shape: "border-dashed",
  },
  terminated: {
    symbol: "×",
    label: "终止",
    text: "text-[var(--color-status-terminated)]",
    border: "border-[var(--color-status-terminated)] border-double",
    bay: "bg-[var(--color-status-terminated)]/10",
    shape: "border-double",
  },
  failed: {
    symbol: "!",
    label: "失败",
    text: "text-[var(--color-status-error)]",
    border: "border-[var(--color-status-error)]",
    bay: "bg-[var(--color-status-error)]/10",
    shape: "border-2",
  },
};

interface Props {
  kind: ChangeKind;
  count: number;
  onClick?: () => void;
  size?: ChangeBadgeSize;
  mutedWhenZero?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Diff 汇总徽章。对照 SRS 11.10.3 */
export function ChangeBadge({
  kind,
  count,
  onClick,
  size = "sm",
  mutedWhenZero,
  ariaLabel,
  className,
}: Props) {
  const cfg = CONFIG[kind];
  const isMuted = mutedWhenZero && count === 0;
  const badgeClassName = cn(
    "inline-grid grid-cols-[auto_minmax(2.25rem,auto)_minmax(2.75rem,auto)] items-center overflow-hidden rounded-sm border bg-card text-xs transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground",
    size === "xs" ? "h-6" : "h-7",
    cfg.border,
    cfg.shape,
    onClick && "cursor-pointer hover:border-foreground",
    isMuted && "opacity-45",
    className
  );

  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "grid h-full place-items-center border-r px-1.5 font-mono font-bold",
          size === "xs" ? "min-w-5 text-[10px]" : "min-w-6",
          cfg.text,
          cfg.bay,
          cfg.shape
        )}
      >
        {cfg.symbol}
      </span>
      <span className="min-w-0 truncate px-1.5 text-muted-foreground">{cfg.label}</span>
      <span
        className={cn(
          "tabular h-full min-w-[3.5ch] border-l px-1.5 text-center font-mono font-semibold",
          size === "xs" ? "leading-6" : "leading-7",
          cfg.text,
          cfg.shape
        )}
      >
        {count}
      </span>
    </>
  );

  if (!onClick) {
    return <span className={badgeClassName}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? `${cfg.label} ${count} 条`}
      className={badgeClassName}
    >
      {content}
    </button>
  );
}
