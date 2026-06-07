import {
  ArrowRight,
  AlertTriangle,
  Check,
  FileSpreadsheet,
  Loader2,
  NotebookPen,
  Upload,
} from "lucide-react";

import type {
  FieldDraft,
  ExcelIntakePreviewResponse,
  ExcelIntakeScanResponse,
  SchemaDraft,
} from "@/api/excelIntake";
import type { SchemaVisibility } from "@/api/schemas";
import { GENERATED_ENTITY_CODE_FIELD_KEY } from "@/lib/schemaFields";
import { cn } from "@/lib/utils";
import {
  INTAKE_STEPS,
  type IntakeStrategy,
  type IntakeStep,
  stringifyCell,
} from "./excelIntakeState";

const SUMMARY_LABELS: Record<string, string> = {
  create: "新增",
  update: "更新",
  missing: "缺失",
  invalid: "失败",
  unchanged: "不变",
};

const ACTION_LABELS: Record<string, string> = {
  create: "新增",
  update: "更新",
  terminate: "终止",
  missing: "缺失",
  invalid: "失败",
  unchanged: "不变",
};

export function StepTabs(props: {
  step: IntakeStep;
  canSelect: (step: IntakeStep) => boolean;
  onSelect: (step: IntakeStep) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="nd-interactive-surface grid grid-cols-5 border border-border bg-card">
        {INTAKE_STEPS.map((item, index) => {
          const disabled = !props.canSelect(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-current={props.step === item.id ? "step" : undefined}
              aria-disabled={disabled}
              onClick={() => props.onSelect(item.id)}
              className={cn(
                "nd-interactive-row flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 border-r border-border px-1 text-xs last:border-r-0 sm:h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm",
                props.step === item.id && "nd-active-row bg-foreground text-background",
                disabled && props.step !== item.id && "text-muted-foreground opacity-55"
              )}
            >
              <span className="font-mono text-[10px] sm:text-xs">{String(index + 1).padStart(2, "0")}</span>
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UploadPanel(props: {
  filename: string;
  loading: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <label
        className={cn(
          "nd-interactive-surface grid min-h-64 place-items-center border border-dashed border-border bg-card p-6 text-center",
          props.loading ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-foreground"
        )}
      >
        <input
          id="excel-intake-file"
          name="excel_intake_file"
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={props.loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) props.onPick(file);
          }}
        />
        <span className="grid gap-3">
          <FileSpreadsheet className="mx-auto size-10" aria-hidden />
          <span className="font-display text-xl font-semibold">
            {props.filename || "选择一个 .xlsx 文件"}
          </span>
          <span className="text-sm text-muted-foreground">只读取一个工作簿中的一个 Sheet。</span>
          {props.loading && <Loader2 className="mx-auto size-5 animate-spin" aria-hidden />}
        </span>
      </label>
      <div className="nd-interactive-surface border border-border bg-background p-5">
        <h2 className="font-display text-lg font-semibold">接入范围</h2>
        <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
          <Fact label="文件" value="单个 .xlsx" />
          <Fact label="Sheet" value="用户单选一个 Sheet" />
          <Fact label="结果" value="创建一张表，生成一个草稿变更批次" />
          <Fact label="发布" value="不自动发布，进入当前视图后复核" />
        </div>
      </div>
    </section>
  );
}

export function SheetPanel(props: {
  scan: ExcelIntakeScanResponse;
  sheetName: string;
  headerRow: number;
  dataStartRow: number;
  loading: boolean;
  onSheet: (name: string) => void;
  onHeaderRow: (value: number) => void;
  onDataStartRow: (value: number) => void;
  onInfer: () => void;
}) {
  const sheet = props.scan.sheets.find((item) => item.name === props.sheetName);
  return (
    <section className="grid gap-5 xl:grid-cols-[320px_1fr]">
      <div className="grid gap-2">
        {props.scan.sheets.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => props.onSheet(item.name)}
            className={cn(
              "nd-interactive-surface grid gap-1 border border-border p-3 text-left hover:border-foreground",
              props.sheetName === item.name && "border-foreground bg-card"
            )}
          >
            <span className="font-display font-semibold">{item.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {item.row_count} rows / {item.column_count} cols
            </span>
          </button>
        ))}
      </div>
      <div className="nd-interactive-surface grid gap-4 border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <NumberInput
            id="excel-header-row"
            name="header_row"
            label="表头行"
            value={props.headerRow}
            onChange={props.onHeaderRow}
          />
          <NumberInput
            id="excel-data-start-row"
            name="data_start_row"
            label="数据起始行"
            value={props.dataStartRow}
            onChange={props.onDataStartRow}
          />
          <button
            type="button"
            onClick={props.onInfer}
            disabled={props.loading}
            className="inline-flex h-10 self-end items-center justify-center gap-2 bg-foreground px-4 text-sm text-background disabled:opacity-50"
          >
            {props.loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            生成字段草案
          </button>
        </div>
        {sheet && <SheetPreview rows={sheet.preview_rows} />}
      </div>
    </section>
  );
}

export function StrategyPanel(props: {
  schema: SchemaDraft;
  strategy: IntakeStrategy;
  onSchema: (schema: SchemaDraft) => void;
  onStrategy: (strategy: IntakeStrategy) => void;
  onPreview: () => void;
  loading: boolean;
}) {
  return (
    <section className="nd-interactive-surface grid gap-4 border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <TextInput
          id="excel-valid-from"
          name="valid_from"
          label="生效日期"
          type="date"
          value={props.strategy.validFrom}
          onChange={(validFrom) => props.onStrategy({ ...props.strategy, validFrom })}
        />
        <SelectInput
          id="excel-missing-policy"
          name="missing_policy"
          label="缺失策略"
          value={props.strategy.missingPolicy}
          options={[
            ["keep", "缺失保留"],
            ["terminate", "缺失终止"],
          ]}
          onChange={(missingPolicy) => props.onStrategy({ ...props.strategy, missingPolicy })}
        />
        <SelectInput
          id="excel-visibility"
          name="visibility"
          label="可见性"
          value={props.schema.visibility}
          options={[
            ["private", "私有"],
            ["shared", "共享"],
            ["public", "公共"],
          ]}
          onChange={(visibility) =>
            props.onSchema({ ...props.schema, visibility: visibility as SchemaVisibility })
          }
        />
      </div>
      <TextInput
        id="excel-change-summary"
        name="summary"
        label="变更摘要"
        value={props.strategy.summary}
        onChange={(summary) => props.onStrategy({ ...props.strategy, summary })}
      />
      <textarea
        id="excel-schema-description"
        name="description"
        value={props.schema.description}
        onChange={(event) => props.onSchema({ ...props.schema, description: event.target.value })}
        placeholder="描述"
        className="min-h-24 border border-border bg-background px-3 py-2 text-sm outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            id="excel-source-tracking"
            name="source_tracking"
            type="checkbox"
            checked={props.strategy.sourceTracking}
            onChange={(event) =>
              props.onStrategy({ ...props.strategy, sourceTracking: event.target.checked })
            }
          />
          附加 source_file / source_sheet / source_row_no
        </label>
        <button
          type="button"
          onClick={props.onPreview}
          disabled={props.loading}
          className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm text-background disabled:opacity-50"
        >
          {props.loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          生成预览
        </button>
      </div>
    </section>
  );
}

export function PreviewPanel(props: {
  preview: ExcelIntakePreviewResponse | null;
  previewDirty: boolean;
  schema: SchemaDraft | null;
  fields: FieldDraft[];
  strategy: IntakeStrategy;
  savedNoteCount: number;
  saveNoteSaved: boolean;
  saveNoteLoading: boolean;
  canCommit: boolean;
  loading: boolean;
  onSaveNote: () => void;
  onCommit: () => void;
}) {
  if (!props.preview || props.previewDirty) {
    return (
      <div className="nd-interactive-surface border border-border p-6 text-sm text-muted-foreground">
        尚未生成当前预览，请回到策略步骤生成预览后再创建。
      </div>
    );
  }
  const rows = props.preview.rows.slice(0, 12);
  const isEmptyImport = props.preview.rows.length === 0;
  const importedFields = props.fields.filter((field) => field.import);
  const identityDiagnostics = props.preview.identity_diagnostics;
  const identityWarnings = props.preview.identity_warnings ?? [];
  return (
    <section className="grid gap-4">
      {identityDiagnostics.status === "error" && (
        <IdentityDiagnosticsAlert diagnostics={identityDiagnostics} />
      )}
      {identityWarnings.length > 0 && <IdentityWarningsAlert warnings={identityWarnings} />}
      <div className="nd-interactive-surface grid gap-3 border border-border bg-card p-4 md:grid-cols-[1fr_1fr_1fr]">
        <ReviewFact label="表名" value={props.schema?.name ?? "-"} />
        <ReviewFact label="表编码" value={props.schema?.schema_code ?? "-"} />
        <ReviewFact label="实体标识" value={identityReviewValue(props.schema)} />
        <ReviewFact label="生效日期" value={props.strategy.validFrom} />
        <ReviewFact
          label="缺失策略"
          value={props.strategy.missingPolicy === "terminate" ? "缺失终止" : "缺失保留"}
        />
        <ReviewFact label="导入字段" value={`${importedFields.length} 个`} />
        <ReviewFact label="可见性" value={visibilityLabel(props.schema?.visibility)} />
        <ReviewFact label="来源追踪" value={props.strategy.sourceTracking ? "附加" : "不附加"} />
        <ReviewFact label="变更摘要" value={props.strategy.summary || "-"} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(props.preview.summary).map(([label, value]) => (
          <div key={label} className="nd-interactive-surface border border-border bg-card p-3">
            <div className="font-mono text-xl">{value}</div>
            <div className="text-xs text-muted-foreground">{SUMMARY_LABELS[label] ?? label}</div>
          </div>
        ))}
      </div>
      <div className="overflow-auto border border-border">
        {isEmptyImport ? (
          <div className="nd-interactive-surface flex min-h-24 items-center gap-3 border-0 bg-card px-4 py-5 text-sm text-muted-foreground">
            <FileSpreadsheet className="size-5 shrink-0" aria-hidden />
            <span>没有数据行，将只创建表结构。</span>
          </div>
        ) : (
          rows.map((row) => (
            <div key={`${row.row_number}-${row.business_code}`} className="nd-interactive-row grid grid-cols-[64px_minmax(0,1fr)_80px] gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[80px_1fr_120px]">
              <span className="font-mono text-xs">row {row.row_number}</span>
              <span className="truncate">{previewRowLabel(row)}</span>
              <span className={row.action === "invalid" ? "text-[var(--color-status-error)]" : "text-muted-foreground"}>
                {ACTION_LABELS[row.action] ?? row.action}
              </span>
            </div>
          ))
        )}
      </div>
      {props.preview.errors.length > 0 && (
        <div className="nd-interactive-surface grid gap-2 border border-[var(--color-status-error)]/40 bg-card p-3 text-sm">
          <div className="font-medium text-[var(--color-status-error)]">校验错误</div>
          {props.preview.errors.slice(0, 8).map((error) => (
            <div key={`${error.path}:${error.code}:${error.message}`} className="text-muted-foreground">
              <span className="font-mono text-xs">{error.path}</span> · {error.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {props.saveNoteSaved ? (
          <div className="text-xs text-muted-foreground">当前预览已保存到工作台笔记。</div>
        ) : props.savedNoteCount > 0 ? (
          <div className="text-xs text-muted-foreground">
            已暂存 {props.savedNoteCount} 条工作台笔记，提交后自动关联。
          </div>
        ) : null}
        <button
          type="button"
          onClick={props.onSaveNote}
          disabled={props.saveNoteLoading || props.loading || props.saveNoteSaved}
          className="inline-flex h-10 items-center gap-2 border border-border px-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-50"
          data-testid="excel-intake-save-note-button"
        >
          {props.saveNoteLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <NotebookPen className="size-4" />
          )}
          {props.saveNoteSaved ? "已保存到工作台笔记" : "保存到工作台笔记"}
        </button>
        <button
          type="button"
          onClick={props.onCommit}
          disabled={
            props.loading ||
            props.saveNoteLoading ||
            !props.canCommit ||
            props.preview.summary.invalid > 0
          }
          className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm text-background disabled:opacity-50"
        >
          {props.loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {isEmptyImport ? "创建空表" : "创建表并生成草稿"}
        </button>
      </div>
    </section>
  );
}

function IdentityWarningsAlert(props: {
  warnings: ExcelIntakePreviewResponse["identity_warnings"];
}) {
  return (
    <div className="nd-interactive-surface grid gap-2 border border-[var(--color-status-warning)]/50 bg-card p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--color-status-warning)]" />
        <div className="grid gap-1">
          <div className="font-medium text-foreground">实体标识治理提示</div>
          {props.warnings.map((warning) => (
            <div key={warning.code} className="text-muted-foreground">
              {warning.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IdentityDiagnosticsAlert(props: {
  diagnostics: ExcelIntakePreviewResponse["identity_diagnostics"];
}) {
  const duplicates = props.diagnostics.duplicate_values.slice(0, 6);
  const hiddenCount = props.diagnostics.duplicate_values.length - duplicates.length;
  return (
    <div className="nd-interactive-surface grid gap-3 border border-[var(--color-status-error)]/50 bg-card p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--color-status-error)]" />
        <div className="grid gap-2">
          <div className="font-medium text-[var(--color-status-error)]">
            {props.diagnostics.mode === "composite" ? "当前组合实体标识" : "当前实体标识字段"}
            “{props.diagnostics.identity_field_label}”存在重复值
          </div>
          <div className="text-muted-foreground">{props.diagnostics.message}</div>
        </div>
      </div>
      <div className="grid gap-1 pl-8 font-mono text-xs">
        {duplicates.map((item) => (
          <div key={item.value} className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{item.value}</span>
            <span className="text-muted-foreground">出现 {item.count} 次</span>
            <span className="text-muted-foreground">行 {item.row_numbers.join(", ")}</span>
          </div>
        ))}
        {hiddenCount > 0 && <div className="text-muted-foreground">另有 {hiddenCount} 个重复值</div>}
      </div>
    </div>
  );
}

function SheetPreview({ rows }: { rows: unknown[][] }) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const [headerRow, ...bodyRows] = rows;
  const columnWidth = 160;
  const tableWidth = Math.max(columnCount * columnWidth, 720);
  return (
    <div className="nd-interactive-surface max-w-full overflow-auto border border-border bg-background">
      <table
        className="table-fixed border-collapse text-left text-xs"
        style={{ minWidth: tableWidth, width: tableWidth }}
      >
        <colgroup>
          {Array.from({ length: columnCount }).map((_, index) => (
            <col key={index} style={{ width: columnWidth }} />
          ))}
        </colgroup>
        <thead className="bg-card">
          <tr>
            {Array.from({ length: columnCount }).map((_, cellIndex) => (
              <PreviewCell
                key={cellIndex}
                value={headerRow?.[cellIndex]}
                as="th"
                className="font-medium"
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
          <tr key={rowIndex} className="nd-table-row">
              {Array.from({ length: columnCount }).map((_, cellIndex) => (
                <PreviewCell key={cellIndex} value={row[cellIndex]} as="td" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewCell(props: {
  value: unknown;
  as: "td" | "th";
  className?: string;
}) {
  const Component = props.as;
  const text = stringifyCell(props.value);
  return (
    <Component className={cn("border-r border-b border-border px-2 py-2 align-middle last:border-r-0", props.className)}>
      <div className="w-full truncate" title={text}>
        {text}
      </div>
    </Component>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 border-b border-border pb-2">
      <span>{props.label}</span>
      <span className="break-words text-right text-foreground">{props.value}</span>
    </div>
  );
}

function ReviewFact(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="min-w-0 break-words font-medium">{props.value}</span>
    </div>
  );
}

function TextInput(props: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label htmlFor={props.id} className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        id={props.id}
        name={props.name}
        type={props.type ?? "text"}
        min={props.type === "number" ? 1 : undefined}
        step={props.type === "number" ? 1 : undefined}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 outline-none"
      />
    </label>
  );
}

function NumberInput(props: {
  id: string;
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <TextInput
      id={props.id}
      name={props.name}
      label={props.label}
      type="number"
      value={String(props.value)}
      onChange={(value) => props.onChange(Number(value))}
    />
  );
}

function SelectInput<T extends string>(props: {
  id: string;
  name: string;
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <label htmlFor={props.id} className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <select
        id={props.id}
        name={props.name}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as T)}
        className="h-10 border border-border bg-background px-3"
      >
        {props.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function visibilityLabel(value: SchemaVisibility | undefined) {
  if (value === "shared") return "共享";
  if (value === "public") return "公共";
  return "私有";
}

function identityReviewValue(schema: SchemaDraft | null) {
  if (!schema) return "-";
  if (schema.identity_mode === "composite") return schema.identity_field_keys.join(" + ") || "-";
  if (schema.identity_field_key === GENERATED_ENTITY_CODE_FIELD_KEY) return "自动生成实体编码";
  return schema.identity_field_key || "-";
}

function previewRowLabel(row: ExcelIntakePreviewResponse["rows"][number]) {
  return row.display_code || row.business_code || stringifyCell(row.data_after);
}
