import { useEffect, useState, type ReactNode } from "react";
import { FileSpreadsheet, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { DotMatrix } from "@/components/brand";
import type { ThemeMode } from "@/stores/theme";

export function CreateActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
        创建
      </span>
      <div className="inline-flex h-10 overflow-hidden border border-border bg-background">
        <Link
          to="/schemas/import-from-excel"
          className="inline-flex items-center gap-2 border-r border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <FileSpreadsheet className="size-4" aria-hidden />
          Excel 导入
        </Link>
        <Link
          to="/schemas/new"
          className="inline-flex items-center gap-2 bg-foreground px-4 text-sm text-background hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden />
          新建表
        </Link>
      </div>
    </div>
  );
}

export function DashboardHeroTools() {
  return (
    <div className="grid w-full justify-items-start gap-3 sm:flex sm:items-center sm:justify-between md:w-auto md:grid md:justify-items-end md:gap-2">
      <LiveClock />
      <CreateActions />
    </div>
  );
}

export function HeaderIconLink(props: { to: string; title: string; children: ReactNode }) {
  return (
    <Link
      to={props.to}
      title={props.title}
      className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"
    >
      {props.children}
    </Link>
  );
}

export function SectionLabel(props: { index: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-start justify-between gap-3 sm:items-end">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground">/{props.index}</span>
        <h2 className="font-display text-lg font-semibold tracking-tight">{props.title}</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground max-sm:w-full">
          {props.subtitle}
        </span>
      </div>
      <DotMatrix length={4} intensity={0.18} className="hidden text-[9px] md:block" />
    </div>
  );
}

export function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const date = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = now.toLocaleTimeString("zh-CN", { hour12: false });
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] normal-case tracking-normal text-muted-foreground">
      <span className="text-muted-foreground/80">本地时间</span>
      <span className="tabular text-foreground/80">
        {date} · {time}
      </span>
    </span>
  );
}

export function ThemeSelect(props: { mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  return (
    <select
      value={props.mode}
      onChange={(event) => props.onChange(event.target.value as ThemeMode)}
      className="rounded-sm border border-border bg-transparent px-2 py-1 text-xs"
    >
      <option value="light">浅色</option>
      <option value="dark">暗色</option>
      <option value="auto">跟随</option>
    </select>
  );
}
