import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { getCurrentRecords, type CurrentViewFilter } from "@/api/schemas";
import {
  createCurrentExportJob,
  downloadExportJob,
  getExportJob,
  getStatsSummary,
  type CurrentExportJobParams,
  type CurrentExportRiskConfirmation,
  type ExportJob,
  type StatsCurrentScopeParams,
} from "@/api/stats";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { saveBlob } from "@/lib/download";
import { visibleUserFields } from "@/lib/schemaFields";
import { CurrentExportJobsList } from "./ExportJobsList";
import { ExportConfirmPanel } from "./ExportConfirmPanel";
import {
  buildCurrentViewRecordsReturnPath,
  parseCurrentViewExportSearch,
} from "./currentViewExportRoute";
import { currentExportJobParamsFromSpec, formatExportFormat } from "./exportSpec";

export function CurrentViewExportPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const schemaId = parseSchemaId(id);
  const routeState = useMemo(() => parseCurrentViewExportSearch(searchParams), [searchParams]);
  const filtersKey = useMemo(() => JSON.stringify(routeState.filters), [routeState.filters]);
  const returnPath = useMemo(
    () =>
      schemaId === null ? "/" : buildCurrentViewRecordsReturnPath({ ...routeState, schemaId }),
    [routeState, schemaId]
  );
  const [trackedJobCode, setTrackedJobCode] = useState<string | null>(null);
  const effectiveTrackedJobCode = routeState.jobCode ?? trackedJobCode;
  const [createdJob, setCreatedJob] = useState<ExportJob | null>(null);
  const recordsQuery = useQuery({
    queryKey: [
      "current-view-export-records",
      schemaId,
      routeState.at,
      routeState.retro,
      routeState.search,
      routeState.ordering,
      filtersKey,
      routeState.changeSetId ?? null,
      routeState.page,
      routeState.pageSize ?? null,
    ],
    queryFn: () =>
      getCurrentRecords(schemaId!, {
        at: routeState.at,
        retro: routeState.retro,
        search: routeState.search,
        ordering: routeState.ordering,
        filters: routeState.filters,
        change_set: routeState.changeSetId,
        page: routeState.page,
        page_size: routeState.pageSize,
      }),
    enabled: schemaId !== null,
  });

  const view = recordsQuery.data;
  const scope = useMemo<StatsCurrentScopeParams>(
    () => ({
      at: routeState.at,
      retro: routeState.retro,
      search: routeState.search,
      ordering: routeState.ordering,
      filters: routeState.filters,
      change_set: routeState.changeSetId,
    }),
    [routeState]
  );
  const hasNarrowedScope = Boolean(
    routeState.search.trim() || routeState.changeSetId || routeState.filters.length > 0
  );
  const snapshotAllScope = useMemo<StatsCurrentScopeParams>(
    () => ({
      at: routeState.at,
      retro: routeState.retro,
      search: "",
      ordering: routeState.ordering,
      filters: [],
    }),
    [routeState.at, routeState.ordering, routeState.retro]
  );
  const summaryQuery = useQuery({
    queryKey: [
      "current-view-export-summary",
      schemaId,
      view?.schema_version ?? 0,
      scope.at,
      scope.retro,
      scope.search,
      scope.ordering,
      scope.change_set ?? null,
      filtersKey,
    ],
    queryFn: () => getStatsSummary(schemaId!, scope),
    enabled: schemaId !== null && recordsQuery.isSuccess,
  });
  const snapshotAllSummaryQuery = useQuery({
    queryKey: [
      "current-view-export-summary",
      schemaId,
      view?.schema_version ?? 0,
      snapshotAllScope.at,
      snapshotAllScope.retro,
      snapshotAllScope.ordering,
      "snapshot-all",
    ],
    queryFn: () => getStatsSummary(schemaId!, snapshotAllScope),
    enabled: schemaId !== null && recordsQuery.isSuccess && hasNarrowedScope,
  });
  const jobQuery = useQuery({
    queryKey: ["export-job", effectiveTrackedJobCode],
    queryFn: () => getExportJob(effectiveTrackedJobCode ?? ""),
    enabled: Boolean(effectiveTrackedJobCode),
    refetchInterval: (query) => {
      const job = query.state.data as ExportJob | undefined;
      return job && exportJobIsActive(job.status) ? 2000 : false;
    },
    refetchIntervalInBackground: false,
  });
  const createExportMutation = useMutation({
    mutationFn: (params: CurrentExportJobParams) => createCurrentExportJob(schemaId!, params),
  });
  const downloadMutation = useMutation({
    mutationFn: (job: ExportJob) => downloadExportJob(job.job_code),
    onSuccess: (blob, job) => {
      const schemaCode = view?.schema.schema_code ?? "export";
      saveBlob(blob, job.filename || `${schemaCode}_${routeState.at}.${job.format}`);
      notify.success({
        title: "导出文件已下载",
        message: `${job.filename || "导出文件"} 已保存。`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "导出文件下载失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  useEffect(() => {
    if (!jobQuery.data || schemaId === null) return;
    void queryClient.invalidateQueries({ queryKey: ["current-export-jobs", schemaId] });
  }, [jobQuery.data, queryClient, schemaId]);

  if (schemaId === null) {
    return (
      <EmptyState
        fullScreen
        title="导出页面参数无效"
        description="需要有效的 schema id 才能打开当前视图导出。"
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            返回工作台
          </Link>
        }
      />
    );
  }

  if (recordsQuery.isLoading) {
    return <LoadingState fullScreen label="加载导出配置" />;
  }

  if (recordsQuery.isError) {
    return (
      <ErrorState
        fullScreen
        title="导出配置加载失败"
        error={recordsQuery.error}
        onRetry={() => recordsQuery.refetch()}
      />
    );
  }

  if (!view) {
    return (
      <EmptyState
        fullScreen
        title="未找到当前视图数据"
        description="当前查询没有返回可用于导出的记录视图快照。"
      />
    );
  }

  const exportableFields = visibleUserFields(view.fields_config);
  const visibleFields =
    routeState.visibleFieldKeys === undefined
      ? exportableFields
      : resolveRouteVisibleFields(exportableFields, routeState.visibleFieldKeys);
  const currentPageEntityIds =
    routeState.currentPageEntityIds.length > 0
      ? routeState.currentPageEntityIds
      : uniqueEntityIds(view.results.map((record) => record.entity_id));
  const filteredRowCount = summaryQuery.data?.metrics.total;
  const snapshotAllRowCount = hasNarrowedScope
    ? snapshotAllSummaryQuery.data?.metrics.total
    : filteredRowCount;
  const currentJob = jobQuery.data ?? (routeState.jobCode ? null : createdJob);

  const startExport = async (params: CurrentExportJobParams) => {
    try {
      const job = await createExportMutation.mutateAsync(params);
      const reusedTrackedJob = effectiveTrackedJobCode === job.job_code;
      setTrackedJobCode(job.job_code);
      setCreatedJob(job);
      void queryClient.invalidateQueries({ queryKey: ["current-export-jobs", schemaId] });
      notify.success({
        title: reusedTrackedJob
          ? "同快照导出任务已存在"
          : job.status === "completed"
            ? "导出任务已就绪"
            : "导出任务已创建",
        message:
          job.status === "completed"
            ? `${job.filename || "导出文件"} 可下载。`
            : `${view.schema.schema_code} ${params.format.toUpperCase()} 导出已进入后台任务。`,
      });
    } catch (err) {
      const risk = exportRiskFromError(err);
      if (risk && !params.risk_confirmed) {
        const confirmed = await notify.confirm({
          title: "确认创建高风险导出任务",
          description: "本次导出命中风险规则，确认后会创建后台任务并记录审计。",
          impactSummary: riskConfirmationSummary(risk),
          confirmLabel: "确认并创建",
          cancelLabel: "取消",
          tone: "destructive",
        });
        if (confirmed) {
          await startExport({ ...params, risk_confirmed: true });
        }
        return;
      }
      const apiError = extractApiError(err);
      notify.error({
        title: "当前视图导出任务创建失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
        <header className="grid gap-3 border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                <FileSpreadsheet className="size-4" aria-hidden />
                当前视图导出
                <span className="text-xs font-normal text-muted-foreground">
                  {view.schema.schema_code} · {formatExportFormat(routeState.format)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                当前记录视图的查询快照会被冻结为后台导出任务，文件生成完成后可在右侧下载。
              </p>
            </div>
            <Link
              to={returnPath}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
              返回记录视图
            </Link>
          </div>
          <RouteScopeSummary
            at={routeState.at}
            retro={routeState.retro}
            search={routeState.search}
            ordering={routeState.ordering}
            changeSetId={routeState.changeSetId}
            filters={routeState.filters}
            page={routeState.page}
            pageSize={routeState.pageSize}
          />
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <ExportConfirmPanel
            schemaId={schemaId}
            schemaCode={view.schema.schema_code}
            schemaRole={view.schema.role}
            schemaVersion={view.schema_version}
            format={routeState.format}
            scope={scope}
            visibleFields={visibleFields}
            exportableFields={exportableFields}
            currentPageEntityIds={currentPageEntityIds}
            selectedEntityIds={routeState.selectedEntityIds}
            filteredRowCount={filteredRowCount}
            snapshotAllRowCount={snapshotAllRowCount}
            filteredRowCountLoading={!summaryQuery.data && summaryQuery.isFetching}
            snapshotAllRowCountLoading={
              hasNarrowedScope &&
              !snapshotAllSummaryQuery.data &&
              snapshotAllSummaryQuery.isFetching
            }
            loading={createExportMutation.isPending}
            onCancel={() => navigate(returnPath)}
            onConfirm={(spec) => void startExport(currentExportJobParamsFromSpec(spec))}
          />

          <div className="grid gap-4">
            {currentJob ? (
              <ExportJobStatusPanel
                job={currentJob}
                loading={jobQuery.isFetching || downloadMutation.isPending}
                onDownload={() => downloadMutation.mutate(currentJob)}
                onRecreate={() => void startExport(exportJobParamsFromSnapshot(currentJob))}
              />
            ) : (
              <EmptyState
                title="尚未创建导出任务"
                description="确认创建后，最新导出任务状态会显示在这里。"
                minH="min-h-32"
                align="start"
                className="border border-border bg-background p-4"
              />
            )}
            <CurrentExportJobsList
              schemaId={schemaId}
              onDownload={(job) => downloadMutation.mutate(job)}
              onRecreate={(job) => void startExport(exportJobParamsFromSnapshot(job))}
              downloadingJobCode={downloadMutation.variables?.job_code ?? null}
              downloadBusy={downloadMutation.isPending}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function RouteScopeSummary(props: {
  at: string;
  retro: boolean;
  search: string;
  ordering: string;
  changeSetId?: number;
  filters: CurrentViewFilter[];
  page: number;
  pageSize?: number;
}) {
  const items = [
    `时间点：${props.at}${props.retro ? " · 回溯" : ""}`,
    props.search.trim() ? `搜索：${props.search.trim()}` : "搜索：无",
    props.filters.length > 0 ? `结构化筛选：${props.filters.length} 条` : "结构化筛选：无",
    props.changeSetId ? `批次：#${props.changeSetId}` : "批次：全部",
    `排序：${props.ordering || "business_code"}`,
    `分页：第 ${props.page} 页${props.pageSize ? ` · 每页 ${props.pageSize}` : ""}`,
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function ExportJobStatusPanel(props: {
  job: ExportJob;
  loading: boolean;
  onDownload: () => void;
  onRecreate: () => void;
}) {
  const status = exportJobStatusMeta(props.job.status);
  const rowCount = props.job.row_count_actual ?? props.job.row_count_estimate ?? undefined;
  const canDownload = props.job.status === "completed" && Boolean(props.job.download_url);
  return (
    <section className="grid gap-3 border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        {status.icon}
        <span className="font-medium text-foreground">{status.label}</span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {props.job.filename || `${props.job.schema.schema_code}.${props.job.format}`}
        </span>
        {props.loading && <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{props.job.format.toUpperCase()}</span>
        <span>{rowCount === undefined ? "行数待生成" : `${rowCount.toLocaleString()} 行`}</span>
        <span>{props.job.expires_at ? `过期：${dateLabel(props.job.expires_at)}` : "默认保留 30 天"}</span>
        {props.job.risk_flags.length > 0 && (
          <span>{props.job.risk_flags.map(riskFlagLabel).join(" / ")}</span>
        )}
      </div>
      {props.job.status === "failed" && props.job.error_message && (
        <div className="text-xs text-destructive">{props.job.error_message}</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canDownload && (
          <button
            type="button"
            onClick={props.onDownload}
            disabled={props.loading}
            className="inline-flex h-8 items-center gap-2 border border-foreground bg-foreground px-3 text-xs text-background disabled:opacity-40"
          >
            <Download className="size-3.5" aria-hidden />
            下载
          </button>
        )}
        {props.job.status === "failed" && (
          <button
            type="button"
            onClick={props.onRecreate}
            disabled={props.loading}
            className="inline-flex h-8 items-center gap-2 border border-border px-3 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            重新创建
          </button>
        )}
      </div>
    </section>
  );
}

function exportJobParamsFromSnapshot(job: ExportJob): CurrentExportJobParams {
  if (job.query_snapshot.export_spec) {
    return currentExportJobParamsFromSpec(job.query_snapshot.export_spec);
  }
  return {
    at: job.query_snapshot.at,
    retro: job.query_snapshot.retro,
    search: job.query_snapshot.search,
    ordering: job.query_snapshot.ordering,
    change_set: job.query_snapshot.change_set,
    format: job.query_snapshot.format,
  };
}

function exportJobIsActive(status: ExportJob["status"] | undefined) {
  return status === "queued" || status === "running";
}

function exportJobStatusMeta(status: ExportJob["status"]) {
  if (status === "completed") {
    return {
      label: "可下载",
      icon: <CheckCircle2 className="size-4 text-[var(--color-status-success)]" aria-hidden />,
    };
  }
  if (status === "failed") {
    return {
      label: "生成失败",
      icon: <AlertTriangle className="size-4 text-destructive" aria-hidden />,
    };
  }
  if (status === "expired") {
    return {
      label: "已过期",
      icon: <AlertTriangle className="size-4 text-muted-foreground" aria-hidden />,
    };
  }
  return {
    label: status === "running" ? "生成中" : "排队中",
    icon: <Clock3 className="size-4 text-[var(--color-status-info)]" aria-hidden />,
  };
}

function exportRiskFromError(err: unknown): CurrentExportRiskConfirmation | null {
  const apiError = extractApiError(err);
  const details = apiError.details;
  if (!isRecord(details)) return null;
  const required =
    details.risk_confirmation_required === true ||
    apiError.code === "EXPORT_RISK_CONFIRMATION_REQUIRED" ||
    (apiError.code === "HTTP_409" &&
      Array.isArray(details.risk_flags) &&
      "row_count_estimate" in details);
  if (!required) return null;
  return {
    detail: String(details.detail || "export risk confirmation required"),
    risk_confirmation_required: true,
    row_count_estimate:
      typeof details.row_count_estimate === "number" ? details.row_count_estimate : null,
    risk_flags: Array.isArray(details.risk_flags) ? details.risk_flags.map(String) : [],
    risk_details: isRecord(details.risk_details) ? details.risk_details : {},
  };
}

function riskConfirmationSummary(risk: CurrentExportRiskConfirmation) {
  const summary = [
    risk.row_count_estimate === null
      ? "预计行数待确认"
      : `预计导出 ${risk.row_count_estimate.toLocaleString()} 行`,
  ];
  const sensitiveFields = Array.isArray(risk.risk_details.sensitive_fields)
    ? risk.risk_details.sensitive_fields
    : [];
  if (risk.risk_flags.includes("large_export")) {
    summary.push(`超过大导出阈值 ${risk.risk_details.large_export_threshold ?? 5000} 行`);
  }
  if (sensitiveFields.length > 0) {
    summary.push(`包含敏感字段：${sensitiveFields.map((field) => field.label).join("、")}`);
  }
  summary.push("文件会在“我的导出”中保留 30 天");
  return summary;
}

function riskFlagLabel(flag: string) {
  if (flag === "large_export") return "大批量";
  if (flag === "sensitive_fields") return "敏感字段";
  return flag;
}

function uniqueEntityIds(values: number[]) {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function resolveRouteVisibleFields<Field extends { key: string }>(
  fields: Field[],
  visibleFieldKeys: string[]
) {
  const visibleKeySet = new Set(visibleFieldKeys);
  return fields.filter((field) => visibleKeySet.has(field.key));
}

function parseSchemaId(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
