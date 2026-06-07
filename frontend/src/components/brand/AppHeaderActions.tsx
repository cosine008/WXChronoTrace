import type { ReactNode } from "react";
import {
  ClipboardCheck,
  FileSpreadsheet,
  Home,
  LogOut,
  ScrollText,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { NotificationBell } from "@/features/notifications/NotificationBell";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore, type ThemeMode } from "@/stores/theme";

export function AppHeaderActions() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const authLoading = useAuthStore((state) => state.loading);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  return (
    <>
      <HeaderActionLink to="/" label="工作台">
        <Home className="size-4" aria-hidden />
      </HeaderActionLink>
      <HeaderActionLink to="/dashboard" label="我的表">
        <FileSpreadsheet className="size-4" aria-hidden />
      </HeaderActionLink>
      <HeaderActionLink to="/approvals" label="待审批">
        <ClipboardCheck className="size-4" aria-hidden />
      </HeaderActionLink>
      <NotificationBell />
      <HeaderActionLink to="/audit-logs" label="审计日志">
        <ScrollText className="size-4" aria-hidden />
      </HeaderActionLink>
      {user?.is_superuser && (
        <HeaderActionLink to="/audit-logs/sensitive" label="敏感操作">
          <ShieldAlert className="size-4" aria-hidden />
        </HeaderActionLink>
      )}
      {user?.is_superuser && (
        <HeaderActionLink to="/admin" label="管理后台">
          <Users className="size-4" aria-hidden />
        </HeaderActionLink>
      )}
      <ThemeModeSelect mode={mode} onChange={setMode} />
      <span className="hidden max-w-32 truncate font-mono tabular text-muted-foreground sm:inline">
        {user?.display_name ?? user?.username}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        disabled={authLoading}
        aria-label="退出"
        title="退出"
        className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden />
      </button>
    </>
  );
}

function HeaderActionLink(props: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={props.to}
      aria-label={props.label}
      title={props.label}
      className="hidden size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground md:grid"
    >
      {props.children}
    </Link>
  );
}

function ThemeModeSelect(props: {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  return (
    <select
      aria-label="主题"
      value={props.mode}
      onChange={(event) => props.onChange(event.target.value as ThemeMode)}
      className="shrink-0 rounded-sm border border-border bg-transparent px-2 py-1 text-xs"
    >
      <option value="light">浅色</option>
      <option value="dark">暗色</option>
      <option value="auto">跟随</option>
    </select>
  );
}
