import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Columns3,
  Database,
  FileCheck2,
  Filter,
  ShieldCheck,
  X,
} from "lucide-react";

import type { FieldConfig, SchemaRole } from "@/api/schemas";
import type { ExportFormat, ExportSpec, StatsCurrentScopeParams } from "@/api/stats";
import { cn } from "@/lib/utils";
import {
  buildCurrentViewExportSpec,
  buildExportRiskSummary,
  columnModeLabel,
  filterSummary,
  formatExportFormat,
  orderingLabel,
  resolveExportFields,
  rowScopeLabel,
  type CurrentViewExportColumnMode,
  type CurrentViewExportRowScopeMode,
} from "./exportSpec";

interface Props {
  schemaId: number;
  schemaCode: string;
  schemaRole: SchemaRole | null;
  schemaVersion: number;
  format: ExportFormat;
  scope: StatsCurrentScopeParams;
  visibleFields: FieldConfig[];
  exportableFields: FieldConfig[];
  currentPageEntityIds: number[];
  selectedEntityIds: number[];
  filteredRowCount?: number;
  snapshotAllRowCount?: number;
  filteredRowCountLoading: boolean;
  snapshotAllRowCountLoading: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (spec: ExportSpec) => void;
}

const ROW_SCOPE_OPTIONS: Array<{
  value: CurrentViewExportRowScopeMode;
  description: string;
}> = [
  { value: "filtered_result", description: "保留搜索词、结构化筛选、排序和批次范围" },
  { value: "current_page", description: "冻结当前页已经加载的实体 ID 列表" },
  { value: "selected_entities", description: "仅导出当前页勾选的实体 ID 列表" },
  { value: "snapshot_all", description: "仅保留时间点和回溯模式" },
];

const COLUMN_MODE_OPTIONS: Array<{
  value: CurrentViewExportColumnMode;
  description: string;
}> = [
  { value: "visible_columns", description: "按表格当前列显示确认" },
  { value: "all_exportable", description: "包含所有当前可见字段" },
];

export function ExportConfirmPanel(props: Props) {
  const [rowScopeMode, setRowScopeMode] =
    useState<CurrentViewExportRowScopeMode>("filtered_result");
  const [columnMode, setColumnMode] =
    useState<CurrentViewExportColumnMode>("visible_columns");
  const activeRowScopeMode =
    rowScopeMode === "selected_entities" && props.selectedEntityIds.length === 0
      ? "filtered_result"
      : rowScopeMode;

  const spec = useMemo(
    () =>
      buildCurrentViewExportSpec({
        schemaId: props.schemaId,
        schemaVersion: props.schemaVersion,
        format: props.format,
        scope: props.scope,
        rowScopeMode: activeRowScopeMode,
        columnMode,
        visibleFields: props.visibleFields,
        exportableFields: props.exportableFields,
        currentPageEntityIds: props.currentPageEntityIds,
        selectedEntityIds: props.selectedEntityIds,
      }),
    [
      columnMode,
      props.currentPageEntityIds,
      props.exportableFields,
      props.format,
      props.schemaId,
      props.schemaVersion,
      props.scope,
      props.selectedEntityIds,
      props.visibleFields,
      activeRowScopeMode,
    ]
  );
  const selectedFields = useMemo(
    () => resolveExportFields(columnMode, props.visibleFields, props.exportableFields),
    [columnMode, props.exportableFields, props.visibleFields]
  );
  const rowCount = rowScopeRowCount(activeRowScopeMode, props);
  const rowCountLoading = rowScopeRowCountLoading(activeRowScopeMode, props);
  const riskSummary = buildExportRiskSummary({
    rowCount,
    fields: selectedFields,
    schemaRole: props.schemaRole,
  });
  const selectedEntitiesEmpty =
    activeRowScopeMode === "selected_entities" && props.selectedEntityIds.length === 0;
  const disabled = props.loading || selectedFields.length === 0 || selectedEntitiesEmpty;
  const appliedScope: StatsCurrentScopeParams = {
    at: spec.time.at,
    retro: spec.time.retro,
    search: spec.search,
    ordering: spec.ordering,
    change_set: spec.change_set ?? undefined,
    filters: spec.filters,
  };

  return (
    <section
      data-testid="export-confirm-panel"
      className="flex h-full min-h-0 flex-col gap-4 border border-border bg-card/70 p-4"
      aria-label="导出确认"
    >
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pb-2 pr-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-display text-sm font-semibold">
              <FileCheck2 className="size-4" aria-hidden />
              确认数据表导出
              <span className="font-sans text-xs font-normal text-muted-foreground">
                {props.schemaCode} · {formatExportFormat(props.format)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              确认后会创建后台任务，文件生成完成后进入“我的导出”。
            </p>
          </div>
          <button
            type="button"
            onClick={props.onCancel}
            className="grid size-8 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            aria-label="取消导出确认"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grid items-start gap-3 md:grid-cols-2">
          <OptionGroup
            icon={<Database className="size-4" aria-hidden />}
            title="导出范围"
            options={ROW_SCOPE_OPTIONS.map((option) => ({
              ...option,
              label: rowScopeLabel(option.value),
              meta: rowCountLabel(
                rowScopeRowCount(option.value, props),
                rowScopeRowCountLoading(option.value, props)
              ),
              disabled:
                option.value === "selected_entities" && props.selectedEntityIds.length === 0,
              disabledReason:
                option.value === "selected_entities" && props.selectedEntityIds.length === 0
                  ? "未勾选行"
                  : undefined,
            }))}
            value={activeRowScopeMode}
            onChange={(value) => setRowScopeMode(value as CurrentViewExportRowScopeMode)}
          />
          <OptionGroup
            icon={<Columns3 className="size-4" aria-hidden />}
            title="导出列"
            options={COLUMN_MODE_OPTIONS.map((option) => ({
              ...option,
              label: columnModeLabel(option.value),
              meta: `${resolveExportFields(
                option.value,
                props.visibleFields,
                props.exportableFields
              ).length.toLocaleString()} 列`,
            }))}
            value={columnMode}
            onChange={(value) => setColumnMode(value as CurrentViewExportColumnMode)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SummaryBlock
            icon={<Filter className="size-4" aria-hidden />}
            title="条件摘要"
            items={[
              `时间点：${spec.time.at || "当前日期"}${spec.time.retro ? " · 回溯" : ""}`,
              `范围：${rowScopeLabel(activeRowScopeMode)}`,
              ...filterSummary(appliedScope),
              `排序：${orderingLabel(spec.ordering)}`,
            ]}
          />
          <SummaryBlock
            icon={
              riskSummary[0] === "未发现明显风险" ? (
                <ShieldCheck className="size-4" aria-hidden />
              ) : (
                <AlertTriangle className="size-4" aria-hidden />
              )
            }
            title="预计与风险"
            items={[
              `预计行数：${rowCountLabel(rowCount, rowCountLoading)}`,
              ...riskSummary,
            ]}
            tone={riskSummary[0] === "未发现明显风险" ? "neutral" : "warning"}
          />
        </div>

        <div className="grid gap-2 border border-border bg-background/70 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground">
              {columnModeLabel(columnMode)} · {selectedFields.length.toLocaleString()} 列
            </span>
            <span className="text-muted-foreground">
              ExportSpec v{props.schemaVersion}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-muted-foreground">
            {selectedFields.slice(0, 12).map((field) => (
              <span key={field.key} className="border border-border px-2 py-1">
                {field.label}
              </span>
            ))}
            {selectedFields.length > 12 && (
              <span className="border border-border px-2 py-1">
                另 {selectedFields.length - 12} 列
              </span>
            )}
            {selectedFields.length === 0 && (
              <span className="text-destructive">当前没有可确认的导出列</span>
            )}
          </div>
          <p className="text-muted-foreground">
            本次文件将按所选列生成；后端会在生成文件前再次过滤无权限字段。
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 pb-1 pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            取消不会创建任务；确认后如命中系统风险规则，仍会进入风险确认。
          </p>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <button
              type="button"
              onClick={props.onCancel}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => props.onConfirm(spec)}
              className="inline-flex h-9 items-center gap-2 border border-foreground bg-foreground px-3 text-sm text-background disabled:opacity-40"
            >
              <Check className="size-4" aria-hidden />
              确认创建任务
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function OptionGroup(props: {
  icon: ReactNode;
  title: string;
  value: string;
  options: Array<{
    value: string;
    label: string;
    description: string;
    meta: string;
    disabled?: boolean;
    disabledReason?: string;
  }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-5 items-center gap-2 text-xs font-medium text-muted-foreground">
        {props.icon}
        {props.title}
      </div>
      <div className="grid gap-2">
        {props.options.map((option) => {
          const active = props.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-pressed={active}
              onClick={() => props.onChange(option.value)}
              className={cn(
                "grid gap-1 border px-3 py-2 text-left text-sm",
                option.disabled
                  ? "cursor-not-allowed border-border bg-muted/30 text-muted-foreground opacity-60"
                  : active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:border-foreground"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{option.label}</span>
                <span className={active ? "text-background/70" : "text-muted-foreground"}>
                  {option.disabledReason ?? option.meta}
                </span>
              </span>
              <span className={active ? "text-background/70" : "text-muted-foreground"}>
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryBlock(props: {
  icon: ReactNode;
  title: string;
  items: string[];
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={cn(
        "grid gap-2 border px-3 py-2 text-xs",
        props.tone === "warning"
          ? "border-[var(--color-status-warning)]/50 bg-[var(--color-status-warning)]/10"
          : "border-border bg-background/70"
      )}
    >
      <div className="flex items-center gap-2 font-medium text-foreground">
        {props.icon}
        {props.title}
      </div>
      <ul className="grid gap-1 text-muted-foreground">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function rowCountLabel(value: number | undefined, loading: boolean) {
  if (loading) return "统计中";
  if (value === undefined) return "待后端确认";
  return `${value.toLocaleString()} 行`;
}

function rowScopeRowCount(
  mode: CurrentViewExportRowScopeMode,
  props: Pick<
    Props,
    | "filteredRowCount"
    | "snapshotAllRowCount"
    | "currentPageEntityIds"
    | "selectedEntityIds"
  >
) {
  if (mode === "current_page") return props.currentPageEntityIds.length;
  if (mode === "selected_entities") return props.selectedEntityIds.length;
  if (mode === "snapshot_all") return props.snapshotAllRowCount;
  return props.filteredRowCount;
}

function rowScopeRowCountLoading(
  mode: CurrentViewExportRowScopeMode,
  props: Pick<Props, "filteredRowCountLoading" | "snapshotAllRowCountLoading">
) {
  if (mode === "snapshot_all") return props.snapshotAllRowCountLoading;
  if (mode === "filtered_result") return props.filteredRowCountLoading;
  return false;
}
