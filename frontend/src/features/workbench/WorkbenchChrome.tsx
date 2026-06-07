import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { HeroBanner } from "@/components/brand";
import {
  LiveClock,
  SectionLabel,
} from "@/features/dashboard/DashboardChrome";
import { cn } from "@/lib/utils";

interface WorkbenchChromeProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}

interface WorkbenchSectionProps {
  index: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

interface WorkbenchPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  meta?: Array<{ label: string; value: string }>;
  note?: string;
}

const WORKBENCH_TABS = [
  { label: "概览", to: "/workbench" },
  { label: "我的资料", to: "/workbench/data-cards" },
  { label: "我的笔记", to: "/workbench/notes" },
  { label: "我的材料", to: "/workbench/materials" },
  { label: "回收站", to: "/workbench/trash" },
] as const;

export function WorkbenchChrome(props: WorkbenchChromeProps) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid min-w-0 max-w-7xl gap-5 overflow-x-hidden px-4 py-5 sm:gap-6 sm:p-6">
        <HeroBanner
          eyebrow="WORKBENCH / 我的工作台"
          title={props.title}
          subtitle={props.subtitle}
          meta={props.meta}
          action={props.action ?? <LiveClock />}
        />
        <WorkbenchTabs />
        {props.children}
      </main>
    </div>
  );
}

export function WorkbenchSection(props: WorkbenchSectionProps) {
  return (
    <section className="grid min-w-0 gap-4">
      <SectionLabel
        index={props.index}
        title={props.title}
        subtitle={props.subtitle}
      />
      <WorkbenchSurface>{props.children}</WorkbenchSurface>
    </section>
  );
}

export function WorkbenchSurface(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "nd-interactive-surface min-w-0 overflow-hidden border border-border bg-card",
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

export function WorkbenchPlaceholder(props: WorkbenchPlaceholderProps) {
  const hasMeta = Boolean(props.meta?.length);

  return (
    <div
      className={cn(
        "grid gap-5 px-4 py-4 md:px-5",
        hasMeta && "md:grid-cols-[minmax(0,1fr)_220px]"
      )}
    >
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center border border-border text-muted-foreground">
            <props.icon className="size-4" aria-hidden />
          </span>
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
            <p className="text-sm text-muted-foreground">{props.description}</p>
          </div>
        </div>

        <div className="grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {props.bullets.map((bullet) => (
            <div key={bullet} className="flex items-start gap-2">
              <span className="mt-1 size-1 shrink-0 rounded-full bg-foreground/60" />
              <span>{bullet}</span>
            </div>
          ))}
        </div>

        {props.note && (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {props.note}
          </p>
        )}
      </div>

      {hasMeta && (
        <div className="grid content-start gap-2 border-t border-border pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          {props.meta?.map((item) => (
            <div key={item.label} className="border border-border px-3 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </div>
              <div className="mt-2 text-lg font-semibold tabular">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkbenchTabs() {
  const location = useLocation();

  return (
    <nav aria-label="工作台导航" className="min-w-0 overflow-hidden border-b border-border pb-3">
      <div className="flex min-w-0 flex-wrap gap-2">
        {WORKBENCH_TABS.map((tab) => {
          const active = isWorkbenchTabActive(location.pathname, tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center border border-border px-3 text-sm transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground hover:border-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function isWorkbenchTabActive(pathname: string, href: string) {
  if (href === "/workbench") {
    return pathname === "/" || pathname === "/workbench";
  }
  return pathname === href;
}
