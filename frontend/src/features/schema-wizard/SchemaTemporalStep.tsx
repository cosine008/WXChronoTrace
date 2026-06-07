import type { PeriodUnit, TemporalMode } from "@/api/schemas";
import { cn } from "@/lib/utils";
import type { WizardState } from "./schemaWizardState";

type Props = {
  state: WizardState;
  onChange: (state: WizardState) => void;
};

const PERIOD_UNITS: Array<{ value: PeriodUnit; label: string; code: string }> = [
  { value: "day", label: "日", code: "D" },
  { value: "week", label: "周", code: "W" },
  { value: "month", label: "月", code: "M" },
  { value: "quarter", label: "季", code: "Q" },
  { value: "half_year", label: "半年", code: "HY" },
  { value: "year", label: "年", code: "Y" },
];

export function SchemaTemporalStep({ state, onChange }: Props) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <TemporalModeCard
          active={state.temporalMode === "continuous"}
          mode="continuous"
          title="连续型"
          code="RAIL"
          summary="按有效期连续追踪实体状态，适合资产、人员、合同、权限等持续变化对象。"
          onSelect={() => onChange({ ...state, temporalMode: "continuous" })}
        />
        <TemporalModeCard
          active={state.temporalMode === "periodic"}
          mode="periodic"
          title="周期型"
          code="GRID"
          summary="按固定周期沉淀快照，适合月报、季度盘点、年度指标等周期性数据。"
          periodUnit={state.periodUnit}
          onSelect={() => onChange({ ...state, temporalMode: "periodic" })}
          onPeriodUnitChange={(periodUnit) =>
            onChange({ ...state, temporalMode: "periodic", periodUnit })
          }
        />
      </div>
      <TemporalDecisionStrip state={state} />
    </div>
  );
}

function TemporalModeCard(props: {
  active: boolean;
  mode: TemporalMode;
  title: string;
  code: string;
  summary: string;
  periodUnit?: PeriodUnit;
  onSelect: () => void;
  onPeriodUnitChange?: (periodUnit: PeriodUnit) => void;
}) {
  return (
    <section
      className={cn(
        "grid min-w-0 gap-4 border bg-background p-4 transition-colors",
        props.active ? "border-foreground" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={props.onSelect}
        aria-pressed={props.active}
        className="grid min-h-28 min-w-0 gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <span className="font-display text-lg font-semibold text-foreground">{props.title}</span>
            <span className="text-sm text-muted-foreground">{props.summary}</span>
          </div>
          <ModeToken code={props.code} active={props.active} />
        </div>
        {props.mode === "continuous" ? (
          <ContinuousRail active={props.active} />
        ) : (
          <PeriodicGrid active={props.active} unit={props.periodUnit ?? "month"} />
        )}
      </button>

      {props.mode === "periodic" && (
        <div className="grid gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">周期单位</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="周期单位">
            {PERIOD_UNITS.map((unit) => (
              <button
                key={unit.value}
                type="button"
                role="radio"
                aria-checked={props.periodUnit === unit.value}
                onClick={() => props.onPeriodUnitChange?.(unit.value)}
                className={cn(
                  "grid min-h-12 gap-0.5 border px-2 py-1.5 text-left outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  props.periodUnit === unit.value && props.active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground"
                )}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]">{unit.code}</span>
                <span className="text-xs">{unit.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ContinuousRail({ active }: { active: boolean }) {
  return (
    <div className="grid gap-3">
      <div className="relative h-14 border border-border bg-muted/30 px-4">
        <div className="absolute left-5 right-5 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div
          className={cn(
            "absolute left-8 right-12 top-1/2 h-1 -translate-y-1/2",
            active ? "bg-foreground" : "bg-muted-foreground/50"
          )}
        />
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              "absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center border bg-background",
              active ? "border-foreground" : "border-border",
              index === 0 && "left-6",
              index === 1 && "left-1/2 -translate-x-1/2",
              index === 2 && "right-10"
            )}
          >
            <span className={cn("block size-2", active ? "bg-foreground" : "bg-muted-foreground")} />
          </span>
        ))}
        <span className="absolute bottom-1 left-5 font-mono text-[10px] text-muted-foreground">
          valid_from
        </span>
        <span className="absolute bottom-1 right-5 font-mono text-[10px] text-muted-foreground">
          valid_to
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span className="border border-border px-2 py-1">开始生效</span>
        <span className="border border-border px-2 py-1">中途修订</span>
        <span className="border border-border px-2 py-1">终止或延续</span>
      </div>
    </div>
  );
}

function PeriodicGrid({ active, unit }: { active: boolean; unit: PeriodUnit }) {
  const shape = periodGridShape(unit);
  return (
    <div className="grid gap-3">
      <div
        className={cn(
          "grid gap-1 border border-border bg-muted/30 p-3",
          shape.columns === 7 ? "grid-cols-7" : "grid-cols-4"
        )}
      >
        {Array.from({ length: shape.cells }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-6 border bg-background",
              active && index % 3 === 0 ? "border-foreground bg-foreground" : "border-border"
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span className="border border-border px-2 py-1">周期起点</span>
        <span className="border border-border px-2 py-1">快照格</span>
        <span className="border border-border px-2 py-1">汇总口径</span>
      </div>
    </div>
  );
}

function periodGridShape(unit: PeriodUnit) {
  if (unit === "day") return { cells: 14, columns: 7 };
  if (unit === "quarter") return { cells: 8, columns: 4 };
  if (unit === "half_year") return { cells: 6, columns: 4 };
  if (unit === "year") return { cells: 4, columns: 4 };
  return { cells: 12, columns: 4 };
}

function TemporalDecisionStrip({ state }: { state: WizardState }) {
  return (
    <div className="grid gap-2 border border-border bg-card p-3 text-xs sm:grid-cols-3">
      <DecisionToken code="MODE" label={state.temporalMode === "continuous" ? "连续型" : "周期型"} />
      <DecisionToken
        code="UNIT"
        label={state.temporalMode === "periodic" ? periodUnitLabel(state.periodUnit) : "不需要周期"}
      />
      <DecisionToken
        code="QUERY"
        label={state.temporalMode === "continuous" ? "按日期合成当前视图" : "按周期读取快照"}
      />
    </div>
  );
}

function ModeToken({ code, active }: { code: string; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center border px-2 font-mono text-[11px] uppercase tracking-[0.12em]",
        active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
      )}
    >
      {code}
    </span>
  );
}

function DecisionToken({ code, label }: { code: string; label: string }) {
  return (
    <span className="inline-grid h-7 max-w-full grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden border border-border bg-background">
      <span className="h-full border-r border-border px-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {code}
      </span>
      <span className="min-w-0 truncate px-2">{label}</span>
    </span>
  );
}

function periodUnitLabel(value: PeriodUnit) {
  return {
    day: "日",
    week: "周",
    month: "月",
    quarter: "季度",
    half_year: "半年",
    year: "年",
  }[value];
}
