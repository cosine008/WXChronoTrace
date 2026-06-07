import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Clock3,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import {
  getStatsDistribution,
  getStatsSummary,
  getStatsTrend,
  type StatsCurrentScopeParams,
  type TrendUnitParam,
} from "@/api/stats";
import type { CurrentViewFilter, FieldConfig, SchemaRole } from "@/api/schemas";
import { DataMetric, MetricGrid } from "@/components/badges";
import { useChartTheme } from "@/hooks/useChartTheme";
import {
  distributionOption,
  trendNotice,
  trendOption,
  trendRange,
  trendTitle,
} from "./statsChartOptions";
import {
  firstVisibleDistributableField,
  STATS_QUERY_CACHE_OPTIONS,
  statsQueryKeys,
} from "./currentViewStatsCache";
import {
  ChartNotice,
  ExportLinkButton,
  TrendUnitControl,
} from "./StatsExportPanelControls";

const EChartCanvas = lazy(() =>
  import("./EChartCanvas").then((module) => ({ default: module.EChartCanvas }))
);

interface Props {
  schemaId: number;
  schemaCode: string;
  schemaRole: SchemaRole | null;
  schemaVersion: number;
  userId?: number;
  at: string;
  retro: boolean;
  search: string;
  ordering: string;
  changeSetId?: number;
  filters: CurrentViewFilter[];
  fields: FieldConfig[];
  visibleFields: FieldConfig[];
  currentPageEntityIds: number[];
  selectedEntityIds: number[];
  exportCsvTo: string;
  exportExcelTo: string;
  exportCenterTo: string;
}

export function SchemaStatsPanel(props: Props) {
  const [trendUnit, setTrendUnit] = useState<TrendUnitParam>("auto");
  const distributionField = firstVisibleDistributableField(props.fields, props.schemaRole);
  const statsScope = useMemo<StatsCurrentScopeParams>(
    () => ({
      at: props.at,
      retro: props.retro,
      search: props.search,
      ordering: props.ordering,
      change_set: props.changeSetId,
      filters: props.filters,
    }),
    [props.at, props.changeSetId, props.filters, props.ordering, props.retro, props.search]
  );
  const filtersKey = useMemo(() => JSON.stringify(props.filters), [props.filters]);
  const statsActivationKey = useMemo(
    () =>
      [
        props.schemaId,
        props.at,
        props.retro ? "retro" : "current",
        props.search,
        props.ordering,
        props.changeSetId ?? "all",
        filtersKey,
      ].join("|"),
    [
      filtersKey,
      props.at,
      props.changeSetId,
      props.ordering,
      props.retro,
      props.schemaId,
      props.search,
    ]
  );
  const [activatedStatsKey, setActivatedStatsKey] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setActivatedStatsKey(statsActivationKey), 0);
    return () => window.clearTimeout(timer);
  }, [statsActivationKey]);
  const statsEnabled = activatedStatsKey === statsActivationKey;
  const statsScopeLabel =
    statsScope.search?.trim() || statsScope.change_set || statsScope.filters?.length
      ? "当前筛选全量"
      : "当前快照全量";
  const exportSnapshotParts = exportSnapshotSummaryParts(statsScope, statsScopeLabel);
  const summaryQuery = useQuery({
    queryKey: statsQueryKeys.summary(
      props.schemaId,
      props.userId,
      props.schemaVersion,
      statsScope
    ),
    queryFn: () => getStatsSummary(props.schemaId, statsScope),
    enabled: statsEnabled,
    ...STATS_QUERY_CACHE_OPTIONS,
  });
  const trendQuery = useQuery({
    queryKey: statsQueryKeys.trend(
      props.schemaId,
      props.userId,
      props.schemaVersion,
      props.at,
      trendUnit
    ),
    queryFn: () =>
      getStatsTrend(props.schemaId, {
        at: props.at,
        unit: trendUnit,
        range: trendUnit === "auto" ? undefined : trendRange(trendUnit),
      }),
    enabled: statsEnabled,
    ...STATS_QUERY_CACHE_OPTIONS,
  });
  const distributionQuery = useQuery({
    queryKey: statsQueryKeys.distribution(
      props.schemaId,
      props.userId,
      props.schemaVersion,
      statsScope,
      distributionField?.key
    ),
    queryFn: () =>
      getStatsDistribution(props.schemaId, { ...statsScope, field: distributionField?.key }),
    enabled: statsEnabled && Boolean(distributionField),
    retry: false,
    ...STATS_QUERY_CACHE_OPTIONS,
  });
  const metrics = summaryQuery.data?.metrics;
  const chartTheme = useChartTheme();
  const trend = trendQuery.data;
  const notice = trend ? trendNotice(trend, trendUnit) : null;

  return (
    <section
      className="nd-interactive-surface grid min-w-0 gap-4 border border-border bg-background p-4"
      data-testid="schema-stats-panel"
      data-current-page-entity-count={props.currentPageEntityIds.length}
      data-selected-entity-count={props.selectedEntityIds.length}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-display text-sm font-semibold">
            <BarChart3 className="size-4" aria-hidden />
            统计与导出
            <span className="font-sans text-xs font-normal text-muted-foreground">
              {statsEnabled ? statsScopeLabel : "统计稍后加载"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">导出快照</span>
            {exportSnapshotParts.map((part) => (
              <span key={part} className="max-w-[14rem] truncate">
                {part}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportLinkButton
            icon={<Download className="size-4" aria-hidden />}
            label="CSV"
            to={props.exportCsvTo}
          />
          <ExportLinkButton
            icon={<FileSpreadsheet className="size-4" aria-hidden />}
            label="Excel"
            to={props.exportExcelTo}
          />
          <ExportLinkButton
            icon={<Clock3 className="size-4" aria-hidden />}
            label="我的导出"
            to={props.exportCenterTo}
          />
        </div>
      </div>

      <MetricGrid>
        <DataMetric
          label="筛选总数"
          value={metricValue(metrics?.total)}
          hint={statsScopeLabel}
          tone="info"
          emphasis
        />
        <DataMetric
          label="全表本月新增"
          value={metricValue(metrics?.month_created)}
          tone="success"
        />
        <DataMetric
          label="全表本月修改"
          value={metricValue(metrics?.month_updated)}
          tone="warning"
        />
        <DataMetric
          label="全表本月终止"
          value={metricValue(metrics?.month_terminated)}
          tone="danger"
        />
      </MetricGrid>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <div className="nd-interactive-surface min-w-0 border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              {trend ? `全表趋势 · ${trendTitle(trend)}` : "全表趋势"}
            </div>
            <TrendUnitControl value={trendUnit} onChange={setTrendUnit} />
          </div>
          {trendQuery.isError ? (
            <ChartNotice>趋势加载失败</ChartNotice>
          ) : trend ? (
            <>
              <Suspense fallback={<ChartNotice>趋势图加载中</ChartNotice>}>
                <EChartCanvas option={trendOption(trend, chartTheme)} height={204} />
              </Suspense>
              {notice && (
                <div className="mt-2 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                  {notice}
                </div>
              )}
            </>
          ) : (
            <ChartNotice>趋势加载中</ChartNotice>
          )}
        </div>
        <div className="nd-interactive-surface min-w-0 border border-border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            {distributionQuery.data?.field.label
              ? `当前筛选分布 · ${distributionQuery.data.field.label}`
              : distributionField?.label
                ? `当前筛选分布 · ${distributionField.label}`
                : "当前筛选分布"}
          </div>
          {distributionQuery.data ? (
            <Suspense fallback={<ChartNotice height={220}>分布图加载中</ChartNotice>}>
              <EChartCanvas
                option={distributionOption(distributionQuery.data.buckets, chartTheme)}
                height={220}
              />
            </Suspense>
          ) : (
            <div className="grid h-[220px] place-items-center text-sm text-muted-foreground">
              {distributionQuery.isError
                ? "分布加载失败"
                : distributionField
                  ? "分布加载中"
                  : "暂无可分布字段"}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function metricValue(value: number | undefined) {
  return value === undefined ? "..." : String(value);
}

function exportSnapshotSummaryParts(
  scope: StatsCurrentScopeParams,
  scopeLabel: string
) {
  return [
    scope.at || "当前日期",
    scopeLabel,
    scope.search?.trim() ? "含搜索" : "无搜索",
    scope.filters?.length ? `结构化筛选 ${scope.filters.length} 条` : "无结构化筛选",
    scope.change_set ? `批次 #${scope.change_set}` : "全部批次",
    "全量结果",
  ];
}
