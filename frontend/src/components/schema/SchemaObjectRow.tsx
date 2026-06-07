import type { ReactNode } from "react";
import { Archive, Settings, ShieldCheck, Table2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { SchemaRole, SchemaVisibility, TemporalMode } from "@/api/schemas";
import { PermissionTag } from "@/components/badges";
import {
  SchemaObjectFieldPreviewList,
  type SchemaObjectFieldPreview,
} from "@/components/schema/SchemaObjectFieldPreview";
import { SchemaIcon } from "@/components/schema-icons/SchemaIconPicker";
import { cn } from "@/lib/utils";

export type SchemaObjectDensity = "dashboard" | "compact" | "admin";

export interface SchemaObjectModel {
  id: number;
  name: string;
  schemaCode: string;
  icon?: string;
  temporalMode?: TemporalMode;
  visibility: SchemaVisibility;
  role?: SchemaRole | null;
  isArchived?: boolean;
  approvalRequired?: boolean;
  fieldCount?: number;
  currentVersion?: number;
  rowCount?: number | null;
  owner?: { id?: number; username: string };
  createdBy?: { id?: number; username: string };
  fieldPreview?: SchemaObjectFieldPreview[];
  lastModifiedAt?: string | null;
  lastChangeAt?: string | null;
  pendingChangesetCount?: number;
  changeCount?: number;
}

interface SchemaObjectRowProps {
  schema: SchemaObjectModel;
  density?: SchemaObjectDensity;
  recordsPath: string;
  settingsPath?: string;
  actions?: ReactNode;
  className?: string;
}

export function SchemaObjectRow({
  schema,
  density = "dashboard",
  recordsPath,
  settingsPath,
  actions,
  className,
}: SchemaObjectRowProps) {
  const compact = density === "compact";
  const admin = density === "admin";
  const fieldCount = schema.fieldCount ?? schema.fieldPreview?.length ?? 0;
  const hasSecondaryMeta =
    (schema.rowCount !== undefined && schema.rowCount !== null) ||
    Boolean(schema.owner) ||
    Boolean(schema.lastModifiedAt);

  return (
    <article
      className={cn(
        "nd-interactive-row grid min-w-0 gap-4 px-4 py-4",
        compact && "px-3 py-3",
        admin
          ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(180px,0.72fr)_minmax(180px,0.78fr)_auto] xl:items-center"
          : "md:grid-cols-[minmax(250px,1fr)_220px_auto] md:items-center md:gap-3",
        className
      )}
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SchemaBadge icon={schema.icon} compact={compact} />
          <SchemaCode code={schema.schemaCode} />
          <h3
            className={cn(
              "min-w-0 truncate font-display font-semibold",
              compact ? "text-sm" : "text-lg"
            )}
          >
            <Link
              to={recordsPath}
              aria-label={`打开 ${schema.name} 数据视图`}
              className="block truncate underline-offset-4 outline-none hover:underline focus-visible:underline"
            >
              {schema.name}
            </Link>
          </h3>
          {schema.role && <PermissionTag role={schema.role} size="xs" />}
          <PermissionTag visibility={schema.visibility} size="xs" />
          {schema.isArchived && <ArchiveToken />}
          {schema.approvalRequired && <ApprovalToken />}
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {schema.temporalMode && <span>{formatTemporalMode(schema.temporalMode)}</span>}
          {schema.currentVersion !== undefined && <span>版本 v{schema.currentVersion}</span>}
          <span>{fieldCount} 个字段</span>
          {admin && hasSecondaryMeta && <SchemaSecondaryMetaItems schema={schema} />}
        </div>
      </div>

      {admin && <AdminMeta schema={schema} />}

      {admin ? (
        <SchemaObjectFieldPreviewList
          fields={schema.fieldPreview ?? []}
          fieldCount={fieldCount}
          hasRows={(schema.rowCount ?? 1) > 0}
          compact={compact}
        />
      ) : (
        <div className="grid min-w-0 gap-2 md:justify-items-end">
          <SchemaObjectFieldPreviewList
            fields={schema.fieldPreview ?? []}
            fieldCount={fieldCount}
            hasRows={(schema.rowCount ?? 1) > 0}
            compact={compact}
          />
          {hasSecondaryMeta && (
            <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground md:justify-end">
              <SchemaSecondaryMetaItems schema={schema} />
            </div>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center justify-start gap-3 md:justify-end">
        {actions ?? <SchemaActions recordsPath={recordsPath} settingsPath={settingsPath} />}
      </div>
    </article>
  );
}

function SchemaBadge({ icon, compact }: { icon?: string; compact: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center border border-border bg-background text-muted-foreground",
        compact ? "size-8" : "size-10"
      )}
    >
      <SchemaIcon value={icon ?? "database"} className={compact ? "size-3.5" : "size-4"} />
    </span>
  );
}

function SchemaCode({ code }: { code: string }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center border border-border bg-background px-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-foreground/80">
      <span className="truncate">{code}</span>
    </span>
  );
}

function AdminMeta({ schema }: { schema: SchemaObjectModel }) {
  return (
    <div className="grid min-w-0 gap-1 text-xs">
      <MetricLine label="创建" value={schema.createdBy?.username ?? "-"} />
      <MetricLine label="待审" value={schema.pendingChangesetCount ?? 0} />
      <MetricLine label="变更" value={schema.changeCount ?? 0} />
      <time className="truncate font-mono text-[11px] text-muted-foreground">
        {schema.lastChangeAt ? `最后变更 ${formatDateTime(schema.lastChangeAt)}` : "无变更"}
      </time>
    </div>
  );
}

function SchemaActions({
  recordsPath,
  settingsPath,
}: { recordsPath: string; settingsPath?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ActionLink to={recordsPath} title="打开数据视图" ariaLabel="打开数据视图">
        <Table2 className="size-4" aria-hidden />
      </ActionLink>
      {settingsPath && (
        <ActionLink to={settingsPath} title="表设置" ariaLabel="打开表设置">
          <Settings className="size-4" aria-hidden />
        </ActionLink>
      )}
    </div>
  );
}

function ActionLink(props: { to: string; title: string; ariaLabel: string; children: ReactNode }) {
  return (
    <Link
      to={props.to}
      title={props.title}
      aria-label={props.ariaLabel}
      className="grid size-9 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:border-foreground focus-visible:text-foreground focus-visible:outline-none"
    >
      {props.children}
    </Link>
  );
}

function SchemaSecondaryMetaItems({ schema }: { schema: SchemaObjectModel }) {
  return (
    <>
      {schema.rowCount !== undefined && schema.rowCount !== null && (
        <RowCountState rowCount={schema.rowCount} />
      )}
      {schema.owner && <span>Owner {schema.owner.username}</span>}
      {schema.lastModifiedAt && <span>修改 {formatDateTime(schema.lastModifiedAt)}</span>}
    </>
  );
}

function RowCountState({ rowCount }: { rowCount: number }) {
  if (rowCount === 0) return <span>0 条数据</span>;
  return <span>{rowCount} 条数据</span>;
}

function ArchiveToken() {
  return (
    <span className="inline-flex h-6 items-center gap-1 border border-dashed border-border px-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
      <Archive className="size-3" aria-hidden />
      归档
    </span>
  );
}

function ApprovalToken() {
  return (
    <span className="inline-flex h-6 items-center gap-1 border border-[var(--color-status-modified)] px-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-status-modified)]">
      <ShieldCheck className="size-3" aria-hidden />
      审批
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

function formatTemporalMode(mode: TemporalMode) {
  return mode === "continuous" ? "连续时间" : "周期快照";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
