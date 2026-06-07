import { cn } from "@/lib/utils";
import {
  Crown,
  Eye,
  Globe2,
  LockKeyhole,
  Network,
  PencilLine,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Role = "owner" | "editor" | "viewer" | "admin";
type Visibility = "private" | "shared" | "public";
type PermissionTagSize = "xs" | "sm";

const ROLE: Record<
  Role,
  {
    label: string;
    code: string;
    icon: LucideIcon;
    className: string;
    rail: string;
    iconClassName: string;
  }
> = {
  owner: {
    label: "主人",
    code: "OWN",
    icon: Crown,
    className: "border-foreground text-foreground",
    rail: "bg-foreground",
    iconClassName: "text-background",
  },
  editor: {
    label: "编辑",
    code: "EDIT",
    icon: PencilLine,
    className: "border-border text-foreground",
    rail: "bg-muted-foreground",
    iconClassName: "text-background",
  },
  viewer: {
    label: "只读",
    code: "VIEW",
    icon: Eye,
    className: "border-border text-muted-foreground",
    rail: "bg-border",
    iconClassName: "text-foreground",
  },
  admin: {
    label: "管理员",
    code: "ADM",
    icon: ShieldCheck,
    className: "border-[var(--color-status-info)] text-[var(--color-status-info)]",
    rail: "bg-[var(--color-status-info)]",
    iconClassName: "text-background",
  },
};

const VIS: Record<
  Visibility,
  { label: string; code: string; icon: LucideIcon; className: string; shape: string }
> = {
  private: {
    label: "私有",
    code: "LOCK",
    icon: LockKeyhole,
    className: "border-border text-muted-foreground",
    shape: "border-solid",
  },
  shared: {
    label: "共享",
    code: "NET",
    icon: Network,
    className: "border-[var(--color-status-info)] text-[var(--color-status-info)]",
    shape: "border-dashed",
  },
  public: {
    label: "公共",
    code: "PUB",
    icon: Globe2,
    className: "border-[var(--color-status-new)] text-[var(--color-status-new)]",
    shape: "border-double",
  },
};

interface Props {
  role?: Role;
  visibility?: Visibility;
  size?: PermissionTagSize;
  className?: string;
}

/** 用户角色 / 表可见性标。对照 SRS 7.4.2 */
export function PermissionTag({ role, visibility, size = "sm", className }: Props) {
  const compact = size === "xs";

  if (role) {
    const cfg = ROLE[role];
    const Icon = cfg.icon;
    return (
      <span
        title={`角色：${cfg.label}`}
        className={cn(
          "inline-grid grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden rounded-sm border bg-card text-xs font-medium",
          compact ? "h-6" : "h-7",
          cfg.className,
          className
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid h-full place-items-center border-r border-current/30 px-1.5",
            cfg.rail
          )}
        >
          <Icon className={cn(compact ? "size-3" : "size-3.5", cfg.iconClassName)} />
        </span>
        <span className={cn("flex min-w-0 items-baseline gap-1 px-2", compact && "px-1.5")}>
          <span className="font-mono text-[10px] font-semibold tabular">{cfg.code}</span>
          <span className="truncate">{cfg.label}</span>
        </span>
      </span>
    );
  }
  if (visibility) {
    const cfg = VIS[visibility];
    const Icon = cfg.icon;
    return (
      <span
        title={`可见性：${cfg.label}`}
        className={cn(
          "inline-grid grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden rounded-sm border bg-card text-xs font-medium",
          compact ? "h-6" : "h-7",
          cfg.className,
          cfg.shape,
          className
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid h-full place-items-center border-r border-current/30 px-1.5",
            cfg.shape
          )}
        >
          <Icon className={compact ? "size-3" : "size-3.5"} />
        </span>
        <span className={cn("flex min-w-0 items-baseline gap-1 px-2", compact && "px-1.5")}>
          <span className="font-mono text-[10px] font-semibold tabular">{cfg.code}</span>
          <span className="truncate">{cfg.label}</span>
        </span>
      </span>
    );
  }
  return null;
}
