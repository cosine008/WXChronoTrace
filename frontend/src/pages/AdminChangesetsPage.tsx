import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardCheck, RefreshCw } from "lucide-react";

import {
  listAdminPendingChangeSets,
  type AdminPendingChangeSet,
  type AdminPendingChangeSetParams,
} from "@/api/adminChangesets";
import { AppHeader, HeroBanner } from "@/components/brand";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { ApprovalFilters } from "@/features/admin-changesets/AdminChangesetFilters";
import { ApprovalLedgerTable } from "@/features/admin-changesets/AdminChangesetLedgerTable";
import { cn } from "@/lib/utils";

const DEFAULT_TOTAL_PAGES = 1;
const INITIAL_FILTERS: AdminPendingChangeSetParams = { page_size: 20 };

export function AdminChangesetsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminPendingChangeSetParams>(INITIAL_FILTERS);
  const params = { ...filters, page };
  const query = useQuery({
    queryKey: ["admin-changesets-pending", params],
    queryFn: () => listAdminPendingChangeSets(params),
  });
  const payload = query.data;
  const rows = payload?.results ?? [];

  function handleFiltersChange(next: AdminPendingChangeSetParams) {
    setFilters(next);
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        back={{ to: "/admin" }}
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
          eyebrow="ADMIN / APPROVALS"
          title="全局审批治理"
          subtitle="Submitted changeset ledger"
          meta={
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck className="size-4" aria-hidden />
              {payload ? `${payload.count} pending` : "loading"}
            </span>
          }
        />
        <AdminNavigation />
        <ApprovalFilters
          filters={filters}
          onChange={handleFiltersChange}
          onReset={() => handleFiltersChange(INITIAL_FILTERS)}
        />
        <section className="nd-interactive-surface border border-border bg-card">
          <ApprovalLedgerBody
            loading={query.isLoading}
            error={query.isError ? query.error : null}
            onRetry={() => query.refetch()}
            rows={rows}
          />
          <PaginationBar
            page={page}
            totalPages={Math.max(payload?.total_pages ?? DEFAULT_TOTAL_PAGES, 1)}
            count={payload?.count ?? 0}
            onPage={setPage}
          />
        </section>
      </main>
    </div>
  );
}

function ApprovalLedgerBody(props: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  rows: AdminPendingChangeSet[];
}) {
  if (props.loading) {
    return <LoadingState minH="min-h-72" label="加载审批队列" />;
  }
  if (props.error) {
    return (
      <ErrorState
        title="审批队列加载失败"
        error={props.error}
        onRetry={props.onRetry}
        minH="min-h-72"
      />
    );
  }
  if (props.rows.length === 0) {
    return (
      <EmptyState
        title="暂无匹配的待审批批次"
        description="调整表、提交人、审批人或积压时长筛选后重试。"
        minH="min-h-72"
      />
    );
  }
  return <ApprovalLedgerTable rows={props.rows} />;
}

function PaginationBar(props: {
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

function PageButton(props: { disabled: boolean; onClick: () => void; children: ReactNode }) {
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
