import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer, Tags } from "lucide-react";

import {
  bulkCreateLabels,
  previewLabelSheet,
  printLabelSheet,
  type EntityLabel,
  type LabelBulkCreateResponse,
} from "@/api/labels";
import {
  LABEL_TEMPLATE_CODES,
  normalizeLabelPrintConfig,
  type CurrentViewRecord,
  type DataSchema,
  type LabelTemplateCode,
} from "@/api/schemas";
import { InlineMessage } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { printBlob } from "@/lib/printBlob";
import { cn } from "@/lib/utils";
import { LabelPreviewDialog } from "./LabelPrintPanel";
import { A4_LABEL_PRINT_TIPS } from "./labelPrintTips";

const DOWNLOAD_SCOPE_OPTIONS = [
  { value: "created", label: "仅本次新生成" },
  { value: "created_and_existing", label: "本次新生成 + 已有 active" },
  { value: "existing", label: "仅已有 active" },
] as const;

type DownloadScope = (typeof DOWNLOAD_SCOPE_OPTIONS)[number]["value"];

interface Props {
  schema: DataSchema;
  records: CurrentViewRecord[];
}

interface WorkflowVars {
  entityIds: number[];
  templateCode: LabelTemplateCode;
  downloadScope: DownloadScope;
}

interface WorkflowPreviewResult {
  bulk: LabelBulkCreateResponse;
  previewBlob: Blob | null;
  filename: string;
  labelsToPrint: EntityLabel[];
  printedCount: number;
}

interface WorkflowPrintResult extends WorkflowPreviewResult {
  blob: Blob;
}

export function SchemaLabelBatchPanel({ schema, records }: Props) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const labelPrintConfig = useMemo(
    () => normalizeLabelPrintConfig(schema.label_print_config),
    [schema.label_print_config]
  );
  const templateOptions = useMemo(
    () =>
      LABEL_TEMPLATE_CODES.filter((code) => labelPrintConfig.templates[code]?.enabled).map(
        (code) => ({
          value: code,
          label: labelPrintConfig.templates[code]?.label ?? code,
        })
      ),
    [labelPrintConfig]
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [templateCode, setTemplateCode] = useState<LabelTemplateCode>(
    labelPrintConfig.default_template_code
  );
  const [downloadScope, setDownloadScope] = useState<DownloadScope>("created");
  const [previewResult, setPreviewResult] = useState<WorkflowPreviewResult | null>(null);
  const pageEntityIds = useMemo(() => records.map((record) => record.entity_id), [records]);
  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.has(record.entity_id)),
    [records, selectedIds]
  );
  const allSelected = records.length > 0 && selectedRecords.length === records.length;
  const effectiveTemplateCode = templateOptions.some((option) => option.value === templateCode)
    ? templateCode
    : labelPrintConfig.default_template_code;
  const workflowMutation = useMutation({
    mutationFn: (vars: WorkflowVars) => previewBatchLabelWorkflow(schema.id, schema.schema_code, vars),
    onSuccess: async (result) => {
      setPreviewResult(result.previewBlob ? result : null);
      await queryClient.invalidateQueries({ queryKey: ["entity-labels"] });
      notify.success({
        title: result.previewBlob ? "A4 预览已生成" : "批量贴标已处理",
        message: batchPreviewMessage(result),
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "批量贴标失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const printMutation = useMutation({
    mutationFn: async (result: WorkflowPreviewResult) => {
      const printed = await printPreviewedLabelSheet(schema.id, result);
      await printBlob(printed.blob, { title: printed.filename });
      return printed;
    },
    onSuccess: async (result) => {
      setPreviewResult(null);
      await queryClient.invalidateQueries({ queryKey: ["entity-labels"] });
      notify.success({
        title: "A4 标签打印已发起",
        message: batchPrintMessage(result),
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "A4 标签打印失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const busy = workflowMutation.isPending || printMutation.isPending;

  async function handleWorkflow() {
    if (selectedRecords.length === 0) {
      notify.error({ title: "未选择实体", message: "请先选择需要贴标的实体。" });
      return;
    }
    const confirmed = await notify.confirm({
      title: "确认批量生成标签",
      description:
        downloadScope === "existing"
          ? "系统只查找所选实体已有 active 标签，并排版为 A4 SVG。"
          : "系统会先生成缺失的 active 标签，再按输出范围排版为 A4 SVG。",
      impactSummary: [
        `实体：${selectedRecords.length} 条`,
        `标签模板：${downloadScope === "existing" ? "不生成新标签" : templateLabel(effectiveTemplateCode, templateOptions)}`,
        `输出范围：${downloadScopeLabel(downloadScope)}`,
      ],
      confirmLabel: "生成预览",
      cancelLabel: "取消",
    });
    if (!confirmed) return;
    workflowMutation.mutate({
      entityIds: selectedRecords.map((record) => record.entity_id),
      templateCode: effectiveTemplateCode,
      downloadScope,
    });
  }

  return (
    <div className="grid gap-4">
      <BatchSummary
        recordCount={records.length}
        selectedCount={selectedRecords.length}
        printedCount={previewResult?.printedCount ?? workflowMutation.data?.printedCount ?? 0}
      />
      <section className="grid gap-3 border border-border p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(11rem,0.8fr)_minmax(18rem,1.2fr)] xl:items-end">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">标签模板</span>
            <select
              value={effectiveTemplateCode}
              onChange={(event) => setTemplateCode(event.target.value as LabelTemplateCode)}
              disabled={downloadScope === "existing" || busy}
              className="h-9 border border-border bg-transparent px-3 text-sm"
            >
              {templateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-1">
            <legend className="text-xs font-medium text-muted-foreground">输出范围</legend>
            <div className="grid overflow-hidden border border-border sm:grid-cols-3">
              {DOWNLOAD_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDownloadScope(option.value)}
                  disabled={busy}
                  aria-pressed={downloadScope === option.value}
                  className={cn(
                    "min-h-9 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0",
                    downloadScope === option.value
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    busy && "opacity-50"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            disabled={records.length === 0 || busy}
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
          >
            <Tags className="size-4" aria-hidden />
            {allSelected ? "清空选择" : "选择当前页"}
          </button>
          <button
            type="button"
            onClick={() => void handleWorkflow()}
            disabled={selectedRecords.length === 0 || busy}
            className="inline-flex h-9 items-center gap-2 border border-foreground bg-foreground px-3 text-sm text-background disabled:opacity-40"
          >
            <Printer className="size-4" aria-hidden />
            {workflowMutation.isPending ? "生成预览中" : "生成 A4 预览"}
          </button>
        </div>
        {(workflowMutation.error || printMutation.error) && (
          <div className="border border-[var(--color-status-error)] px-3 py-2">
            <InlineMessage tone="error" error={workflowMutation.error ?? printMutation.error} />
          </div>
        )}
      </section>
      <RecordSelectionList
        records={records}
        selectedIds={selectedIds}
        busy={busy}
        onToggle={toggleRecord}
      />
      <LabelPreviewDialog
        blob={previewResult?.previewBlob ?? null}
        title={`A4 标签预览（${previewResult?.printedCount ?? 0} 个）`}
        filename={previewResult?.filename ?? `${schema.schema_code}_labels-a4.svg`}
        description="预览不会记录打印；点击打印 A4 后会逐个写入打印审计并打开系统打印窗口。下载 A4 SVG 不写入审计。"
        downloadLabel="下载 A4 SVG"
        downloadDisabled={printMutation.isPending}
        printLabel={printMutation.isPending ? "打开打印窗口中" : "打印 A4"}
        printDisabled={printMutation.isPending}
        printTips={A4_LABEL_PRINT_TIPS}
        onClose={() => setPreviewResult(null)}
        onPrint={() => {
          if (previewResult) printMutation.mutate(previewResult);
        }}
      />
    </div>
  );

  function toggleAll() {
    setSelectedIds((current) => {
      if (!allSelected) return new Set([...current, ...pageEntityIds]);
      return new Set([...current].filter((id) => !pageEntityIds.includes(id)));
    });
  }

  function toggleRecord(entityId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }
}

function BatchSummary(props: {
  recordCount: number;
  selectedCount: number;
  printedCount: number;
}) {
  return (
    <section className="grid grid-cols-3 border border-border text-sm">
      <Metric label="当前页" value={props.recordCount} />
      <Metric label="已选择" value={props.selectedCount} />
      <Metric label="本次预览" value={props.printedCount} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-border px-3 py-2 last:border-r-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function RecordSelectionList(props: {
  records: CurrentViewRecord[];
  selectedIds: Set<number>;
  busy: boolean;
  onToggle: (entityId: number) => void;
}) {
  if (props.records.length === 0) {
    return (
      <p className="border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        当前页无实体
      </p>
    );
  }

  return (
    <div className="grid max-h-[34rem] overflow-auto border border-border">
      {props.records.map((record) => {
        const selected = props.selectedIds.has(record.entity_id);
        return (
          <label
            key={record.entity_id}
            className={cn(
              "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted",
              props.busy && "opacity-50",
              selected && "bg-muted"
            )}
          >
            <input
              type="checkbox"
              disabled={props.busy}
              checked={selected}
              onChange={() => props.onToggle(record.entity_id)}
              className="size-4 accent-foreground"
              aria-label={`选择 ${recordLabel(record)}`}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{recordLabel(record)}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                entity #{record.entity_id}
              </span>
            </span>
            <span className="border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {rowStatusLabel(record.row_status)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

async function previewBatchLabelWorkflow(
  schemaId: number,
  schemaCode: string,
  vars: WorkflowVars
): Promise<WorkflowPreviewResult> {
  const bulk = await bulkCreateLabels(schemaId, {
    entity_ids: vars.entityIds,
    template_code: vars.templateCode,
    skip_existing_active: true,
    create_missing: vars.downloadScope !== "existing",
  });
  const labelsToPrint = labelsForDownloadScope(bulk, vars.downloadScope);
  if (labelsToPrint.length === 0) {
    return {
      bulk,
      previewBlob: null,
      filename: `${schemaCode}_labels-a4.svg`,
      labelsToPrint,
      printedCount: 0,
    };
  }
  const previewBlob = await previewLabelSheet(schemaId, {
    format: "svg",
    template_code: "a4_grid",
    label_ids: labelsToPrint.map((label) => label.id),
  });
  return {
    bulk,
    previewBlob,
    filename: `${schemaCode}_labels-a4.svg`,
    labelsToPrint,
    printedCount: labelsToPrint.length,
  };
}

async function printPreviewedLabelSheet(
  schemaId: number,
  result: WorkflowPreviewResult
): Promise<WorkflowPrintResult> {
  const blob = await printLabelSheet(schemaId, {
    format: "svg",
    template_code: "a4_grid",
    label_ids: result.labelsToPrint.map((label) => label.id),
  });
  return { ...result, blob };
}

function labelsForDownloadScope(result: LabelBulkCreateResponse, scope: DownloadScope) {
  if (scope === "created") return result.created;
  const activeLabels = existingActiveLabels(result);
  if (scope === "existing") return uniqueLabels(activeLabels);
  return uniqueLabels([...result.created, ...activeLabels]);
}

function existingActiveLabels(result: LabelBulkCreateResponse) {
  return result.skipped.flatMap((item) =>
    item.reason === "active_label_exists" && item.label ? [item.label] : []
  );
}

function uniqueLabels(labels: EntityLabel[]) {
  const seen = new Set<number>();
  return labels.filter((label) => {
    if (seen.has(label.id)) return false;
    seen.add(label.id);
    return true;
  });
}

function batchPreviewMessage(result: WorkflowPreviewResult) {
  const existingCount = existingActiveLabels(result.bulk).length;
  const missingCount = result.bulk.skipped.filter((item) => item.reason === "active_label_missing").length;
  const parts = [`新增 ${result.bulk.created.length} 个`, `预览 ${result.printedCount} 个`];
  if (existingCount > 0) parts.push(`包含已有 ${existingCount} 个`);
  if (missingCount > 0) parts.push(`无 active ${missingCount} 个`);
  if (result.printedCount > 0) parts.push("确认后可打印或下载");
  return parts.join("，");
}

function batchPrintMessage(result: WorkflowPrintResult) {
  const existingCount = existingActiveLabels(result.bulk).length;
  const parts = [`新增 ${result.bulk.created.length} 个`, `打印 ${result.printedCount} 个`];
  if (existingCount > 0) parts.push(`包含已有 ${existingCount} 个`);
  parts.push("系统打印窗口已打开");
  return parts.join("，");
}

function recordLabel(record: CurrentViewRecord) {
  return record.display_code || record.business_code || `Entity #${record.entity_id}`;
}

function rowStatusLabel(status: CurrentViewRecord["row_status"]) {
  if (status === "new") return "新增";
  if (status === "modified") return "变更";
  if (status === "terminated") return "终止";
  return "当前";
}

function templateLabel(
  templateCode: LabelTemplateCode,
  options: Array<{ value: LabelTemplateCode; label: string }>
) {
  return options.find((option) => option.value === templateCode)?.label ?? templateCode;
}

function downloadScopeLabel(scope: DownloadScope) {
  return DOWNLOAD_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope;
}
