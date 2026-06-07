import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import {
  getAdminExportEvent,
  getAdminExportJob,
  listAdminExportEvents,
  listAdminExportJobs,
  type AdminExportEventParams,
  type AdminExportJobParams,
  type AdminExportTab,
} from "@/api/adminExports";
import { DataMetric } from "@/components/badges";
import { AppHeader, HeroBanner } from "@/components/brand";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { PaginationBar } from "@/features/audit/AuditTimeline";
import { AdminExportDetailDrawer } from "@/features/admin-exports/AdminExportDetailDrawer";
import { AdminExportEventTable } from "@/features/admin-exports/AdminExportEventTable";
import { AdminExportFilters } from "@/features/admin-exports/AdminExportFilters";
import { AdminExportJobTable } from "@/features/admin-exports/AdminExportJobTable";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export function AdminExportsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = parseTab(searchParams.get("tab"));
  const initialRisk = parseOption(searchParams.get("risk"));
  const initialSource = parseOption(searchParams.get("source"));

  const defaultJobFilters = useMemo(
    () => createDefaultJobFilters(initialTab === "jobs" ? initialRisk : undefined),
    [initialRisk, initialTab]
  );
  const defaultEventFilters = useMemo(
    () => createDefaultEventFilters(initialTab === "events" ? initialRisk : undefined, initialSource),
    [initialRisk, initialSource, initialTab]
  );

  const [activeTab, setActiveTab] = useState<AdminExportTab>(initialTab);
  const [jobDraft, setJobDraft] = useState<AdminExportJobParams>(defaultJobFilters);
  const [jobApplied, setJobApplied] = useState<AdminExportJobParams>(defaultJobFilters);
  const [jobPage, setJobPage] = useState(1);
  const [eventDraft, setEventDraft] = useState<AdminExportEventParams>(defaultEventFilters);
  const [eventApplied, setEventApplied] = useState<AdminExportEventParams>(defaultEventFilters);
  const [eventPage, setEventPage] = useState(1);
  const [selectedJobCode, setSelectedJobCode] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const jobParams = useMemo(() => ({ ...jobApplied, page: jobPage }), [jobApplied, jobPage]);
  const eventParams = useMemo(() => ({ ...eventApplied, page: eventPage }), [eventApplied, eventPage]);

  const jobsQuery = useQuery({
    queryKey: ["admin-export-jobs", jobParams],
    queryFn: () => listAdminExportJobs(jobParams),
  });
  const eventsQuery = useQuery({
    queryKey: ["admin-export-events", eventParams],
    queryFn: () => listAdminExportEvents(eventParams),
  });
  const jobDetailQuery = useQuery({
    queryKey: ["admin-export-job-detail", selectedJobCode],
    queryFn: () => getAdminExportJob(selectedJobCode ?? ""),
    enabled: Boolean(selectedJobCode),
  });
  const eventDetailQuery = useQuery({
    queryKey: ["admin-export-event-detail", selectedEventId],
    queryFn: () => getAdminExportEvent(selectedEventId ?? 0),
    enabled: selectedEventId !== null,
  });

  const jobsPayload = jobsQuery.data;
  const eventsPayload = eventsQuery.data;
  const jobRows = jobsPayload?.results ?? [];
  const eventRows = eventsPayload?.results ?? [];
  const activeQuery = activeTab === "jobs" ? jobsQuery : eventsQuery;
  const activeCount = activeTab === "jobs" ? jobsPayload?.count : eventsPayload?.count;
  const isRefreshing = jobsQuery.isFetching || eventsQuery.isFetching;
  const selectedJob = jobRows.find((row) => row.job_code === selectedJobCode) ?? null;
  const selectedEvent = eventRows.find((row) => row.id === selectedEventId) ?? null;
  const drawerOpen =
    (activeTab === "jobs" && selectedJobCode !== null) ||
    (activeTab === "events" && selectedEventId !== null);

  function switchTab(tab: AdminExportTab) {
    setActiveTab(tab);
    setSelectedJobCode(null);
    setSelectedEventId(null);
  }

  function applyFilters() {
    if (activeTab === "jobs") {
      setJobApplied(jobDraft);
      setJobPage(1);
      return;
    }
    setEventApplied(eventDraft);
    setEventPage(1);
  }

  function resetFilters() {
    if (activeTab === "jobs") {
      setJobDraft(defaultJobFilters);
      setJobApplied(defaultJobFilters);
      setJobPage(1);
      return;
    }
    setEventDraft(defaultEventFilters);
    setEventApplied(defaultEventFilters);
    setEventPage(1);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        back={{ to: "/admin" }}
        right={
          <button
            type="button"
            title="刷新"
            onClick={() => {
              void jobsQuery.refetch();
              void eventsQuery.refetch();
            }}
            className="grid size-9 place-items-center text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} aria-hidden />
          </button>
        }
      />
      <main className="mx-auto grid max-w-7xl gap-5 px-6 py-6">
        <HeroBanner
          eyebrow="ADMIN / EXPORTS"
          title="导出中心"
          subtitle="Export governance"
          meta={activeCount === undefined ? "loading" : `${activeCount} ${activeTab}`}
        />
        <AdminNavigation />

        <MetricStrip jobs={jobsPayload?.summary} events={eventsPayload?.summary} />

        <section className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <AdminExportFilters
            tab={activeTab}
            filters={activeTab === "jobs" ? jobDraft : eventDraft}
            onChange={(next) =>
              activeTab === "jobs"
                ? setJobDraft(next as AdminExportJobParams)
                : setEventDraft(next as AdminExportEventParams)
            }
            onApply={applyFilters}
            onReset={resetFilters}
          />

          <section className="nd-interactive-surface border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <TabButton active={activeTab === "jobs"} onClick={() => switchTab("jobs")}>
                Export Jobs
              </TabButton>
              <TabButton active={activeTab === "events"} onClick={() => switchTab("events")}>
                Export Events
              </TabButton>
            </div>

            <LedgerBody
              loading={activeQuery.isLoading}
              error={activeQuery.isError ? activeQuery.error : null}
              onRetry={() => activeQuery.refetch()}
              isEmpty={activeTab === "jobs" ? jobRows.length === 0 : eventRows.length === 0}
              emptyTitle={activeTab === "jobs" ? "暂无导出任务" : "暂无导出事件"}
            >
              {activeTab === "jobs" ? (
                <AdminExportJobTable
                  rows={jobRows}
                  activeJobCode={selectedJobCode}
                  onOpen={setSelectedJobCode}
                />
              ) : (
                <AdminExportEventTable
                  rows={eventRows}
                  activeEventId={selectedEventId}
                  onOpen={setSelectedEventId}
                />
              )}
            </LedgerBody>

            <PaginationBar
              page={activeTab === "jobs" ? jobPage : eventPage}
              totalPages={Math.max(activeTab === "jobs" ? jobsPayload?.total_pages ?? 1 : eventsPayload?.total_pages ?? 1, 1)}
              count={activeTab === "jobs" ? jobsPayload?.count ?? 0 : eventsPayload?.count ?? 0}
              onPage={activeTab === "jobs" ? setJobPage : setEventPage}
            />
          </section>
        </section>
      </main>

      <AdminExportDetailDrawer
        kind={activeTab}
        open={drawerOpen}
        jobPreview={selectedJob}
        eventPreview={selectedEvent}
        jobQuery={jobDetailQuery}
        eventQuery={eventDetailQuery}
        onClose={() => {
          setSelectedJobCode(null);
          setSelectedEventId(null);
        }}
      />
    </div>
  );
}

function MetricStrip(props: {
  jobs:
    | {
        total: number;
        queued: number;
        running: number;
        completed: number;
        failed: number;
        high_risk: number;
      }
    | undefined;
  events:
    | {
        total: number;
        with_job: number;
        without_job: number;
        high_risk: number;
        large_export: number;
      }
    | undefined;
}) {
  const activeJobs = props.jobs ? props.jobs.queued + props.jobs.running : "...";
  const highRiskTotal =
    props.jobs || props.events
      ? (props.jobs?.high_risk ?? 0) + (props.events?.high_risk ?? 0)
      : "...";
  const items = [
    ["30 天任务", props.jobs?.total ?? "...", "info"],
    ["活跃任务", activeJobs, "warning"],
    ["失败任务", props.jobs?.failed ?? "...", "danger"],
    ["高风险", highRiskTotal, "warning"],
    ["实际导出", props.events?.total ?? "...", "success"],
  ] as const;

  return (
    <section className="grid gap-3 md:grid-cols-5">
      {items.map(([label, value, tone]) => (
        <DataMetric
          key={String(label)}
          label={String(label)}
          value={String(value)}
          tone={tone as "neutral" | "info" | "success" | "warning" | "danger"}
          layout="strip"
          density="compact"
        />
      ))}
    </section>
  );
}

function TabButton(props: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "inline-flex h-9 items-center border px-3 text-sm",
        props.active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
      )}
    >
      {props.children}
    </button>
  );
}

function LedgerBody(props: {
  children: React.ReactNode;
  loading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle: string;
  onRetry: () => void;
}) {
  if (props.loading) {
    return <LoadingState minH="min-h-72" label="加载导出台账" />;
  }
  if (props.error) {
    return <ErrorState title="导出台账加载失败" error={props.error} onRetry={props.onRetry} minH="min-h-72" />;
  }
  if (props.isEmpty) {
    return <EmptyState title={props.emptyTitle} minH="min-h-72" />;
  }
  return props.children;
}

function createDefaultJobFilters(risk?: string): AdminExportJobParams {
  return {
    page_size: PAGE_SIZE,
    risk,
  };
}

function createDefaultEventFilters(risk?: string, source?: string): AdminExportEventParams {
  return {
    page_size: PAGE_SIZE,
    risk,
    source,
  };
}

function parseTab(value: string | null): AdminExportTab {
  return value === "events" ? "events" : "jobs";
}

function parseOption(value: string | null) {
  return value || undefined;
}
