import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { WorkbenchItem, WorkbenchOverviewResponse } from "@/api/workbench";
import { listSchemas } from "@/api/schemas";
import { getDashboardSummary } from "@/api/stats";
import { ErrorState, LoadingState } from "@/components/feedback";
import { WorkbenchChrome, WorkbenchSection } from "@/features/workbench/WorkbenchChrome";
import {
  WorkbenchContinueWorkList,
  WorkbenchFrequentItemsList,
  WorkbenchMyTablesPanel,
  WorkbenchNoteDigestPanel,
  WorkbenchOverviewPanel,
  WorkbenchQuickActions,
  WorkbenchRecentItemsList,
} from "@/features/workbench/WorkbenchOverviewPanels";
import { WorkbenchOverviewMetrics } from "@/features/workbench/WorkbenchOverviewMetrics";
import { QuickCapture } from "@/features/workbench/QuickCapture";
import { WorkbenchSearch } from "@/features/workbench/WorkbenchSearch";
import { useWorkbenchOverviewQuery, workbenchKeys } from "@/features/workbench/useWorkbenchQueries";

const CONTINUE_WORK_LIMIT = 6;

export function WorkbenchOverviewPage() {
  const queryClient = useQueryClient();
  const overviewQuery = useWorkbenchOverviewQuery();
  const schemasQuery = useQuery({
    queryKey: ["schemas", { includeArchived: false, ordering: "-last_modified_at" }],
    queryFn: () => listSchemas({ ordering: "-last_modified_at" }),
  });
  const dashboardSummaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });

  const overview = overviewQuery.data;

  async function handleQuickCaptureCreated() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workbenchKeys.overview() }),
      queryClient.invalidateQueries({ queryKey: workbenchKeys.notes() }),
      queryClient.invalidateQueries({ queryKey: workbenchKeys.items() }),
    ]);
  }

  return (
    <WorkbenchChrome
      title="我的工作台"
      subtitle="Personal workspace"
      meta={
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          已固定 {overview?.pinned.length ?? 0} 项
        </span>
      }
    >
      <WorkbenchSection index="01" title="搜索与入口" subtitle="SEARCH / ACTIONS">
        <div className="grid min-w-0 gap-0">
          <div className="grid min-w-0 gap-0 border-b border-border lg:grid-cols-[minmax(0,1.2fr)_360px] lg:items-start">
            <WorkbenchOverviewPanel
              title="搜索工作台"
              subtitle="SEARCH"
              className="border-b border-border lg:border-b-0 lg:border-r"
            >
              <WorkbenchSearch />
            </WorkbenchOverviewPanel>
            <WorkbenchOverviewPanel title="快速入口" subtitle="ACTIONS">
              <WorkbenchQuickActions />
            </WorkbenchOverviewPanel>
          </div>
          <WorkbenchOverviewPanel title="当前概况" subtitle="METRICS">
            <WorkbenchOverviewMetrics
              metrics={overview?.metrics}
              dashboardSummary={dashboardSummaryQuery.data}
            />
          </WorkbenchOverviewPanel>
        </div>
      </WorkbenchSection>

      <WorkbenchSection index="02" title="当前工作面" subtitle="ACTIVE SURFACES">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start">
          <div className="grid min-w-0 gap-0 border-b border-border xl:border-b-0 xl:border-r">
            <WorkbenchOverviewPanel title="我的表" subtitle="TABLES">
              <WorkbenchMyTablesPanel
                schemas={schemasQuery.data ?? []}
                dashboardSummary={dashboardSummaryQuery.data}
                isLoading={schemasQuery.isLoading}
                isError={schemasQuery.isError}
                error={schemasQuery.error}
                onRetry={() => void schemasQuery.refetch()}
              />
            </WorkbenchOverviewPanel>

            <WorkbenchOverviewPanel title="继续工作" subtitle="RESUME" className="border-t border-border">
              {overviewQuery.isLoading ? (
                <LoadingState minH="min-h-40" label="加载继续工作" />
              ) : overviewQuery.isError ? (
                <ErrorState
                  title="继续工作加载失败"
                  error={overviewQuery.error}
                  onRetry={() => overviewQuery.refetch()}
                  minH="min-h-40"
                />
              ) : (
                <WorkbenchContinueWorkList items={buildContinueItems(overview)} />
              )}
            </WorkbenchOverviewPanel>
          </div>

          <div className="grid min-w-0 gap-0">
            <WorkbenchOverviewPanel title="快速捕获" subtitle="CAPTURE">
              <QuickCapture onCreated={() => void handleQuickCaptureCreated()} />
            </WorkbenchOverviewPanel>

            <WorkbenchOverviewPanel title="常用资料" subtitle="PINNED" className="border-t border-border">
              {overviewQuery.isLoading ? (
                <LoadingState minH="min-h-36" label="加载常用资料" />
              ) : overviewQuery.isError ? (
                <ErrorState
                  title="常用资料加载失败"
                  error={overviewQuery.error}
                  onRetry={() => overviewQuery.refetch()}
                  minH="min-h-36"
                />
              ) : (
                <WorkbenchFrequentItemsList items={buildPinnedReferenceItems(overview)} />
              )}
            </WorkbenchOverviewPanel>

            <WorkbenchOverviewPanel title="待处理笔记" subtitle="NOTES DIGEST" className="border-t border-border">
              {overviewQuery.isLoading ? (
                <LoadingState minH="min-h-36" label="加载待处理笔记" />
              ) : overviewQuery.isError ? (
                <ErrorState
                  title="待处理笔记加载失败"
                  error={overviewQuery.error}
                  onRetry={() => overviewQuery.refetch()}
                  minH="min-h-36"
                />
              ) : (
                <WorkbenchNoteDigestPanel
                  summary={overview?.note_summary}
                  items={overview?.recent_notes ?? []}
                />
              )}
            </WorkbenchOverviewPanel>

            <WorkbenchOverviewPanel
              title="最近材料"
              subtitle="MATERIALS"
              className="border-t border-border"
            >
              {overviewQuery.isLoading ? (
                <LoadingState minH="min-h-36" label="加载最近材料" />
              ) : overviewQuery.isError ? (
                <ErrorState
                  title="最近材料加载失败"
                  error={overviewQuery.error}
                  onRetry={() => overviewQuery.refetch()}
                  minH="min-h-36"
                />
              ) : (
                <WorkbenchRecentItemsList
                  items={overview?.recent_materials ?? []}
                  emptyTitle="最近还没有材料。"
                />
              )}
            </WorkbenchOverviewPanel>
          </div>
        </div>
      </WorkbenchSection>
    </WorkbenchChrome>
  );
}

function buildContinueItems(overview?: WorkbenchOverviewResponse): WorkbenchItem[] {
  if (!overview) return [];
  const deduped = new Map<number, WorkbenchItem>();

  for (const item of [
    ...overview.pinned,
    ...overview.recent_notes.filter(shouldShowNoteOnResume),
    ...overview.recent_materials,
  ]) {
    const existing = deduped.get(item.id);
    if (!existing || itemRank(item) > itemRank(existing)) {
      deduped.set(item.id, item);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => timestamp(right) - timestamp(left))
    .slice(0, CONTINUE_WORK_LIMIT);
}

function buildPinnedReferenceItems(overview?: WorkbenchOverviewResponse): WorkbenchItem[] {
  if (!overview) return [];
  return overview.pinned.filter((item) => item.type !== "note");
}

function timestamp(item: WorkbenchItem) {
  const value = item.last_used_at ?? item.updated_at;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function itemRank(item: WorkbenchItem) {
  return item.is_pinned ? 1 : 0;
}

function shouldShowNoteOnResume(item: WorkbenchItem) {
  if (item.type !== "note") return true;
  const linkedToSchema = item.links.some((link) => link.target_schema?.accessible);
  const pendingConfirm = "status" in item.detail && item.detail.status === "pending_confirm";
  return item.is_pinned || pendingConfirm || linkedToSchema;
}
