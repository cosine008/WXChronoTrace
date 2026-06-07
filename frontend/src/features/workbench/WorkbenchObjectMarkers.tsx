import type { ReactNode } from "react";
import {
  Database,
  FileText,
  Loader2,
  Paperclip,
  Pin,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import type { WorkbenchItemType } from "@/api/workbench";
import { cn } from "@/lib/utils";

type WorkbenchStatusTone = "neutral" | "info" | "success" | "warning" | "danger";
type WorkbenchRiskKind = "pinned" | "sensitive" | "saving" | "preview";

const KIND_META: Record<
  WorkbenchItemType,
  { label: string; code: string; icon: LucideIcon; border: string; bay: string }
> = {
  data_card: {
    label: "资料",
    code: "KV",
    icon: Database,
    border: "border-[var(--color-status-info)]/70",
    bay: "bg-[var(--color-status-info)]/10",
  },
  note: {
    label: "笔记",
    code: "DOC",
    icon: FileText,
    border: "border-[var(--color-status-new)]/70",
    bay: "bg-[var(--color-status-new)]/10",
  },
  material: {
    label: "材料",
    code: "FILE",
    icon: Paperclip,
    border: "border-[var(--color-status-modified)]/75",
    bay: "bg-[var(--color-status-modified)]/10",
  },
};

const STATUS_TONE_CLASSES: Record<WorkbenchStatusTone, string> = {
  neutral: "border-border text-muted-foreground",
  info: "border-[var(--color-status-info)]/70 text-foreground",
  success: "border-[var(--color-status-new)]/70 text-foreground",
  warning: "border-[var(--color-status-modified)]/80 text-foreground",
  danger: "border-[var(--color-status-error)]/80 text-foreground",
};

const STATUS_BAY_CLASSES: Record<WorkbenchStatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-[var(--color-status-info)]/10 text-foreground",
  success: "bg-[var(--color-status-new)]/10 text-foreground",
  warning: "bg-[var(--color-status-modified)]/12 text-foreground",
  danger: "bg-[var(--color-status-error)]/10 text-foreground",
};

export function WorkbenchKindMarker(props: {
  type: WorkbenchItemType;
  detail?: ReactNode;
  className?: string;
}) {
  const meta = KIND_META[props.type];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-grid h-7 max-w-full grid-cols-[auto_minmax(0,1fr)] items-stretch overflow-hidden border bg-background text-[13px]",
        meta.border,
        props.className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 border-r border-current px-1.5 font-mono text-[11px] uppercase tracking-[0.08em]",
          meta.bay
        )}
      >
        <Icon className="size-3" aria-hidden />
        {meta.code}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5 px-2">
        <span className="shrink-0 font-medium text-foreground">{meta.label}</span>
        {props.detail ? (
          <span className="min-w-0 truncate text-muted-foreground">{props.detail}</span>
        ) : null}
      </span>
    </span>
  );
}

export function WorkbenchStatusTag(props: {
  label: ReactNode;
  code?: string;
  tone?: WorkbenchStatusTone;
  className?: string;
}) {
  const tone = props.tone ?? "neutral";

  return (
    <span
      className={cn(
        "inline-grid h-6 max-w-full grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden border bg-background text-xs",
        STATUS_TONE_CLASSES[tone],
        props.className
      )}
    >
      {props.code ? (
        <span
          className={cn(
            "h-full border-r border-current px-1.5 font-mono text-[10px] uppercase tracking-[0.08em]",
            "inline-flex items-center",
            STATUS_BAY_CLASSES[tone]
          )}
        >
          {props.code}
        </span>
      ) : null}
      <span className="min-w-0 truncate px-1.5">{props.label}</span>
    </span>
  );
}

export function WorkbenchRiskTag(props: {
  kind: WorkbenchRiskKind;
  label?: string;
  className?: string;
}) {
  const meta = riskMeta(props.kind);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 border px-1.5 font-mono text-[11px] uppercase tracking-[0.08em]",
        meta.className,
        props.className
      )}
    >
      <Icon className={cn("size-3", props.kind === "saving" && "animate-spin")} aria-hidden />
      {props.label ?? meta.label}
    </span>
  );
}

export function WorkbenchSignalRail(props: {
  pinned?: boolean;
  sensitive?: boolean;
  saving?: boolean;
  preview?: boolean;
  className?: string;
}) {
  if (!props.pinned && !props.sensitive && !props.saving && !props.preview) return null;

  return (
    <div className={cn("flex min-h-7 shrink-0 flex-wrap items-center gap-1 sm:justify-end", props.className)}>
      {props.pinned ? <WorkbenchRiskTag kind="pinned" /> : null}
      {props.sensitive ? <WorkbenchRiskTag kind="sensitive" /> : null}
      {props.saving ? <WorkbenchRiskTag kind="saving" /> : null}
      {props.preview ? <WorkbenchRiskTag kind="preview" /> : null}
    </div>
  );
}

function riskMeta(kind: WorkbenchRiskKind): {
  label: string;
  icon: LucideIcon;
  className: string;
} {
  if (kind === "sensitive") {
    return {
      label: "敏感",
      icon: ShieldAlert,
      className: "border-[var(--color-status-error)] text-[var(--color-status-error)]",
    };
  }
  if (kind === "saving") {
    return {
      label: "保存中",
      icon: Loader2,
      className: "border-[var(--color-status-info)] text-foreground",
    };
  }
  if (kind === "preview") {
    return {
      label: "预览",
      icon: Paperclip,
      className: "border-[var(--color-status-info)] text-foreground",
    };
  }
  return {
    label: "固定",
    icon: Pin,
    className: "border-dashed border-border text-muted-foreground",
  };
}
