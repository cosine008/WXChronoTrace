import type { ReactNode } from "react";
import type { DataSchema } from "@/api/schemas";
import type { DashboardSummary } from "@/api/stats";
import type { WorkbenchItem, WorkbenchNoteItem, WorkbenchOverviewResponse } from "@/api/workbench";
import {
  ArrowUpRight,
  Database,
  FileSpreadsheet,
  FolderKanban,
  NotebookPen,
} from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { SchemaObjectRow } from "@/components/schema/SchemaObjectRow";
import { formatFileSize } from "@/features/current-view/fileAssets";
import {
  DATA_CARD_CATEGORY_LABELS,
  DATA_CARD_STATUS_LABELS,
  dataCardStatusTone,
  getDataCardDetail,
} from "@/features/workbench/dataCardMeta";
import {
  formatMaterialTypeLabel,
  getMaterialDetail,
  getMaterialTypeKey,
} from "@/features/workbench/materialMeta";
import {
  NOTE_STAGE_LABELS,
  NOTE_STATUS_LABELS,
  getSafeNoteListDetail,
} from "@/features/workbench/noteMeta";
import {
  WorkbenchMetaLine,
  WorkbenchRow,
  WorkbenchRowActions,
  WorkbenchRowContent,
} from "@/features/workbench/WorkbenchLayout";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
  WorkbenchStatusTag,
} from "@/features/workbench/WorkbenchObjectMarkers";
import {
  getWorkbenchTypeLabel,
  getWorkbenchTypePath,
  safeWorkbenchObjectTitle,
} from "@/features/workbench/workbenchObjectMeta";
import { cn } from "@/lib/utils";

const TABLE_PREVIEW_LIMIT = 8;

export function WorkbenchOverviewPanel(props: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("grid min-w-0 self-start gap-3 px-4 py-4 md:px-5", props.className)}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{props.title}</h3>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {props.subtitle}
          </p>
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

export function WorkbenchQuickActions() {
  const actions = [
    { to: "/dashboard", label: "我的表", icon: FileSpreadsheet, hint: "回到旧版表工作区" },
    { to: "/schemas/new", label: "新建表", icon: FolderKanban, hint: "创建新的 schema" },
    { to: "/schemas/import-from-excel", label: "Excel 导入", icon: ArrowUpRight, hint: "从模板或文件开始" },
    { to: "/workbench/data-cards", label: "我的资料", icon: Database, hint: "查看资料卡与固定内容" },
  ];

  return (
    <div className="grid min-w-0 gap-2 xl:grid-cols-2">
      {actions.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          title={action.label}
          aria-label={action.label}
          className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 border border-border px-3 py-2.5 text-[15px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <action.icon className="size-4" aria-hidden />
          <div className="min-w-0">
            <div className="font-medium text-foreground">{action.label}</div>
            <div className="truncate text-[13px] text-muted-foreground">{action.hint}</div>
          </div>
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

export function WorkbenchContinueWorkList(props: { items: WorkbenchItem[] }) {
  return <WorkbenchItemList items={props.items} emptyTitle="最近没有需要续接的内容。" />;
}

export function WorkbenchFrequentItemsList(props: { items: WorkbenchItem[] }) {
  return <WorkbenchItemList items={props.items} emptyTitle="还没有固定内容。" />;
}

export function WorkbenchRecentItemsList(props: { items: WorkbenchItem[]; emptyTitle: string }) {
  return <WorkbenchItemList items={props.items} emptyTitle={props.emptyTitle} />;
}

export function WorkbenchNoteDigestPanel(props: {
  summary?: WorkbenchOverviewResponse["note_summary"];
  items: WorkbenchNoteItem[];
}) {
  const totalCount = props.summary?.total_count ?? 0;
  const pendingCount = props.summary?.pending_confirm_count ?? 0;
  const homepageCount = props.summary?.homepage_count ?? props.items.length;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <NoteDigestMetric label="待处理" value={pendingCount} emphasis={pendingCount > 0} />
        <NoteDigestMetric label="首页显示" value={homepageCount} />
        <NoteDigestMetric label="全部笔记" value={totalCount} />
      </div>

      <div className="grid min-w-0 gap-3 border border-border p-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center border border-border text-muted-foreground">
            <NotebookPen className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">笔记已收纳到专页</div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              首页只保留少量待处理线索，完整记录继续在我的笔记中筛选和检索。
            </p>
          </div>
        </div>
        <Link
          to="/workbench/notes"
          title="打开全部笔记"
          aria-label="打开全部笔记"
          className="inline-flex h-9 items-center justify-center gap-2 border border-border px-3 text-[13px] text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <ArrowUpRight className="size-4" aria-hidden />
          打开全部笔记
        </Link>
      </div>

      {props.items.length > 0 ? (
        <WorkbenchItemList items={props.items} emptyTitle="最近没有待处理笔记。" />
      ) : (
        <EmptyState minH="min-h-24" title="最近没有待处理笔记。" />
      )}
    </div>
  );
}

export function WorkbenchMyTablesPanel(props: {
  schemas: DataSchema[];
  dashboardSummary?: DashboardSummary;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
}) {
  if (props.isLoading) {
    return <LoadingState minH="min-h-40" label="加载我的表" />;
  }
  if (props.isError) {
    return (
      <ErrorState
        title="我的表加载失败"
        error={props.error}
        onRetry={props.onRetry}
        minH="min-h-40"
      />
    );
  }
  if (props.schemas.length === 0) {
    return (
      <EmptyState
        minH="min-h-40"
        title="当前还没有可见数据表。"
        description="可从右上角的新建表或 Excel 导入开始。"
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-[13px] text-muted-foreground">
          <span>可见 {metricValue(props.dashboardSummary?.schema_count)} 张表</span>
          <span>待审批 {metricValue(props.dashboardSummary?.pending_approval_count)}</span>
          <span>近 30 天变更 {metricValue(props.dashboardSummary?.recent_change_count)}</span>
        </div>
        <Link
          to="/dashboard"
          title="进入我的表"
          aria-label="进入我的表"
          className="inline-flex h-8 items-center justify-center gap-2 border border-border px-3 text-[13px] text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <FileSpreadsheet className="size-4" aria-hidden />
          打开全部
        </Link>
      </div>
      <div className="min-w-0 divide-y divide-border border border-border">
        {props.schemas.slice(0, TABLE_PREVIEW_LIMIT).map((schema) => (
          <SchemaObjectRow
            key={schema.id}
            density="compact"
            schema={{
              id: schema.id,
              name: schema.name,
              schemaCode: schema.schema_code,
              icon: schema.icon,
              temporalMode: schema.temporal_mode,
              visibility: schema.visibility,
              role: schema.role,
              isArchived: schema.is_archived,
              approvalRequired: schema.approval_required,
              fieldCount: schema.fields_config.length,
              currentVersion: schema.current_version,
              rowCount: schema.row_count,
              owner: schema.owner,
              fieldPreview: schema.fields_config,
              lastModifiedAt: schema.last_modified_at,
            }}
            recordsPath={`/schemas/${schema.id}/records`}
            settingsPath={`/schemas/${schema.id}/settings`}
          />
        ))}
      </div>
    </div>
  );
}

function WorkbenchItemList(props: { items: WorkbenchItem[]; emptyTitle: string }) {
  if (props.items.length === 0) {
    return <EmptyState minH="min-h-24" title={props.emptyTitle} />;
  }

  return (
    <div className="min-w-0 divide-y divide-border border border-border">
      {props.items.map((item) => (
        <WorkbenchItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function NoteDigestMetric(props: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div
      className={[
        "grid min-w-0 gap-1 border px-3 py-3",
        props.emphasis ? "border-foreground text-foreground" : "border-border text-muted-foreground",
      ].join(" ")}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.16em]">{props.label}</div>
      <div className="text-xl font-semibold tabular-nums text-foreground">{props.value}</div>
    </div>
  );
}

function WorkbenchItemRow({ item }: { item: WorkbenchItem }) {
  const linkedSchema = item.links.find((link) => link.target_schema?.accessible)?.target_schema;
  const typePath = getWorkbenchTypePath(item.type);
  const typeLabel = getWorkbenchTypeLabel(item.type);

  return (
    <WorkbenchRow className="px-3 py-3 sm:px-4">
      <WorkbenchRowContent className="gap-2">
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type={item.type} detail={workbenchKindDetail(item)} />
            <WorkbenchItemStatusTags item={item} />
          </div>
          <WorkbenchSignalRail pinned={item.is_pinned} sensitive={item.is_sensitive} />
        </div>
        <div className="truncate text-[15px] font-medium text-foreground">{safeWorkbenchObjectTitle(item)}</div>
        <div className="text-[13px] text-muted-foreground">{safeWorkbenchSummary(item)}</div>
        <WorkbenchMetaLine className="gap-x-3">
          <span>更新于 {formatDateTime(item.updated_at)}</span>
          {linkedSchema && <span>关联表 {linkedSchema.name ?? `#${linkedSchema.id}`}</span>}
        </WorkbenchMetaLine>
      </WorkbenchRowContent>
      <WorkbenchRowActions>
        {linkedSchema && (
          <Link
            to={`/schemas/${linkedSchema.id}/records`}
            title="打开关联表"
            aria-label="打开关联表"
            className="inline-flex h-8 items-center justify-center gap-1 border border-border px-2 text-[13px] text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            <FileSpreadsheet className="size-3.5" aria-hidden />
            关联表
          </Link>
        )}
        <Link
          to={typePath}
          title={`打开${typeLabel}列表`}
          aria-label={`打开${typeLabel}列表`}
          className="inline-flex h-8 items-center justify-center gap-1 border border-border px-2 text-[13px] text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" aria-hidden />
          打开
        </Link>
      </WorkbenchRowActions>
    </WorkbenchRow>
  );
}

function safeWorkbenchSummary(item: WorkbenchItem) {
  if (item.is_sensitive) return "敏感内容已隐藏。";
  const summary = item.summary.trim();
  if (summary) return summary;
  return item.type === "data_card" ? "未填写资料摘要。" : "未填写摘要。";
}

function WorkbenchItemStatusTags({ item }: { item: WorkbenchItem }) {
  if (item.type === "data_card") {
    const detail = getDataCardDetail(item);
    if (!detail) return null;
    return (
      <>
        <WorkbenchStatusTag code="CAT" label={DATA_CARD_CATEGORY_LABELS[detail.category]} tone="info" />
        <WorkbenchStatusTag
          code="STATE"
          label={DATA_CARD_STATUS_LABELS[detail.status]}
          tone={dataCardStatusTone(detail.status)}
        />
      </>
    );
  }
  if (item.type === "note") {
    const detail = getSafeNoteListDetail(item);
    return (
      <>
        <WorkbenchStatusTag code="STAGE" label={NOTE_STAGE_LABELS[detail.stage]} tone="info" />
        <WorkbenchStatusTag
          code="STATE"
          label={NOTE_STATUS_LABELS[detail.status]}
          tone={detail.status === "confirmed" ? "success" : detail.status === "pending_confirm" ? "warning" : "neutral"}
        />
      </>
    );
  }

  const detail = getMaterialDetail(item);
  return (
    <>
      <WorkbenchStatusTag code="TYPE" label={formatMaterialTypeLabel(getMaterialTypeKey(item))} />
      {detail ? <WorkbenchStatusTag code="SIZE" label={formatFileSize(detail.size)} /> : null}
    </>
  );
}

function workbenchKindDetail(item: WorkbenchItem) {
  if (item.type === "material") return formatMaterialTypeLabel(getMaterialTypeKey(item));
  if (item.type === "data_card") return "key-value";
  return "document";
}

function metricValue(value: number | undefined) {
  return value === undefined ? "--" : String(value);
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
