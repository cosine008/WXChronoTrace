import { cn } from "@/lib/utils";

type Kind = "now" | "past" | "future";
type Size = "sm" | "md";
type Detail = "status" | "date" | "datetime";

const CONFIG: Record<
  Kind,
  {
    label: string;
    code: string;
    rail: string;
    pin: string;
    pinShell: string;
    text: string;
    border: string;
  }
> = {
  now: {
    label: "当前",
    code: "NOW",
    rail: "bg-[var(--color-status-info)]",
    pin: "bg-[var(--color-status-info)]",
    pinShell: "border-[var(--color-status-info)]",
    text: "text-[var(--color-status-info)]",
    border: "border-[var(--color-status-info)]",
  },
  past: {
    label: "历史",
    code: "HIS",
    rail: "bg-muted-foreground",
    pin: "bg-background",
    pinShell: "border-muted-foreground",
    text: "text-muted-foreground",
    border: "border-border",
  },
  future: {
    label: "预期",
    code: "ETA",
    rail: "bg-[var(--color-status-modified)]",
    pin: "bg-background",
    pinShell: "border-[var(--color-status-modified)] rotate-45",
    text: "text-[var(--color-status-modified)]",
    border: "border-[var(--color-status-modified)] border-dashed",
  },
};

interface Props {
  kind: Kind;
  date?: string;
  size?: Size;
  detail?: Detail;
  className?: string;
}

/** 时间点类型指示(当前/历史/预期)。对照 SRS 4.5.2 / 11.3.1 */
export function TimePointIndicator({
  kind,
  date,
  size = "md",
  detail = "date",
  className,
}: Props) {
  const cfg = CONFIG[kind];
  const compact = size === "sm";
  const displayDate = detail !== "status" && date ? formatTimePointDate(date, detail) : null;

  return (
    <span
      aria-label={`${cfg.label}时间点${displayDate ? ` ${displayDate}` : ""}`}
      title={`${cfg.label}时间点${displayDate ? ` ${displayDate}` : ""}`}
      className={cn(
        "inline-flex min-w-0 items-stretch overflow-hidden rounded-sm border bg-background text-xs",
        cfg.border,
        cfg.text,
        compact ? "h-7" : "h-8",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative grid shrink-0 place-items-center border-r border-current",
          compact ? "w-7" : "w-8"
        )}
      >
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2",
            kind === "future" ? "top-1 bottom-1 border-l border-dashed border-current" : "top-0 bottom-0",
            kind !== "future" && cfg.rail,
            kind === "now" ? "w-1" : "w-px"
          )}
        />
        <span
          className={cn(
            "relative z-10 block border-2",
            compact ? "size-2.5" : "size-3",
            kind === "future" ? "rounded-[2px]" : "rounded-full",
            cfg.pin,
            cfg.pinShell
          )}
        />
      </span>
      <span
        className={cn(
          "grid min-w-0 content-center border-l border-background px-2",
          compact ? "py-0" : "py-0.5"
        )}
      >
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="font-mono text-[10px] font-semibold tabular">{cfg.code}</span>
          <span className="truncate font-medium">{cfg.label}</span>
        </span>
        {displayDate && (
          <span className="truncate font-mono text-[10px] tabular text-muted-foreground">
            {displayDate}
          </span>
        )}
      </span>
    </span>
  );
}

function formatTimePointDate(value: string, detail: Detail) {
  if (detail === "date") return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
