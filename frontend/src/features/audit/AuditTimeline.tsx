import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AuditLogEntry } from "@/api/audit";
import { AuditMarker } from "@/components/badges";
import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  classifyAuditAction,
  detailSummary,
  formatTime,
  targetLabel,
} from "./auditDisplay";

export function AuditDayGroup({ date, items }: { date: string; items: AuditLogEntry[] }) {
  return (
    <section className="grid gap-3 pb-6 last:pb-0">
      <header className="flex items-center gap-3">
        <span className="size-2 rounded-full bg-foreground" aria-hidden />
        <span className="font-mono text-xs text-foreground">{date}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {items.length} events
        </span>
        {items.some((item) => item.is_sensitive) && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-status-error)]">
            {items.filter((item) => item.is_sensitive).length} sensitive
          </span>
        )}
        <span className="h-px flex-1 bg-border" aria-hidden />
      </header>
      <div className="grid gap-3 pl-[7px]">
        {items.map((item) => (
          <AuditLogRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export function AuditLogRow({ item }: { item: AuditLogEntry }) {
  const kind = classifyAuditAction(item.action);
  const [expanded, setExpanded] = useState(false);
  const detail = detailSummary(item.detail);

  return (
    <article
      className={cn(
        "nd-interactive-row grid gap-2 border-l border-dashed border-border py-2 pl-4 pr-3 md:grid-cols-[86px_auto_minmax(0,1fr)_auto]",
        item.is_sensitive && "border-l-[var(--color-status-error)]"
      )}
    >
      <time className="font-mono text-xs text-muted-foreground">{formatTime(item.created_at)}</time>
      <div className="flex items-start">
        <AuditMarker kind={kind} risk={item.is_sensitive ? "sensitive" : "normal"} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium">{item.actor_username}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {ACTION_LABELS[item.action] ?? item.action}
          </span>
          <TargetChip item={item} />
        </div>
        <div className="mt-1 min-w-0 truncate font-mono text-xs text-muted-foreground">
          {detail}
        </div>
        {expanded && (
          <pre className="nd-audit-detail mt-2 max-h-48 overflow-auto border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(item.detail, null, 2)}
          </pre>
        )}
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="nd-transition-state h-7 self-start border border-border px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:border-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        {expanded ? "Hide" : "Detail"}
      </button>
    </article>
  );
}

function TargetChip({ item }: { item: AuditLogEntry }) {
  return (
    <span className="inline-flex max-w-full items-center border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
      <span className="mr-1 border-r border-border pr-1 font-mono text-[10px] uppercase">
        {item.target_type}
      </span>
      <span className="truncate">{targetLabel(item)}</span>
    </span>
  );
}

export function PaginationBar(props: {
  page: number;
  totalPages: number;
  count: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <span className="font-mono text-xs text-muted-foreground">{props.count} rows</span>
      <div className="flex items-center gap-2">
        <PageButton disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </PageButton>
        <span className="font-mono text-xs text-muted-foreground">
          {props.page}/{props.totalPages}
        </span>
        <PageButton
          disabled={props.page >= props.totalPages}
          onClick={() => props.onPage(props.page + 1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton(props: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-8 place-items-center border border-border disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
