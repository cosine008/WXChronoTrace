import { cn } from "@/lib/utils";

export type AuditEventKind =
  | "auth"
  | "export"
  | "schema"
  | "data"
  | "permission"
  | "label"
  | "admin"
  | "sensitive"
  | "system";

type AuditRisk = "normal" | "sensitive" | "high";

const EVENT_CONFIG: Record<
  AuditEventKind,
  { label: string; code: string; className: string; shape: string }
> = {
  auth: {
    label: "登录",
    code: "AUTH",
    className: "border-[var(--color-status-info)] text-[var(--color-status-info)]",
    shape: "border-solid",
  },
  export: {
    label: "导出",
    code: "EXP",
    className: "border-[var(--color-status-modified)] text-[var(--color-status-modified)]",
    shape: "border-dashed",
  },
  schema: {
    label: "表结构",
    code: "SCH",
    className: "border-foreground text-foreground",
    shape: "border-solid",
  },
  data: {
    label: "数据",
    code: "DATA",
    className: "border-[var(--color-status-new)] text-[var(--color-status-new)]",
    shape: "border-solid",
  },
  permission: {
    label: "权限",
    code: "PERM",
    className: "border-[var(--color-status-info)] text-[var(--color-status-info)]",
    shape: "border-double",
  },
  label: {
    label: "标签",
    code: "LBL",
    className: "border-foreground text-foreground",
    shape: "border-dashed",
  },
  admin: {
    label: "管理",
    code: "ADM",
    className: "border-[var(--color-status-error)] text-[var(--color-status-error)]",
    shape: "border-double",
  },
  sensitive: {
    label: "敏感",
    code: "SENS",
    className: "border-[var(--color-status-error)] text-[var(--color-status-error)]",
    shape: "border-2",
  },
  system: {
    label: "系统",
    code: "SYS",
    className: "border-border text-muted-foreground",
    shape: "border-solid",
  },
};

interface Props {
  kind?: AuditEventKind;
  risk?: AuditRisk;
  label?: string;
  className?: string;
}

/** 审计事件标记。事件类型是主 marker,敏感风险作为叠加 rail。 */
export function AuditMarker({
  kind = "sensitive",
  risk = kind === "sensitive" ? "sensitive" : "normal",
  label,
  className,
}: Props) {
  const cfg = EVENT_CONFIG[kind];
  const displayLabel = label ?? cfg.label;
  const sensitive = risk === "sensitive" || risk === "high";

  return (
    <span
      title={`审计事件：${displayLabel}${sensitive ? " · 敏感" : ""}`}
      className={cn(
        "inline-grid h-6 grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden rounded-sm border bg-card font-mono text-[10px] uppercase tracking-wider",
        cfg.className,
        cfg.shape,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-full min-w-5 place-items-center border-r border-current px-1 leading-none",
          sensitive && "bg-[var(--color-status-error)] text-white"
        )}
      >
        {sensitive ? "!" : "["}
      </span>
      <span className="flex min-w-0 items-center gap-1 px-1.5">
        <span className="font-semibold">{cfg.code}</span>
        <span className="truncate normal-case tracking-normal">{displayLabel}</span>
        {sensitive && (
          <span className="ml-0.5 border-l border-current pl-1 text-[9px] font-semibold">
            SENSITIVE
          </span>
        )}
      </span>
    </span>
  );
}
