import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

type MetricTone = "neutral" | "info" | "success" | "warning" | "danger";
type MetricLayout = "card" | "strip";
type MetricDensity = "compact" | "comfortable";
type MetricGridColumns = 2 | 3 | 4;
type MetricStripColumns = 2 | 3 | 4 | 5;

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  onClick?: () => void;
  emphasis?: boolean;
  className?: string;
  tone?: MetricTone;
  unit?: ReactNode;
  trend?: ReactNode;
  interactiveLabel?: string;
  layout?: MetricLayout;
  density?: MetricDensity;
  title?: string;
}

const TONE_CONFIG: Record<
  MetricTone,
  {
    glyph: string;
    rail: string;
    tick: string;
    corner: string;
    value: string;
  }
> = {
  neutral: {
    glyph: "N",
    rail: "bg-foreground",
    tick: "bg-border",
    corner: "border-border text-muted-foreground",
    value: "text-foreground",
  },
  info: {
    glyph: "I",
    rail: "bg-[var(--color-status-info)]",
    tick: "bg-[var(--color-status-info)]",
    corner: "border-[var(--color-status-info)] text-[var(--color-status-info)]",
    value: "text-[var(--color-status-info)]",
  },
  success: {
    glyph: "+",
    rail: "bg-[var(--color-status-new)]",
    tick: "bg-[var(--color-status-new)]",
    corner: "border-[var(--color-status-new)] text-[var(--color-status-new)]",
    value: "text-[var(--color-status-new)]",
  },
  warning: {
    glyph: "!",
    rail: "bg-[var(--color-status-modified)]",
    tick: "bg-[var(--color-status-modified)]",
    corner: "border-[var(--color-status-modified)] text-[var(--color-status-modified)]",
    value: "text-[var(--color-status-modified)]",
  },
  danger: {
    glyph: "X",
    rail: "bg-[var(--color-status-error)]",
    tick: "bg-[var(--color-status-error)]",
    corner: "border-[var(--color-status-error)] text-[var(--color-status-error)]",
    value: "text-[var(--color-status-error)]",
  },
};

const RULER_TICKS = [0, 1, 2, 3, 4];

const METRIC_GRID_COLUMNS: Record<MetricGridColumns, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4",
};

const METRIC_STRIP_COLUMNS: Record<MetricStripColumns, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
};

/** 指标卡网格：用于 Dashboard、Admin、Current View 等统计区，子项可以独立点击。 */
export function MetricGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: MetricGridColumns;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-3", METRIC_GRID_COLUMNS[columns], className)}>
      {children}
    </div>
  );
}

/** 紧凑指标条：用于 Workbench 概况和筛选/摘要条，默认承载摘要或筛选语义。 */
export function MetricStrip({
  children,
  columns = 5,
  className,
}: {
  children: ReactNode;
  columns?: MetricStripColumns;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-2", METRIC_STRIP_COLUMNS[columns], className)}>
      {children}
    </div>
  );
}

/** 仪表型指标卡。旧 API 保持可用,新增 tone/layout/density 用于指标族收敛。 */
export function DataMetric({
  label,
  value,
  hint,
  onClick,
  emphasis,
  className,
  tone = "neutral",
  unit,
  trend,
  interactiveLabel,
  layout = "card",
  density = "comfortable",
  title,
}: Props) {
  const toneConfig = TONE_CONFIG[tone];
  const Element = onClick ? "button" : "div";
  const ariaLabel = interactiveLabel ?? `查看${label}`;
  const compact = density === "compact";
  const strip = layout === "strip";

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={onClick ? ariaLabel : undefined}
      title={title ?? (onClick ? ariaLabel : undefined)}
      className={cn(
        "nd-interactive-surface group relative grid min-w-0 overflow-hidden rounded-md border border-border bg-card text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground",
        strip ? "grid-cols-[12px_minmax(0,1fr)] gap-2" : "grid-cols-[14px_minmax(0,1fr)] gap-3",
        compact ? "p-3" : "p-4",
        onClick && "cursor-pointer hover:border-foreground",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative z-10 grid h-full min-h-16 w-full place-items-center py-0.5",
          strip && "min-h-14"
        )}
      >
        <span
          className={cn(
            "absolute top-0 bottom-0 left-1/2 -translate-x-1/2 rounded-full",
            emphasis ? "w-1.5" : "w-px",
            toneConfig.rail
          )}
        />
        <span className="relative grid h-full w-full grid-rows-5 items-center">
          {RULER_TICKS.map((tick) => (
            <span
              key={tick}
              className={cn(
                "mx-auto h-px rounded-full",
                tick === 2 ? "w-full" : emphasis ? "w-3" : "w-2",
                tick === 2 ? toneConfig.rail : toneConfig.tick,
                tick !== 2 && (emphasis ? "opacity-80" : "opacity-55")
              )}
            />
          ))}
        </span>
      </span>

      <span className="relative z-10 grid min-w-0 gap-2">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">
            {label}
          </span>
          <span
            aria-hidden
            className={cn(
              "grid h-5 min-w-5 place-items-center rounded-sm border bg-background px-1 font-mono text-[11px] leading-none",
              toneConfig.corner
            )}
          >
            {toneConfig.glyph}
          </span>
        </span>

        <span
          className={cn(
            "flex min-w-0 items-end gap-1 rounded-sm border border-border bg-background px-2 py-1",
            emphasis && "bg-muted/35",
            strip && "py-0.5"
          )}
        >
          {emphasis && (
            <span
              aria-hidden
              className={cn(
                "mb-0.5 h-5 w-1 shrink-0 rounded-full",
                compact && "h-4",
                toneConfig.rail
              )}
            />
          )}
          <span
            className={cn(
              "tabular min-w-[7ch] max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono font-semibold leading-none",
              compact ? "text-xl" : "text-2xl",
              emphasis && !compact && "text-3xl",
              toneConfig.value
            )}
          >
            {value}
          </span>
          {unit && (
            <span className="shrink-0 pb-0.5 text-[13px] font-medium text-muted-foreground">
              {unit}
            </span>
          )}
        </span>

        {(hint || trend || onClick) && (
          <span className="flex min-w-0 items-center justify-between gap-2 text-[13px] text-muted-foreground">
            <span className="min-w-0 truncate">{hint}</span>
            <span className="flex shrink-0 items-center gap-1">
              {trend && <span className="font-mono tabular">{trend}</span>}
              {onClick && (
                <span className="grid size-5 place-items-center rounded-sm border border-border text-foreground">
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </span>
              )}
            </span>
          </span>
        )}
      </span>
    </Element>
  );
}
