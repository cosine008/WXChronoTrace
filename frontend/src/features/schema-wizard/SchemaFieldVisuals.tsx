import type { ReactNode } from "react";

import type { FieldConfig, FieldType } from "@/api/schemas";
import { cn } from "@/lib/utils";
import { fieldTypeLabel } from "./schemaWizardState";

type FieldTypeTone = "text" | "number" | "time" | "choice" | "entity" | "file" | "logic";

type FieldTypeMeta = {
  code: string;
  label: string;
  tone: FieldTypeTone;
};

const FIELD_TYPE_META: Record<FieldType, Omit<FieldTypeMeta, "label">> = {
  text: { code: "TXT", tone: "text" },
  longtext: { code: "LONG", tone: "text" },
  markdown: { code: "MD", tone: "text" },
  number: { code: "NUM", tone: "number" },
  date: { code: "DATE", tone: "time" },
  datetime: { code: "TIME", tone: "time" },
  boolean: { code: "BOOL", tone: "choice" },
  enum: { code: "ENUM", tone: "choice" },
  "multi-enum": { code: "SET", tone: "choice" },
  person: { code: "USER", tone: "entity" },
  reference: { code: "REF", tone: "entity" },
  "auto-number": { code: "AUTO", tone: "logic" },
  attachment: { code: "FILE", tone: "file" },
  image: { code: "IMG", tone: "file" },
  formula: { code: "FX", tone: "logic" },
};

const TYPE_RAIL_CLASS: Record<FieldTypeTone, string> = {
  text: "bg-foreground",
  number: "bg-[var(--color-status-info)]",
  time: "bg-[var(--color-status-modified)]",
  choice: "bg-[var(--color-status-new)]",
  entity: "bg-[var(--color-status-info)]",
  file: "bg-muted-foreground",
  logic: "bg-[var(--color-status-modified)]",
};

const STATUS_TONE_CLASS = {
  normal: "bg-muted-foreground",
  required: "bg-[var(--color-status-error)]",
  indexed: "bg-[var(--color-status-info)]",
  sensitive: "bg-[var(--color-status-modified)]",
  deprecated: "bg-[var(--color-status-error)]",
  hidden: "bg-muted-foreground",
  system: "bg-foreground",
} as const;

type FieldStatusTone = keyof typeof STATUS_TONE_CLASS;

type FieldStatusToken = {
  code: string;
  label: string;
  active: boolean;
  tone: FieldStatusTone;
};

export function SchemaFieldRow(props: {
  field: FieldConfig;
  index?: number;
  active?: boolean;
  prefix?: ReactNode;
  actions?: ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  const meta = fieldTypeMeta(props.field.type);
  return (
    <div
      className={cn(
        "nd-interactive-row grid min-w-0 gap-2 px-3 py-3 text-left text-sm md:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_auto] md:items-center",
        props.active && "nd-active-row bg-accent",
        props.className
      )}
    >
      <button
        type="button"
        onClick={props.onSelect}
        disabled={!props.onSelect}
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-left disabled:cursor-default"
      >
        <span className="flex min-w-0 items-center gap-2">
          {props.prefix}
          <FieldTypeMarker type={props.field.type} />
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            {props.index !== undefined && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {String(props.index + 1).padStart(2, "0")}
              </span>
            )}
            <span className="truncate font-medium text-foreground">{props.field.label}</span>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="max-w-full truncate font-mono">{props.field.key}</span>
            <span>{meta.label}</span>
          </span>
        </span>
      </button>
      <FieldStateStrip field={props.field} className="md:justify-end" />
      {props.actions && <div className="flex items-center gap-1 md:justify-end">{props.actions}</div>}
    </div>
  );
}

export function FieldTypeMarker(props: { type: FieldType; className?: string }) {
  const meta = fieldTypeMeta(props.type);
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-grid h-7 min-w-[3.75rem] shrink-0 grid-cols-[3px_minmax(0,1fr)] overflow-hidden border border-border bg-background",
        props.className
      )}
    >
      <span className={cn("w-[3px]", TYPE_RAIL_CLASS[meta.tone])} aria-hidden />
      <span className="grid place-items-center px-2 font-mono text-[10px] uppercase text-foreground">
        {meta.code}
      </span>
    </span>
  );
}

export function FieldStateStrip(props: { field: FieldConfig; className?: string }) {
  const tokens = fieldStatusTokens(props.field).filter((token) => token.active);
  const visibleTokens: FieldStatusToken[] =
    tokens.length > 0
      ? tokens
      : [{ code: "OPT", label: "可选", active: true, tone: "normal" }];
  return (
    <span
      className={cn("flex min-w-0 flex-wrap items-center gap-1", props.className)}
      aria-label={visibleTokens.map((token) => token.label).join("、")}
    >
      {visibleTokens.map((token) => (
        <FieldStateToken key={token.code} token={token} />
      ))}
    </span>
  );
}

function FieldStateToken({ token }: { token: FieldStatusToken }) {
  return (
    <span
      title={token.label}
      className="inline-grid h-5 max-w-full grid-cols-[2px_minmax(0,auto)] overflow-hidden border border-border bg-background text-[10px]"
    >
      <span className={cn("w-0.5", STATUS_TONE_CLASS[token.tone])} aria-hidden />
      <span className="px-1.5 font-mono uppercase text-muted-foreground">{token.code}</span>
    </span>
  );
}

function fieldStatusTokens(field: FieldConfig): FieldStatusToken[] {
  return [
    { code: "REQ", label: "必填", active: Boolean(field.required), tone: "required" },
    { code: "IDX", label: "索引", active: Boolean(field.indexed), tone: "indexed" },
    { code: "MASK", label: "敏感字段", active: Boolean(field.sensitive), tone: "sensitive" },
    { code: "DEPR", label: "已废弃", active: Boolean(field.deprecated), tone: "deprecated" },
    { code: "HID", label: "隐藏字段", active: Boolean(field.hidden), tone: "hidden" },
    { code: "SYS", label: "系统字段", active: Boolean(field.system), tone: "system" },
  ];
}

function fieldTypeMeta(type: FieldType): FieldTypeMeta {
  const meta = FIELD_TYPE_META[type] ?? FIELD_TYPE_META.text;
  return {
    ...meta,
    label: fieldTypeLabel(type),
  };
}
