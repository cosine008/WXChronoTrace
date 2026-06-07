import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw, ShieldAlert } from "lucide-react";

import {
  downloadSensitiveAuditLogs,
  listAuditLogs,
  listSensitiveAuditLogs,
  type AuditExportFormat,
  type AuditLogListParams,
} from "@/api/audit";
import { AuditFilters } from "@/features/audit/AuditFilters";
import { AuditDayGroup, PaginationBar } from "@/features/audit/AuditTimeline";
import { groupByDate } from "@/features/audit/auditDisplay";
import { AuditMarker } from "@/components/badges";
import { AppHeader, HeroBanner } from "@/components/brand";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { extractApiError } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

interface Props {
  sensitiveOnly?: boolean;
}

export function AuditLogsPage({ sensitiveOnly = false }: Props) {
  const user = useAuthStore((state) => state.user);
  const notify = useNotification();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditLogListParams>({ page_size: 20 });
  const params = { ...filters, page };
  const query = useQuery({
    queryKey: [sensitiveOnly ? "sensitive-audit-logs" : "audit-logs", params],
    queryFn: () => (sensitiveOnly ? listSensitiveAuditLogs(params) : listAuditLogs(params)),
    enabled: !sensitiveOnly || Boolean(user?.is_superuser),
  });
  const payload = query.data;
  const groups = useMemo(() => groupByDate(payload?.results ?? []), [payload?.results]);
  const exportMutation = useMutation({
    mutationFn: (format: AuditExportFormat) =>
      downloadSensitiveAuditLogs({ ...filters, format }),
    onSuccess: (blob, format) => {
      saveBlob(blob, `sensitive_audit_logs.${format}`);
      notify.success({
        title: "导出已生成",
        message: `敏感审计日志 ${format.toUpperCase()} 已下载。`,
      });
      void query.refetch();
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "审计日志导出失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  if (sensitiveOnly && !user?.is_superuser) {
    return <EmptyState fullScreen title="无权查看敏感操作看板" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        back={{ to: sensitiveOnly ? "/admin" : "/" }}
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
          eyebrow={sensitiveOnly ? "AUDIT / SENSITIVE" : "AUDIT / LOG"}
          title={sensitiveOnly ? "敏感操作看板" : "审计日志"}
          subtitle={sensitiveOnly ? "Sensitive audit stream" : "Audit event stream"}
          meta={
            <span className="inline-flex items-center gap-2">
              {sensitiveOnly && <AuditMarker kind="sensitive" risk="sensitive" />}
              {payload?.count === undefined ? "loading" : `${payload.count} events`}
            </span>
          }
          action={
            sensitiveOnly ? (
              <AuditExportActions
                loading={exportMutation.isPending}
                onExport={(format) => exportMutation.mutate(format)}
              />
            ) : undefined
          }
        />

        {sensitiveOnly && <AdminNavigation />}
        {sensitiveOnly && <SensitiveBanner />}

        <AuditFilters
          sensitiveOnly={sensitiveOnly}
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />
        <section className="nd-interactive-surface border border-border bg-card">
          <AuditBody
            loading={query.isLoading}
            error={query.isError ? query.error : null}
            onRetry={() => query.refetch()}
            groups={groups}
          />
          <PaginationBar
            page={page}
            totalPages={Math.max(payload?.total_pages ?? 1, 1)}
            count={payload?.count ?? 0}
            onPage={setPage}
          />
        </section>
      </main>
    </div>
  );
}

function AuditExportActions(props: {
  loading: boolean;
  onExport: (format: AuditExportFormat) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ExportButton
        icon={<Download className="size-4" aria-hidden />}
        label="CSV"
        loading={props.loading}
        onClick={() => props.onExport("csv")}
      />
      <ExportButton
        icon={<FileSpreadsheet className="size-4" aria-hidden />}
        label="Excel"
        loading={props.loading}
        onClick={() => props.onExport("xlsx")}
      />
    </div>
  );
}

function ExportButton(props: {
  icon: ReactNode;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.loading}
      onClick={props.onClick}
      className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function SensitiveBanner() {
  return (
    <aside
      role="note"
      className="nd-interactive-surface flex items-start gap-3 border border-border bg-card px-4 py-3 text-xs text-muted-foreground"
    >
      <ShieldAlert
        className="mt-0.5 size-4 text-[var(--color-status-error)]"
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.2em] text-foreground">
          SENSITIVE / 受限视图
        </span>
        <span>
          仅超级管理员可见。所有打开 / 筛选 / 导出操作都会被记录为审计事件。
        </span>
      </div>
    </aside>
  );
}

function formatApiErrorDetail(details?: Record<string, unknown>) {
  return details ? JSON.stringify(details, null, 2) : undefined;
}

function AuditBody(props: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  groups: Array<{ date: string; items: Parameters<typeof AuditDayGroup>[0]["items"] }>;
}) {
  if (props.loading) {
    return <LoadingState minH="min-h-72" label="加载审计事件" />;
  }
  if (props.error)
    return (
      <ErrorState
        title="审计日志加载失败"
        error={props.error}
        onRetry={props.onRetry}
        minH="min-h-72"
      />
    );
  if (props.groups.length === 0)
    return <EmptyState title="暂无审计事件" minH="min-h-72" />;
  return (
    <div className="px-4 py-4">
      {props.groups.map((group) => (
        <AuditDayGroup key={group.date} date={group.date} items={group.items} />
      ))}
    </div>
  );
}
