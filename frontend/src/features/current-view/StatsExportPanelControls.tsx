import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { TrendUnitParam } from "@/api/stats";

export function ExportButton(props: {
  icon: ReactNode;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.loading}
      onClick={props.onClick}
      className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
    >
      {props.icon}
      {props.label}
    </button>
  );
}

export function ExportLinkButton(props: {
  icon: ReactNode;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={props.to}
      className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      {props.icon}
      {props.label}
    </Link>
  );
}

const TREND_UNIT_OPTIONS: Array<{ value: TrendUnitParam; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
];

export function TrendUnitControl(props: {
  value: TrendUnitParam;
  onChange: (value: TrendUnitParam) => void;
}) {
  return (
    <div className="inline-flex h-8 border border-border text-xs" aria-label="趋势粒度">
      {TREND_UNIT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => props.onChange(option.value)}
          className={`min-w-10 px-2 ${
            props.value === option.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ChartNotice(props: { children: ReactNode; height?: number }) {
  return (
    <div
      className="grid place-items-center text-sm text-muted-foreground"
      style={{ height: props.height ?? 204 }}
    >
      {props.children}
    </div>
  );
}
