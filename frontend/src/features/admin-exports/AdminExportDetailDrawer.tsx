import type { UseQueryResult } from "@tanstack/react-query";

import type {
  AdminExportEventDetail,
  AdminExportEventRow,
  AdminExportJobDetail,
  AdminExportJobRow,
  AdminExportTab,
} from "@/api/adminExports";
import type { ExportJobRiskDetails, ExportJobRiskSensitiveField } from "@/api/stats";
import { ErrorState, LoadingState } from "@/components/feedback";
import { CurrentViewDrawer } from "@/features/current-view/CurrentViewDrawer";
import {
  adminExportFormatLabel,
  adminExportRiskLabel,
  adminExportSourceLabel,
  adminExportStatusMeta,
  adminExportYesNo,
  formatAdminExportDate,
  formatAdminExportFileSize,
  formatAdminExportNumber,
} from "./adminExportDisplay";

const SNAPSHOT_FIELDS = [
  "schema_id",
  "user_id",
  "at",
  "retro",
  "search",
  "ordering",
  "change_set",
  "schema_version",
  "format",
  "row_count",
] as const;

interface Props {
  kind: AdminExportTab;
  open: boolean;
  jobPreview?: AdminExportJobRow | null;
  eventPreview?: AdminExportEventRow | null;
  jobQuery: UseQueryResult<AdminExportJobDetail, Error>;
  eventQuery: UseQueryResult<AdminExportEventDetail, Error>;
  onClose: () => void;
}

export function AdminExportDetailDrawer(props: Props) {
  const title = props.kind === "jobs" ? "任务详情" : "事件详情";
  const meta = props.kind === "jobs" ? props.jobPreview?.job_code : props.eventPreview ? `#${props.eventPreview.id}` : undefined;

  return (
    <CurrentViewDrawer
      open={props.open}
      title={title}
      meta={meta}
      size="md"
      onRequestClose={props.onClose}
    >
      {props.kind === "jobs" ? (
        <JobDetailBody query={props.jobQuery} preview={props.jobPreview ?? null} />
      ) : (
        <EventDetailBody query={props.eventQuery} preview={props.eventPreview ?? null} />
      )}
    </CurrentViewDrawer>
  );
}

function JobDetailBody(props: {
  query: UseQueryResult<AdminExportJobDetail, Error>;
  preview: AdminExportJobRow | null;
}) {
  if (props.query.isLoading) {
    return <LoadingState minH="min-h-72" label="加载任务详情" />;
  }
  if (props.query.isError) {
    return <ErrorState title="任务详情加载失败" error={props.query.error} onRetry={() => props.query.refetch()} minH="min-h-72" />;
  }

  const job = props.query.data;
  if (!job) return null;
  const status = adminExportStatusMeta(job.status);

  return (
    <div className="grid gap-4">
      <Section title="基本信息">
        <DetailGrid
          items={[
            ["任务号", job.job_code],
            ["状态", <span className={`inline-flex h-6 items-center border px-2 text-[11px] ${status.className}`}>{status.label}</span>],
            ["用户", job.owner.username],
            ["表", `${job.schema.name} / ${job.schema.schema_code}`],
            ["范围", job.export_scope],
            ["格式", adminExportFormatLabel(job.format)],
          ]}
        />
      </Section>

      <Section title="文件信息">
        <DetailGrid
          items={[
            ["文件名", job.filename || "-"],
            ["文件大小", formatAdminExportFileSize(job.file_size_bytes)],
            ["有文件", adminExportYesNo(job.has_file)],
            ["过期时间", formatAdminExportDate(job.expires_at)],
          ]}
        />
      </Section>

      <Section title="执行信息">
        <DetailGrid
          items={[
            ["估算行数", formatAdminExportNumber(job.row_count_estimate)],
            ["实际行数", formatAdminExportNumber(job.row_count_actual)],
            ["创建时间", formatAdminExportDate(job.created_at)],
            ["开始时间", formatAdminExportDate(job.started_at)],
            ["完成时间", formatAdminExportDate(job.finished_at)],
          ]}
        />
      </Section>

      <Section title="风险">
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1">
            {job.risk_flags.length === 0 ? (
              <span className="text-sm text-muted-foreground">无风险标记</span>
            ) : (
              job.risk_flags.map((risk) => <RiskChip key={risk}>{adminExportRiskLabel(risk)}</RiskChip>)
            )}
          </div>
          <RiskDetailsBlock value={job.risk_details} />
        </div>
      </Section>

      {(job.error_code || job.error_message) && (
        <Section title="失败信息">
          <DetailGrid
            items={[
              ["错误码", job.error_code || "-"],
              ["错误信息", job.error_message || "-"],
            ]}
          />
        </Section>
      )}

      <Section title="查询快照">
        <SnapshotBlock value={job.query_snapshot} />
      </Section>

      <Section title="关联审计">
        {job.audit_events.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无关联事件</div>
        ) : (
          <div className="grid gap-2">
            {job.audit_events.map((event) => (
              <div key={event.id} className="grid gap-1 border border-border bg-background px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{event.action}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatAdminExportDate(event.created_at)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  #{event.id} / {event.actor_username || "system"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function EventDetailBody(props: {
  query: UseQueryResult<AdminExportEventDetail, Error>;
  preview: AdminExportEventRow | null;
}) {
  if (props.query.isLoading) {
    return <LoadingState minH="min-h-72" label="加载事件详情" />;
  }
  if (props.query.isError) {
    return <ErrorState title="事件详情加载失败" error={props.query.error} onRetry={() => props.query.refetch()} minH="min-h-72" />;
  }

  const event = props.query.data;
  if (!event) return null;

  return (
    <div className="grid gap-4">
      <Section title="基本信息">
        <DetailGrid
          items={[
            ["事件号", `#${event.id}`],
            ["动作", event.action],
            ["操作人", event.actor?.username || "system"],
            ["目标", `${event.target_type}${event.target_id === null ? "" : ` / ${event.target_id}`}`],
            ["创建时间", formatAdminExportDate(event.created_at)],
          ]}
        />
      </Section>

      <Section title="导出摘要">
        <DetailGrid
          items={[
            ["来源", adminExportSourceLabel(event.source)],
            ["任务号", event.job_code || "-"],
            ["表", event.schema_name || event.schema_code || "-"],
            ["格式", adminExportFormatLabel(event.format)],
            ["行数", formatAdminExportNumber(event.row_count)],
            ["文件大小", formatAdminExportFileSize(event.file_size_bytes)],
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-1">
          {event.risk_flags.length === 0 ? (
            <span className="text-sm text-muted-foreground">无风险标记</span>
          ) : (
            event.risk_flags.map((risk) => <RiskChip key={risk}>{adminExportRiskLabel(risk)}</RiskChip>)
          )}
        </div>
      </Section>

      <Section title="查询快照">
        <SnapshotBlock value={event.query_snapshot} />
      </Section>

      <Section title="安全 JSON">
        <JsonBlock value={event.detail} emptyLabel="无 detail" />
      </Section>
    </div>
  );
}

function RiskDetailsBlock(props: { value: ExportJobRiskDetails | null | undefined }) {
  const details = props.value ?? {};
  const threshold =
    typeof details.large_export_threshold === "number" ? details.large_export_threshold : null;
  const sensitiveFields = Array.isArray(details.sensitive_fields)
    ? details.sensitive_fields.filter(isSensitiveField)
    : [];
  const items: Array<[string, React.ReactNode]> = [];

  if (threshold !== null) {
    items.push(["大导出阈值", `${formatAdminExportNumber(threshold)} 行`]);
  }
  if (sensitiveFields.length > 0) {
    items.push(["敏感字段", <SensitiveFieldList fields={sensitiveFields} />]);
  }

  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground">无风险详情</div>;
  }

  return <DetailGrid items={items} />;
}

function SensitiveFieldList(props: { fields: ExportJobRiskSensitiveField[] }) {
  return (
    <div className="grid gap-2">
      {props.fields.map((field) => (
        <div key={`${field.key}:${field.label}`} className="grid gap-1 border border-border bg-background px-3 py-2">
          <div className="text-sm text-foreground">{field.label}</div>
          <div className="font-mono text-xs text-muted-foreground">{field.key}</div>
        </div>
      ))}
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border border-border bg-card p-3">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function DetailGrid(props: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-2 text-sm">
      {props.items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SnapshotBlock(props: { value: Record<string, unknown> | null | undefined }) {
  const entries = SNAPSHOT_FIELDS.flatMap((key) =>
    props.value && key in props.value
      ? ([[key, formatUnknown(props.value[key])]] satisfies Array<[string, React.ReactNode]>)
      : []
  );

  return (
    <div className="grid gap-3">
      {entries.length > 0 ? <DetailGrid items={entries} /> : <div className="text-sm text-muted-foreground">无快照信息</div>}
      <JsonBlock value={props.value} emptyLabel="无快照信息" />
    </div>
  );
}

function JsonBlock(props: { value: unknown; emptyLabel: string }) {
  const text = safeJson(props.value);
  if (!text) {
    return <div className="text-sm text-muted-foreground">{props.emptyLabel}</div>;
  }
  return (
    <pre className="max-h-64 overflow-auto border border-border bg-background p-3 font-mono text-[11px] leading-5 text-muted-foreground">
      {text}
    </pre>
  );
}

function RiskChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center border border-[var(--color-status-modified)]/80 bg-[var(--color-status-modified)]/10 px-1.5 text-[11px] text-foreground">
      {children}
    </span>
  );
}

function safeJson(value: unknown) {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatUnknown(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return safeJson(value);
  return String(value);
}

function isSensitiveField(value: unknown): value is ExportJobRiskSensitiveField {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ExportJobRiskSensitiveField>;
  return typeof candidate.key === "string" && typeof candidate.label === "string";
}
