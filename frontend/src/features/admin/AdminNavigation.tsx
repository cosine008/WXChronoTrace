import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheck,
  Database,
  Download,
  House,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

type AdminNavItem = {
  to: string;
  label: string;
  Icon: LucideIcon;
};

const HOME_NAV_ITEM: AdminNavItem = { to: "/", label: "回到主页", Icon: House };

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin", label: "总览", Icon: ShieldCheck },
  { to: "/admin/users", label: "账号管理", Icon: Users },
  { to: "/admin/schemas", label: "表资产", Icon: Database },
  { to: "/admin/exports", label: "导出中心", Icon: Download },
  { to: "/admin/changesets", label: "全局审批", Icon: ClipboardCheck },
  { to: "/audit-logs/sensitive", label: "敏感审计", Icon: ScrollText },
];

export function AdminNavigation({ className }: { className?: string }) {
  const location = useLocation();

  return (
    <nav
      aria-label="管理后台功能导航"
      className={cn("min-w-0 overflow-hidden border-b border-border pb-3", className)}
    >
      <div className="flex min-w-0 flex-wrap gap-2">
        <Link
          to={HOME_NAV_ITEM.to}
          aria-label={HOME_NAV_ITEM.label}
          title={HOME_NAV_ITEM.label}
          className="inline-flex h-9 min-w-0 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <HOME_NAV_ITEM.Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{HOME_NAV_ITEM.label}</span>
        </Link>
        {ADMIN_NAV_ITEMS.map(({ to, label, Icon }) => {
          const active = isAdminPathActive(location.pathname, to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 min-w-0 items-center gap-2 border px-3 text-sm transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function isAdminPathActive(pathname: string, target: string) {
  const currentPath = normalizePath(pathname);
  const targetPath = normalizePath(target);
  if (targetPath === "/admin") return currentPath === "/admin";
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function normalizePath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}
