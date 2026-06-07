import { ArrowRight, CalendarDays, GitBranch } from "lucide-react";
import { Link } from "react-router-dom";

import type { DataSchema } from "@/api/schemas";

import type { StatsFlow } from "./flowBoardTypes";

interface Props {
  schema: DataSchema;
  leftAt: string;
  rightAt: string;
  dimension: StatsFlow["dimension"]["kind"];
  availableDimensions: Array<StatsFlow["dimension"]["kind"]>;
  currentViewTo: string;
  snapshotDiffTo: string | null;
  onDates: (leftAt: string, rightAt: string) => void;
  onDimension: (next: StatsFlow["dimension"]["kind"]) => void;
}

const DIMENSION_OPTIONS: Array<{ value: StatsFlow["dimension"]["kind"]; label: string }> = [
  { value: "status", label: "状态" },
  { value: "department", label: "部门" },
  { value: "labels", label: "标签" },
];

export function FlowBoardToolbar(props: Props) {
  return (
    <section className="grid gap-4 border-b border-border px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 border border-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <GitBranch className="size-3.5" aria-hidden />
            Flow Board
          </div>
          <div className="mt-2">
            <h1 className="truncate text-base font-semibold text-foreground">{props.schema.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{props.schema.schema_code}</span>
              <span>schema #{props.schema.id}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={props.currentViewTo}
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4 rotate-180" aria-hidden />
            Current View
          </Link>
          {props.snapshotDiffTo ? (
            <Link
              to={props.snapshotDiffTo}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              <GitBranch className="size-4" aria-hidden />
              Snapshot Diff
            </Link>
          ) : (
            <span className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground/60">
              <GitBranch className="size-4" aria-hidden />
              Snapshot Diff
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div
          className="grid w-full grid-cols-3 border border-border bg-background p-0.5 sm:inline-grid sm:w-auto"
          aria-label="Flow dimension"
        >
          {DIMENSION_OPTIONS.map((option) => {
            const active = props.dimension === option.value;
            const available = props.availableDimensions.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={!available}
                onClick={() => props.onDimension(option.value)}
                className={
                  active
                    ? "h-9 min-w-0 px-3 text-sm bg-foreground text-background"
                    : !available
                      ? "h-9 min-w-0 px-3 text-sm text-muted-foreground/40"
                    : "h-9 min-w-0 px-3 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <label className="inline-flex h-10 items-center gap-2 border border-border px-3 text-sm">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Left</span>
          <input
            type="date"
            value={props.leftAt}
            onChange={(event) => props.onDates(event.target.value, props.rightAt)}
            className="w-[9.5rem] bg-transparent text-foreground outline-none"
          />
        </label>

        <div className="inline-flex h-10 items-center justify-center text-muted-foreground">
          <ArrowRight className="size-4" aria-hidden />
        </div>

        <label className="inline-flex h-10 items-center gap-2 border border-border px-3 text-sm">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Right</span>
          <input
            type="date"
            value={props.rightAt}
            onChange={(event) => props.onDates(props.leftAt, event.target.value)}
            className="w-[9.5rem] bg-transparent text-foreground outline-none"
          />
        </label>
      </div>
    </section>
  );
}
