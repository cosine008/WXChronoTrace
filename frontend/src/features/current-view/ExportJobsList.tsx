import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileWarning,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import {
  downloadExportJob,
  listExportJobs,
  type ExportFormat,
  type ExportJob,
  type ExportJobListParams,
  type ExportJobStatus,
} from "@/api/stats";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { saveBlob } from "@/lib/download";
import { cn } from "@/lib/utils";

type StatusFilter = ExportJobStatus | "all";

interface CurrentExportJobsListProps {
  schemaId?: number;
  onDownload?: (job: ExportJob) => void;
  onRecreate?: (job: ExportJob) => void;
  downloadingJobCode?: string | null;
  downloadBusy?: boolean;
  compact?: boolean;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "生成中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "expired", label: "已过期" },
  { value: "canceled", label: "已取消" },
];

const STATUS_META: Record<
  ExportJobStatus,
  { label: string; icon: typeof Clock3; className: string }
> = {
  queued: {
    label: "排队中",
    icon: Clock3,
    className: "border-border text-muted-foreground",
  },
  running: {
    label: "生成中",
    icon: Clock3,
    className: "border-[var(--color-status-info)] text-[var(--color-status-info)]",
  },
  completed: {
    label: "已完成",
    icon: CheckCircle2,
    className: "border-[var(--color-status-new)] text-[var(--color-status-new)]",
  },
  failed: {
    label: "失败",
    icon: XCircle,
    className: "border-[var(--color-status-error)] text-[var(--color-status-error)]",
  },
  expired: {
    label: "已过期",
    icon: FileWarning,
    className: "border-[var(--color-status-modified)] text-[var(--color-status-modified)]",
  },
  canceled: {
    label: "已取消",
    icon: XCircle,
    className: "border-border border-dashed text-muted-foreground",
  },
};

const FORMAT_LABEL: Record<ExportFormat, string> = {
  csv: "CSV",
  xlsx: "Excel",
};

const RISK_LABELS: Record<string, string> = {
  large_export: "大批量",
  sensitive_fields: "敏感字段",
};

export function CurrentExportJobsList(props: CurrentExportJobsListProps) {
  const notify = useNotification();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [includeExpired, setIncludeExpired] = useState(false);
  const queryParams = useMemo<ExportJobListParams>(
    () => ({
      status: status === "all" ? undefined : status,
      schema_id: props.schemaId,
      include_expired: includeExpired || status === "expired",
    }),
    [includeExpired, props.schemaId, status]
  );
  const jobsQuery = useQuery({
    queryKey: [
      "current-export-jobs",
      props.schemaId ?? "all",
      queryParams.status ?? "all",
      queryParams.include_expired ? "with-expired" : "active-only",
    ],
    queryFn: () => listExportJobs(queryParams),
    refetchInterval: (query) => {
      const data = query.state.data as { results?: ExportJob[] } | undefined;
      return hasActiveExportJob(data?.results ?? []) ? 2000 : false;
    },
    refetchIntervalInBackground: false,
  });
  const downloadMutation = useMutation({
    mutationFn: async (job: ExportJob) => ({
      blob: await downloadExportJob(job.job_code),
      job,
    }),
    onSuccess: ({ blob, job }) => {
      const filename = resolveFilename(job);
      saveBlob(blob, filename);
      notify.success({
        title: "导出已下载",
        message: `${filename} 已保存。`,
      });
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "导出下载失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const jobs = jobsQuery.data?.results ?? [];
  const count = jobsQuery.data?.count ?? jobs.length;

  const handleDownload = (job: ExportJob) => {
    if (props.onDownload) {
      props.onDownload(job);
      return;
    }
    downloadMutation.mutate(job);
  };

  return (
    <section
      className={cn(
        "nd-interactive-surface grid min-w-0 gap-3 border border-border bg-background",
        props.compact ? "p-3" : "p-4"
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">我的导出</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{props.schemaId ? "当前表任务" : "当前用户全部任务"}</span>
            <span>共 {count} 项</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex h-8 items-center gap-2 border border-border px-2 text-muted-foreground">
            <span>状态</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="min-w-24 bg-transparent text-foreground outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex h-8 items-center gap-2 border border-border px-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={includeExpired}
              onChange={(event) => setIncludeExpired(event.target.checked)}
              className="size-3.5 rounded border-border"
            />
            包含已过期
          </label>
        </div>
      </header>

      {jobsQuery.isLoading ? (
        <LoadingState minH="min-h-40" label="加载导出任务" />
      ) : jobsQuery.isError ? (
        <ErrorState
          title="导出任务加载失败"
          error={jobsQuery.error}
          onRetry={() => jobsQuery.refetch()}
          minH="min-h-40"
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="暂无导出任务"
          description="导出任务生成后会显示在这里，可按状态筛选和下载。"
          minH="min-h-40"
        />
      ) : (
        <div className="grid gap-2">
          {jobs.map((job) => (
            <ExportJobRow
              key={job.job_code}
              job={job}
              compact={props.compact}
              downloading={
                (downloadMutation.isPending &&
                  downloadMutation.variables?.job_code === job.job_code) ||
                Boolean(props.downloadBusy && props.downloadingJobCode === job.job_code)
              }
              onDownload={handleDownload}
              onRecreate={props.onRecreate}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ExportJobRow(props: {
  job: ExportJob;
  compact?: boolean;
  downloading: boolean;
  onDownload: (job: ExportJob) => void;
  onRecreate?: (job: ExportJob) => void;
}) {
  const canDownload = props.job.status === "completed" && Boolean(props.job.download_url);
  const waitNotice = exportJobWaitNotice(props.job);
  return (
    <article className={cn("grid gap-3 border border-border bg-card", props.compact ? "p-3" : "p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">
              {props.job.filename || resolveFilename(props.job)}
            </h3>
            <ExportStatusBadge status={props.job.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{props.job.schema.name}</span>
            <span>{props.job.schema.schema_code}</span>
            <span>{FORMAT_LABEL[props.job.format]}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canDownload && (
            <button
              type="button"
              onClick={() => props.onDownload(props.job)}
              disabled={props.downloading}
              className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
            >
              <Download className="size-3.5" aria-hidden />
              {props.downloading ? "下载中" : "下载"}
            </button>
          )}
          {props.job.status === "expired" && (
            <button
              type="button"
              disabled
              className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground opacity-40"
            >
              <Download className="size-3.5" aria-hidden />
              已过期
            </button>
          )}
          {props.job.status === "failed" && (
            <button
              type="button"
              onClick={() => props.onRecreate?.(props.job)}
              disabled={!props.onRecreate}
              className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
            >
              <RefreshCcw className="size-3.5" aria-hidden />
              重新创建
            </button>
          )}
        </div>
      </div>

      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
        <MetaItem label="预计行数" value={formatNumber(props.job.row_count_estimate)} />
        <MetaItem label="实际行数" value={formatNumber(props.job.row_count_actual)} />
        <MetaItem label="风险标记" value={<RiskFlagList job={props.job} />} />
        <MetaItem label="创建时间" value={formatDateTime(props.job.created_at)} />
        <MetaItem label="过期时间" value={formatDateTime(props.job.expires_at)} />
      </dl>

      {waitNotice && (
        <div className="grid gap-1 border border-[var(--color-status-modified)]/50 bg-[var(--color-status-modified)]/10 px-3 py-2 text-xs">
          <div className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangle className="size-3.5 text-[var(--color-status-modified)]" aria-hidden />
            {waitNotice.title}
          </div>
          <div className="text-muted-foreground">{waitNotice.message}</div>
        </div>
      )}

      {props.job.error_message && (
        <div className="grid gap-1 border border-[var(--color-status-error)]/40 bg-[var(--color-status-error)]/5 px-3 py-2 text-xs">
          <div className="font-medium text-[var(--color-status-error)]">失败原因</div>
          <div className="break-words text-foreground">{props.job.error_message}</div>
        </div>
      )}
    </article>
  );
}

function ExportStatusBadge(props: { status: ExportJobStatus }) {
  const meta = STATUS_META[props.status];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 border px-2 text-[11px] font-medium", meta.className)}>
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}

function RiskFlagList(props: { job: ExportJob }) {
  if (props.job.risk_flags.length === 0) return <span>无</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {props.job.risk_flags.map((flag) => (
        <span
          key={flag}
          className="inline-flex h-5 items-center border border-[var(--color-status-modified)]/80 bg-[var(--color-status-modified)]/10 px-1.5 text-[11px] text-foreground"
        >
          {RISK_LABELS[flag] ?? flag}
        </span>
      ))}
    </span>
  );
}

function MetaItem(props: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt>{props.label}</dt>
      <dd className="min-w-0 break-words text-foreground">{props.value}</dd>
    </div>
  );
}

function resolveFilename(job: ExportJob) {
  return job.filename || `${job.schema.schema_code}_${job.query_snapshot.at}.${job.format}`;
}

function formatNumber(value: number | null) {
  return value === null ? "-" : new Intl.NumberFormat("zh-CN").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasActiveExportJob(jobs: ExportJob[]) {
  return jobs.some((job) => job.status === "queued" || job.status === "running");
}

function exportJobWaitNotice(job: ExportJob) {
  if (job.status === "queued" && !job.started_at && ageInMilliseconds(job.created_at) > 120_000) {
    return {
      title: "排队等待时间偏长",
      message: "后台导出处理器可能未运行，请确认 export worker 是否已启动。",
    };
  }
  if (job.status === "running" && ageInMilliseconds(job.started_at) > 600_000) {
    return {
      title: "生成耗时偏长",
      message: "导出仍在后台生成；如果持续超过 30 分钟，系统会自动标记失败。",
    };
  }
  return null;
}

function ageInMilliseconds(value: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : Date.now() - timestamp;
}
