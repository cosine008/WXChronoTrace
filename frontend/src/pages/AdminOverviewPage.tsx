import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

import { getAdminOverview, type AdminOverview } from "@/api/adminOverview";
import { AuditMarker, DataMetric, MetricGrid, StatusBadge } from "@/components/badges";
import { AppHeader, DotMatrix, HeroBanner } from "@/components/brand";
import { ErrorState, LoadingState } from "@/components/feedback";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { ACTION_LABELS, classifyAuditAction } from "@/features/audit/auditDisplay";
import { cn } from "@/lib/utils";

export function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ["admin-overview"],
    queryFn: getAdminOverview,
  });
  const overview = query.data;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        back={{ to: "/" }}
        right={
          <button
            type="button"
            title="刷新"
            onClick={() => query.refetch()}
            className="grid size-9 place-items-center text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} aria-hidden />
          </button>
        }
      />
      <main className="mx-auto grid max-w-7xl gap-5 px-6 py-6">
        <HeroBanner
          eyebrow="ADMIN / OVERVIEW"
          title="管理后台"
          subtitle="Operations control"
          meta={overview ? `${overview.sensitive_audit.last_30_days} sensitive / 30d` : "loading"}
        />
        <AdminNavigation />
        {query.isLoading ? (
          <LoadingState minH="min-h-72" label="加载后台总览" />
        ) : query.isError ? (
          <ErrorState
            title="后台总览加载失败"
            error={query.error}
            onRetry={() => query.refetch()}
            minH="min-h-72"
          />
        ) : (
          overview && <OverviewContent overview={overview} />
        )}
      </main>
    </div>
  );
}

function OverviewContent({ overview }: { overview: AdminOverview }) {
  return (
    <>
      <MetricSection index="01" title="站点状态" subtitle="GLOBAL STATE">
        <DataMetric label="用户总数" value={overview.users.total} tone="info" emphasis />
        <DataMetric label="在职用户" value={overview.users.employed} tone="success" />
        <DataMetric label="已离职" value={overview.users.left} tone="warning" />
        <DataMetric label="管理员" value={overview.users.superusers} tone="info" />
        <DataMetric label="活跃表" value={overview.schemas.active} tone="success" emphasis />
        <DataMetric label="公共表" value={overview.schemas.public} tone="info" />
        <DataMetric label="归档表" value={overview.schemas.archived} tone="neutral" />
        <DataMetric label="需审批表" value={overview.schemas.approval_required} tone="warning" />
      </MetricSection>
      <MetricSection index="02" title="风险队列" subtitle="RISK QUEUES">
        <DataMetric label="待审批" value={overview.approvals.pending} tone="warning" emphasis />
        <DataMetric label="超时审批" value={overview.approvals.overdue} tone="danger" />
        <DataMetric
          label="30 天敏感操作"
          value={overview.sensitive_audit.last_30_days}
          tone="danger"
        />
        <DataMetric label="大批量导出" value={overview.exports.large_last_30_days} tone="warning" />
      </MetricSection>
      <section className="grid gap-4 xl:grid-cols-3">
        <PendingPanel items={overview.approvals.latest} />
        <SensitivePanel items={overview.sensitive_audit.latest} />
        <ExportPanel items={overview.exports.recent_large} />
      </section>
    </>
  );
}

function MetricSection(props: {
  index: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <SectionLabel index={props.index} title={props.title} subtitle={props.subtitle} />
      <MetricGrid>{props.children}</MetricGrid>
    </section>
  );
}

function PendingPanel({ items }: { items: AdminOverview["approvals"]["latest"] }) {
  return (
    <Panel icon={<ClipboardCheck className="size-4" />} title="待审批批次" to="/admin/changesets">
      {items.length === 0 ? (
        <EmptyLine text="当前没有提交中的审批" />
      ) : (
        items.map((item) => (
          <PanelRow
            key={item.id}
            title={item.summary || `ChangeSet #${item.id}`}
            meta={`${item.schema_name} · ${item.created_by_username}`}
            time={item.created_at}
            marker={<StatusBadge variant="submitted" size="xs" />}
            detail={<RiskChip label="审批风险" value={`#${item.id}`} />}
          />
        ))
      )}
    </Panel>
  );
}

function SensitivePanel({ items }: { items: AdminOverview["sensitive_audit"]["latest"] }) {
  return (
    <Panel icon={<ShieldCheck className="size-4" />} title="最新敏感操作" to="/audit-logs/sensitive">
      {items.length === 0 ? (
        <EmptyLine text="近 30 天没有敏感操作" />
      ) : (
        items.map((item) => (
          <PanelRow
            key={item.id}
            title={ACTION_LABELS[item.action] ?? item.action}
            meta={`${item.actor_username} · ${item.target_schema_name ?? item.target_type}`}
            time={item.created_at}
            marker={<AuditMarker kind={classifyAuditAction(item.action)} risk="sensitive" />}
            detail={<RiskChip label="目标" value={item.target_type} />}
          />
        ))
      )}
    </Panel>
  );
}

function ExportPanel({ items }: { items: AdminOverview["exports"]["recent_large"] }) {
  return (
    <Panel
      icon={<Download className="size-4" />}
      title="最近大批量导出"
      to="/admin/exports?tab=events&risk=large_export"
    >
      {items.length === 0 ? (
        <EmptyLine text="近 30 天没有大批量导出" />
      ) : (
        items.map((item) => (
          <PanelRow
            key={item.id}
            title={`${item.row_count} rows · ${(item.format ?? "file").toUpperCase()}`}
            meta={`${item.schema_code ?? item.target_type} · ${item.actor_username}`}
            time={item.created_at}
            marker={<AuditMarker kind="export" risk="sensitive" />}
            detail={<RiskChip label={(item.format ?? "file").toUpperCase()} value={`${item.row_count} rows`} />}
          />
        ))
      )}
    </Panel>
  );
}

function Panel(props: {
  icon: ReactNode;
  title: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <section className="nd-interactive-surface min-w-0 border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 font-display text-sm font-semibold">
          {props.icon}
          {props.title}
        </div>
        <Link to={props.to} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
          OPEN
        </Link>
      </div>
      <div className="divide-y divide-border">{props.children}</div>
    </section>
  );
}

function PanelRow(props: {
  title: string;
  meta: string;
  time: string;
  marker?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <article className="nd-interactive-row grid gap-2 px-4 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <div className="flex items-start">{props.marker}</div>
      <div className="min-w-0">
        <div className="truncate font-medium">{props.title}</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{props.meta}</span>
          {props.detail}
        </div>
      </div>
      <time className="shrink-0 font-mono text-xs text-muted-foreground">
        {formatDateTime(props.time)}
      </time>
    </article>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
      <AlertTriangle className="size-4" aria-hidden />
      {text}
    </div>
  );
}

function RiskChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center border border-border bg-background px-1.5 py-0.5">
      <span className="mr-1 border-r border-border pr-1 font-mono text-[10px] uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="min-w-0 truncate font-mono">{value}</span>
    </span>
  );
}

function SectionLabel(props: { index: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground">/{props.index}</span>
        <h2 className="font-display text-lg font-semibold tracking-tight">{props.title}</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {props.subtitle}
        </span>
      </div>
      <DotMatrix length={4} intensity={0.35} className="text-[10px]" />
    </div>
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
