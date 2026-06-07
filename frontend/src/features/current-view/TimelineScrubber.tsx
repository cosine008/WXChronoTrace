import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

import type { ChangeSetSummary } from "@/api/schemas";
import { TimePointIndicator } from "@/components/badges";
import { cn } from "@/lib/utils";
import { timePointKind, todayInputValue } from "./currentViewUtils";

interface Props {
  at: string;
  changesets: ChangeSetSummary[];
  onChange: (date: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
type Zoom = "all" | "year" | "quarter" | "month";

const ZOOM_LABELS: Record<Zoom, string> = {
  all: "全量",
  year: "年",
  quarter: "季",
  month: "月",
};

const STAGE_HEIGHT = 68;
const STAGE_BUCKETS = 48;

export function TimelineScrubber({ at, changesets, onChange }: Props) {
  const atValue = dateValue(at);
  const [draftValue, setDraftValue] = useState(atValue);
  const [zoom, setZoom] = useState<Zoom>("all");
  const dates = useMemo(() => timelineDates(changesets), [changesets]);
  const fullMin = dates[0] ?? todayInputValue();
  const fullMax = dates.at(-1) ?? todayInputValue();
  const windowDays = zoomWindowDays(zoom);
  const windowBounds = useMemo(
    () => zoomBounds(atValue, dateValue(fullMin), dateValue(fullMax), windowDays),
    [atValue, fullMin, fullMax, windowDays]
  );
  const minValue = windowBounds[0];
  const maxValue = Math.max(windowBounds[1], minValue + 1);
  const current = Math.min(Math.max(draftValue, minValue), maxValue);
  const currentDate = valueDate(current);
  const today = todayInputValue();
  const todayValue = dateValue(today);
  const nowLeft = markerLeftClamped(today, minValue, maxValue);
  const currentLeft = markerLeftClamped(currentDate, minValue, maxValue);
  const pastWidth = todayValue <= minValue ? 0 : todayValue >= maxValue ? 100 : nowLeft;
  const futureWidth = 100 - pastWidth;
  const nowInRange = todayValue >= minValue && todayValue <= maxValue;
  const visibleMarkers = changesets
    .filter((item) => item.applied_at && isDateInRange(item.applied_at, minValue, maxValue))
    .slice(0, 60);

  const fullMinValue = dateValue(fullMin);
  const fullMaxValue = Math.max(dateValue(fullMax), fullMinValue + 1);
  const fullSpan = fullMaxValue - fullMinValue;
  const windowLeftPercent = clampPercent(((minValue - fullMinValue) / fullSpan) * 100);
  const windowWidthPercent = clampPercent(((maxValue - minValue) / fullSpan) * 100);
  const miniNowPercent = nowInRange
    ? clampPercent(((todayValue - fullMinValue) / fullSpan) * 100)
    : null;
  const miniCurrentPercent = clampPercent(((current - fullMinValue) / fullSpan) * 100);
  const miniMarkers = changesets.filter((item) => item.applied_at).slice(0, 200);

  const stageBuckets = useMemo(
    () => buildStageBuckets(changesets, minValue, maxValue, STAGE_BUCKETS),
    [changesets, minValue, maxValue]
  );
  const stagePaths = useMemo(() => buildStagePaths(stageBuckets, STAGE_HEIGHT), [stageBuckets]);
  const periodTicks = useMemo(() => buildPeriodTicks(minValue, maxValue), [minValue, maxValue]);

  const totals = useMemo(() => sumActionCounts(visibleMarkers), [visibleMarkers]);
  const heroParts = formatHeroDate(currentDate);
  const heroLabel = nowInRange && currentDate === today ? "LIVE" : currentDate < today ? "HISTORY" : "FUTURE";

  useEffect(() => {
    const nextDate = valueDate(draftValue);
    if (nextDate === at) return;
    const id = window.setTimeout(() => onChange(nextDate), 300);
    return () => window.clearTimeout(id);
  }, [at, draftValue, onChange]);

  return (
    <section className="nd-interactive-surface grid min-w-0 gap-3 border border-border bg-background p-3 sm:p-4">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          <span className="grid size-8 shrink-0 place-items-center border border-border bg-card">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <span className="font-display font-semibold">Chrono Time Rail</span>
          <TimePointIndicator kind={timePointKind(at)} date={at} size="sm" />
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] text-muted-foreground">目标日期</span>
            <input
              id="current-view-date"
              name="current_view_date"
              type="date"
              value={at}
              onChange={(event) => {
                setDraftValue(dateValue(event.target.value));
                onChange(event.target.value);
              }}
              className="h-9 min-w-0 border border-border bg-transparent px-2 font-mono text-sm tabular focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            />
          </label>
          <div className="grid gap-1">
            <span className="text-[11px] text-muted-foreground">窗口 / 平移</span>
            <div className="flex items-center gap-1">
              <RailButton label="向过去平移" onClick={() => setDraftValue(current - panDays(zoom))}>
                <ChevronLeft className="size-4" aria-hidden />
              </RailButton>
              <RailButton label="缩小时间窗口" onClick={() => setZoom(prevZoom(zoom))}>
                <ZoomOut className="size-4" aria-hidden />
              </RailButton>
              <span className="grid h-9 min-w-12 place-items-center border border-border bg-card px-2 font-mono text-xs tabular">
                {ZOOM_LABELS[zoom]}
              </span>
              <RailButton label="放大时间窗口" onClick={() => setZoom(nextZoom(zoom))}>
                <ZoomIn className="size-4" aria-hidden />
              </RailButton>
              <RailButton label="向未来平移" onClick={() => setDraftValue(current + panDays(zoom))}>
                <ChevronRight className="size-4" aria-hidden />
              </RailButton>
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden border border-border bg-card px-3 py-3 focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-foreground">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              CHRONO TIME RAIL
            </span>
            <HeroStateBadge label={heroLabel} />
          </div>
          <ActionLegend totals={totals} />
        </div>

        <div className="relative mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-end justify-between gap-2 font-mono text-[11px] tabular text-muted-foreground">
              {periodTicks.length === 0 ? (
                <>
                  <span>{valueDate(minValue)}</span>
                  <span className="truncate">当前点 {currentDate}</span>
                  <span>{valueDate(maxValue)}</span>
                </>
              ) : (
                <PeriodTickRow ticks={periodTicks} minValue={minValue} maxValue={maxValue} />
              )}
            </div>
          </div>
          <HeroDate parts={heroParts} />
        </div>

        <div className="relative mt-3" style={{ height: STAGE_HEIGHT }}>
          <svg
            aria-hidden
            viewBox={`0 0 1000 ${STAGE_HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <defs>
              <pattern id="chrono-grid" width="20.83" height={STAGE_HEIGHT} patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2={STAGE_HEIGHT} stroke="hsl(var(--border))" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="1000" height={STAGE_HEIGHT} fill="url(#chrono-grid)" opacity="0.6" />
            {pastWidth > 0 && (
              <rect
                x="0"
                y="0"
                width={(pastWidth / 100) * 1000}
                height={STAGE_HEIGHT}
                className="fill-foreground/[0.04]"
              />
            )}
            {futureWidth > 0 && (
              <rect
                x={(pastWidth / 100) * 1000}
                y="0"
                width={(futureWidth / 100) * 1000}
                height={STAGE_HEIGHT}
                fill="var(--color-status-modified)"
                opacity="0.05"
              />
            )}
            <line
              x1="0"
              y1={STAGE_HEIGHT - 0.5}
              x2="1000"
              y2={STAGE_HEIGHT - 0.5}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            {stagePaths.terminate && (
              <path d={stagePaths.terminate} fill="var(--color-status-terminated)" opacity="0.65" />
            )}
            {stagePaths.update && (
              <path d={stagePaths.update} fill="var(--color-status-modified)" opacity="0.55" />
            )}
            {stagePaths.create && (
              <path d={stagePaths.create} fill="var(--color-status-new)" opacity="0.55" />
            )}
            {stagePaths.outline && (
              <path
                d={stagePaths.outline}
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeWidth="0.75"
                opacity="0.35"
              />
            )}
          </svg>

          {nowInRange && (
            <span
              aria-hidden
              title="Now"
              className="nd-transition-state pointer-events-none absolute top-0 bottom-0 z-40 -translate-x-1/2"
              style={{ left: `${nowLeft}%` }}
            >
              <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-foreground" />
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 border border-foreground bg-foreground px-1.5 py-0.5 font-mono text-[12px] font-bold leading-none tracking-[0.08em] text-background">
                NOW
              </span>
            </span>
          )}

          <span
            aria-hidden
            className="nd-transition-state pointer-events-none absolute -top-1 bottom-0 z-50 -translate-x-1/2"
            style={{ left: `${currentLeft}%` }}
          >
            <span className="absolute left-1/2 top-1 h-full w-0.5 -translate-x-1/2 bg-[var(--color-status-info)]" />
            <span className="absolute top-0 left-1/2 size-3 -translate-x-1/2 rounded-full border-2 border-[var(--color-status-info)] bg-background" />
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 border border-[var(--color-status-info)] bg-background px-1 font-mono text-[10px] leading-4 text-[var(--color-status-info)]">
              {currentDate}
            </span>
          </span>

          <input
            id="current-view-timeline"
            name="timeline_day"
            aria-label="时间轴滑块"
            aria-valuetext={currentDate}
            type="range"
            min={minValue}
            max={maxValue}
            value={current}
            onChange={(event) => setDraftValue(Number(event.target.value))}
            className="absolute inset-0 z-30 h-full w-full cursor-ew-resize opacity-0"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>实线为已发生区间，虚线为未来区间</span>
          <span className="font-mono tabular">{totals.total} changesets · 窗口 {valueDate(minValue)} ~ {valueDate(maxValue)}</span>
        </div>

        <MiniRail
          fullMinValue={fullMinValue}
          fullMaxValue={fullMaxValue}
          markers={miniMarkers}
          windowLeftPercent={windowLeftPercent}
          windowWidthPercent={windowWidthPercent}
          miniNowPercent={miniNowPercent}
          miniCurrentPercent={miniCurrentPercent}
          isWindowFull={zoom === "all"}
          onJump={(value) => setDraftValue(value)}
        />
      </div>
    </section>
  );
}

function RailButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="nd-transition-state grid size-9 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      {props.children}
    </button>
  );
}

interface MiniRailProps {
  fullMinValue: number;
  fullMaxValue: number;
  markers: ChangeSetSummary[];
  windowLeftPercent: number;
  windowWidthPercent: number;
  miniNowPercent: number | null;
  miniCurrentPercent: number;
  isWindowFull: boolean;
  onJump: (value: number) => void;
}

function MiniRail({
  fullMinValue,
  fullMaxValue,
  markers,
  windowLeftPercent,
  windowWidthPercent,
  miniNowPercent,
  miniCurrentPercent,
  isWindowFull,
  onJump,
}: MiniRailProps) {
  const span = Math.max(fullMaxValue - fullMinValue, 1);

  const handleJumpFromEvent = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    onJump(Math.round(fullMinValue + span * clamped));
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onJump(Math.round(fullMinValue + span / 2));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="全量时间轴，点击或按 Enter 跳转"
      onClick={handleJumpFromEvent}
      onKeyDown={handleKey}
      className="nd-transition-state relative mt-2 h-5 w-full cursor-pointer overflow-hidden border border-border bg-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      style={{
        backgroundImage:
          "repeating-linear-gradient(90deg, hsl(var(--border)) 0 1px, transparent 1px 9px)",
      }}
    >
      <div
        aria-hidden
        className={cn(
          "nd-transition-state absolute inset-y-0 z-10 border border-foreground bg-foreground/10",
          isWindowFull && "opacity-40"
        )}
        style={{
          left: `${windowLeftPercent}%`,
          width: `${Math.max(windowWidthPercent, 1)}%`,
        }}
      />

      {markers.map((item) => {
        const left = ((dateValue(item.applied_at!) - fullMinValue) / span) * 100;
        if (left < 0 || left > 100) return null;
        return (
          <span
            key={item.id}
            aria-hidden
            className="absolute top-1/2 z-20 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/45"
            style={{ left: `${left}%` }}
          />
        );
      })}

      {miniNowPercent !== null && (
        <span
          aria-hidden
          title="Now"
          className="absolute inset-y-0 z-30 w-px -translate-x-1/2 bg-foreground"
          style={{ left: `${miniNowPercent}%` }}
        />
      )}

      <span
        aria-hidden
        className="absolute inset-y-0 z-30 w-px -translate-x-1/2 bg-[var(--color-status-info)]"
        style={{ left: `${miniCurrentPercent}%` }}
      />
    </div>
  );
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

function timelineDates(changesets: ChangeSetSummary[]) {
  const dates = changesets
    .map((item) => (item.applied_at ?? item.created_at).slice(0, 10))
    .concat(todayInputValue())
    .sort();
  return [dates[0], dates.at(-1)].filter(Boolean) as string[];
}

function dateValue(date: string) {
  const head = date.slice(0, 10);
  const [year, month, day] = head.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function valueDate(value: number) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

function markerLeft(date: string, min: number, max: number) {
  return ((dateValue(date.slice(0, 10)) - min) / (max - min)) * 100;
}

function markerLeftClamped(date: string, min: number, max: number) {
  return Math.min(Math.max(markerLeft(date, min, max), 0), 100);
}

function isDateInRange(date: string, min: number, max: number) {
  const value = dateValue(date.slice(0, 10));
  return value >= min && value <= max;
}

function zoomWindowDays(zoom: Zoom) {
  if (zoom === "month") return 31;
  if (zoom === "quarter") return 92;
  if (zoom === "year") return 366;
  return null;
}

function zoomBounds(current: number, fullMin: number, fullMax: number, windowDays: number | null) {
  if (windowDays === null) return [fullMin, Math.max(fullMax, fullMin + 1)];
  const half = Math.floor(windowDays / 2);
  return [current - half, current + half];
}

function panDays(zoom: Zoom) {
  if (zoom === "month") return 7;
  if (zoom === "quarter") return 30;
  return 90;
}

function nextZoom(zoom: Zoom) {
  if (zoom === "all") return "year";
  if (zoom === "year") return "quarter";
  return "month";
}

function prevZoom(zoom: Zoom) {
  if (zoom === "month") return "quarter";
  if (zoom === "quarter") return "year";
  return "all";
}

interface StageBucket {
  create: number;
  update: number;
  terminate: number;
  total: number;
}

function buildStageBuckets(
  changesets: ChangeSetSummary[],
  minValue: number,
  maxValue: number,
  bucketCount: number
): StageBucket[] {
  const buckets: StageBucket[] = Array.from({ length: bucketCount }, () => ({
    create: 0,
    update: 0,
    terminate: 0,
    total: 0,
  }));
  const span = Math.max(maxValue - minValue, 1);
  for (const item of changesets) {
    if (!item.applied_at) continue;
    const value = dateValue(item.applied_at);
    if (!Number.isFinite(value)) continue;
    if (value < minValue || value > maxValue) continue;
    const ratio = (value - minValue) / span;
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)));
    const counts = item.action_counts ?? {};
    const create = counts.create ?? 0;
    const update = counts.update ?? 0;
    const terminate = counts.terminate ?? 0;
    buckets[idx].create += create;
    buckets[idx].update += update;
    buckets[idx].terminate += terminate;
    buckets[idx].total += create + update + terminate || item.entry_count || 1;
  }
  return buckets;
}

interface StagePaths {
  create: string | null;
  update: string | null;
  terminate: string | null;
  outline: string | null;
}

function buildStagePaths(buckets: StageBucket[], height: number): StagePaths {
  if (buckets.length === 0) return { create: null, update: null, terminate: null, outline: null };
  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const stepX = 1000 / Math.max(buckets.length - 1, 1);
  const baseY = height - 1;
  const usable = height - 6;

  const layers = ["terminate", "update", "create"] as const;
  const cumulative = buckets.map(() => 0);
  const result: Record<(typeof layers)[number], string | null> = {
    create: null,
    update: null,
    terminate: null,
  };

  for (const layer of layers) {
    const top = buckets.map((b, i) => {
      cumulative[i] += b[layer];
      return baseY - (cumulative[i] / peak) * usable;
    });
    const bottom = buckets.map((b, i) => {
      const above = cumulative[i] - b[layer];
      return baseY - (above / peak) * usable;
    });
    let path = `M 0 ${bottom[0].toFixed(2)}`;
    for (let i = 0; i < buckets.length; i++) {
      path += ` L ${(i * stepX).toFixed(2)} ${top[i].toFixed(2)}`;
    }
    for (let i = buckets.length - 1; i >= 0; i--) {
      path += ` L ${(i * stepX).toFixed(2)} ${bottom[i].toFixed(2)}`;
    }
    path += " Z";
    result[layer] = path;
  }

  const outlineTop = buckets.map((b) => baseY - (b.total / peak) * usable);
  let outline = `M 0 ${outlineTop[0].toFixed(2)}`;
  for (let i = 1; i < buckets.length; i++) {
    outline += ` L ${(i * stepX).toFixed(2)} ${outlineTop[i].toFixed(2)}`;
  }

  return { ...result, outline };
}

interface PeriodTick {
  label: string;
  percent: number;
}

function buildPeriodTicks(minValue: number, maxValue: number): PeriodTick[] {
  const span = maxValue - minValue;
  if (span <= 0) return [];
  const minDate = new Date(minValue * DAY_MS);
  const maxDate = new Date(maxValue * DAY_MS);
  const minYear = minDate.getUTCFullYear();
  const maxYear = maxDate.getUTCFullYear();
  const yearSpan = maxYear - minYear;
  const ticks: PeriodTick[] = [];
  const useQuarter = span < 400;
  if (useQuarter) {
    const minQuarter = Math.floor(minDate.getUTCMonth() / 3);
    let year = minYear;
    let quarter = minQuarter;
    for (let i = 0; i < 16; i++) {
      const tickDate = Date.UTC(year, quarter * 3, 1) / DAY_MS;
      if (tickDate > maxValue) break;
      if (tickDate >= minValue) {
        ticks.push({
          label: `${year}Q${quarter + 1}`,
          percent: ((tickDate - minValue) / span) * 100,
        });
      }
      quarter += 1;
      if (quarter >= 4) {
        quarter = 0;
        year += 1;
      }
    }
  } else {
    const stride = yearSpan > 8 ? Math.ceil(yearSpan / 6) : 1;
    for (let year = minYear; year <= maxYear; year += stride) {
      const tickDate = Date.UTC(year, 0, 1) / DAY_MS;
      if (tickDate < minValue || tickDate > maxValue) continue;
      ticks.push({
        label: String(year),
        percent: ((tickDate - minValue) / span) * 100,
      });
    }
  }
  return ticks.slice(0, 12);
}

interface ActionTotals {
  create: number;
  update: number;
  terminate: number;
  total: number;
}

function sumActionCounts(items: ChangeSetSummary[]): ActionTotals {
  const totals: ActionTotals = { create: 0, update: 0, terminate: 0, total: 0 };
  for (const item of items) {
    const counts = item.action_counts ?? {};
    totals.create += counts.create ?? 0;
    totals.update += counts.update ?? 0;
    totals.terminate += counts.terminate ?? 0;
  }
  totals.total = totals.create + totals.update + totals.terminate;
  return totals;
}

function formatHeroDate(date: string) {
  const [year, month, day] = date.split("-");
  return { year: year ?? "----", month: month ?? "--", day: day ?? "--" };
}

function HeroStateBadge({ label }: { label: string }) {
  const tone =
    label === "LIVE"
      ? "border-foreground bg-foreground text-background"
      : label === "FUTURE"
        ? "border-[var(--color-status-modified)] text-[var(--color-status-modified)]"
        : "border-border text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 border px-1.5 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.12em]",
        tone
      )}
    >
      {label === "LIVE" && <span aria-hidden className="size-1.5 rounded-full bg-[var(--color-status-new)]" />}
      {label}
    </span>
  );
}

function ActionLegend({ totals }: { totals: ActionTotals }) {
  return (
    <div className="hidden items-center gap-3 font-mono text-[11px] tabular sm:flex">
      <LegendItem color="var(--color-status-new)" label="create" value={totals.create} />
      <LegendItem color="var(--color-status-modified)" label="update" value={totals.update} />
      <LegendItem color="var(--color-status-terminated)" label="terminate" value={totals.terminate} />
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span aria-hidden className="size-2" style={{ background: color }} />
      <span className="uppercase tracking-[0.08em]">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

function PeriodTickRow({
  ticks,
  minValue,
  maxValue,
}: {
  ticks: PeriodTick[];
  minValue: number;
  maxValue: number;
}) {
  return (
    <div className="relative h-4 w-full">
      <span className="absolute left-0 top-0 text-[11px] text-muted-foreground">{valueDate(minValue)}</span>
      {ticks.map((tick) => (
        <span
          key={`${tick.label}-${tick.percent}`}
          className="absolute top-0 -translate-x-1/2 border-l border-dashed border-border pl-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
          style={{ left: `${tick.percent}%`, paddingTop: "0px" }}
        >
          {tick.label}
        </span>
      ))}
      <span className="absolute right-0 top-0 text-[11px] text-muted-foreground">{valueDate(maxValue)}</span>
    </div>
  );
}

function HeroDate({ parts }: { parts: { year: string; month: string; day: string } }) {
  return (
    <div className="flex shrink-0 items-baseline gap-1 font-mono text-[28px] font-bold leading-none tracking-[0.12em] text-foreground sm:text-[32px]" style={{ fontFamily: "var(--font-dot, 'Doto', 'Space Mono', monospace)" }}>
      <span>{parts.year}</span>
      <span className="text-muted-foreground">.</span>
      <span>{parts.month}</span>
      <span className="text-muted-foreground">.</span>
      <span>{parts.day}</span>
    </div>
  );
}
