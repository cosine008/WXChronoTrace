import { type ReactNode } from "react";
import { AlertTriangle, ClipboardCheck, Clock, Settings, Table2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { AdminPendingChangeSet } from "@/api/adminChangesets";
import { ChangeBadge, StatusBadge } from "@/components/badges";
import { cn } from "@/lib/utils";

export function ApprovalLedgerTable({ rows }: { rows: AdminPendingChangeSet[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1040px] divide-y divide-border">
        <div className="grid grid-cols-[minmax(260px,1.5fr)_220px_180px_150px_190px_96px] gap-4 px-4 py-3 text-xs text-muted-foreground">
          <span>批次</span>
          <span>表资产</span>
          <span>人员</span>
          <span>积压</span>
          <span>变更</span>
          <span className="text-right">操作</span>
        </div>
        {rows.map((row) => (
          <ApprovalRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function ApprovalRow({ row }: { row: AdminPendingChangeSet }) {
  return (
    <article className="nd-interactive-row grid grid-cols-[minmax(260px,1.5fr)_220px_180px_150px_190px_96px] gap-4 px-4 py-4 text-sm">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium">{row.summary || `ChangeSet #${row.id}`}</span>
          <StatusBadge variant={row.status} size="xs" />
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          #{row.id} · {formatDateTime(row.created_at)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate">{row.schema_name}</div>
        <div className="font-mono text-xs text-muted-foreground">{row.schema_code}</div>
      </div>
      <div className="grid gap-1 text-xs">
        <MetricLine label="提交" value={row.created_by_username} />
        <MetricLine label="审批" value={row.approver_username ?? "未指定"} />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <AgePill overdue={row.overdue}>{row.age_days} 天</AgePill>
      </div>
      <div className="flex flex-wrap gap-1">
        <ChangeBadge kind="new" count={row.action_counts.create} size="xs" mutedWhenZero />
        <ChangeBadge kind="modified" count={row.action_counts.update} size="xs" mutedWhenZero />
        <ChangeBadge
          kind="terminated"
          count={row.action_counts.terminate}
          size="xs"
          mutedWhenZero
        />
      </div>
      <div className="flex justify-end gap-2">
        <ActionLink to={`/schemas/${row.schema_id}/records`} title="打开数据视图">
          <Table2 className="size-4" aria-hidden />
        </ActionLink>
        <ActionLink to={`/schemas/${row.schema_id}/settings`} title="表设置">
          <Settings className="size-4" aria-hidden />
        </ActionLink>
      </div>
    </article>
  );
}

function AgePill(props: { overdue: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 border px-2 text-xs",
        props.overdue
          ? "border-[var(--color-status-warning)] text-[var(--color-status-warning)]"
          : "border-border text-muted-foreground"
      )}
    >
      {props.overdue ? (
        <AlertTriangle className="size-3" aria-hidden />
      ) : (
        <Clock className="size-3" aria-hidden />
      )}
      {props.children}
    </span>
  );
}

function MetricLine(props: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="min-w-0 truncate font-mono">{props.value}</span>
    </div>
  );
}

function ActionLink(props: { to: string; title: string; children: ReactNode }) {
  return (
    <Link
      to={props.to}
      title={props.title}
      className="grid size-9 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      {props.children}
    </Link>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
