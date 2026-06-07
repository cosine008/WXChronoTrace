import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import {
  commitImport,
  downloadImportTemplate,
  previewImport,
  type FieldConfig,
  type ImportPreviewResponse,
  type ImportPreviewRow,
} from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { FieldValueInput } from "./FieldValueInput";
import { ImportIdentityDiagnosticsAlert } from "./ImportIdentityDiagnosticsAlert";

interface Props {
  schemaId: number;
  schemaCode: string;
  at: string;
  fields: FieldConfig[];
  onImported: (changeSetId: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ImportWizard({
  schemaId,
  schemaCode,
  at,
  fields,
  onImported,
  onDirtyChange,
}: Props) {
  const notify = useNotification();
  const fileInput = useRef<HTMLInputElement>(null);
  const defaultSummary = `Excel 导入 ${at}`;
  const [file, setFile] = useState<File | null>(null);
  const [missingPolicy, setMissingPolicy] = useState<"keep" | "terminate">("keep");
  const [summary, setSummary] = useState(defaultSummary);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [correctedRows, setCorrectedRows] = useState<ImportPreviewRow[]>([]);
  const [message, setMessage] = useState("");
  const downloadMutation = useMutation({
    mutationFn: () => downloadImportTemplate(schemaId),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${schemaCode}_template.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "模板下载失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const previewMutation = useMutation({
    mutationFn: () => previewImport(schemaId, formData()),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewDirty(false);
      setCorrectedRows(data.rows);
      const previewMessage = formatImportPreviewSummary(data);
      setMessage(importPreviewMessage(data));
      if (data.summary.invalid > 0) {
        notify.info({
          title: data.identity_diagnostics.status === "error" ? "实体标识存在重复值" : "预览存在待修正行",
          message:
            data.identity_diagnostics.status === "error"
              ? data.identity_diagnostics.message
              : previewMessage,
        });
      } else {
        notify.success({
          title: "导入预览已生成",
          message: previewMessage,
        });
      }
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "导入预览失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const commitMutation = useMutation({
    mutationFn: () => commitImport(schemaId, commitFormData()),
    onSuccess: (detail) => {
      const message = `已生成草稿 #${detail.id}`;
      setMessage(message);
      resetImportState();
      notify.success({
        title: "导入草稿已生成",
        message: `${detail.summary} · #${detail.id}`,
      });
      onImported(detail.id);
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "导入提交失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  useEffect(() => {
    onDirtyChange?.(
      Boolean(file) ||
        preview !== null ||
        previewDirty ||
        Object.keys(mappingOverrides).length > 0 ||
        correctedRows.length > 0 ||
        summary !== defaultSummary
    );
  }, [correctedRows.length, defaultSummary, file, mappingOverrides, onDirtyChange, preview, previewDirty, summary]);

  return (
    <section className="grid gap-3">
      <div className="nd-interactive-surface flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-3 py-2">
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{schemaCode}</span>
          <span className="mx-2">·</span>
          <span>生效日期 {at}</span>
        </div>
        <button
          type="button"
          data-testid="download-import-template"
          onClick={() => downloadMutation.mutate()}
          className="inline-flex h-8 items-center gap-2 border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Download className="size-4" aria-hidden />
          模板
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_150px]">
        <button
          type="button"
          data-testid="select-import-file"
          onClick={() => fileInput.current?.click()}
          className="inline-flex h-9 items-center gap-2 border border-border px-3 text-left text-sm text-muted-foreground"
        >
          <FileSpreadsheet className="size-4" aria-hidden />
          <span className="truncate">{file?.name ?? "选择 .xlsx 文件"}</span>
        </button>
        <select
          id="current-import-missing-policy"
          name="current_import_missing_policy"
          value={missingPolicy}
          onChange={(event) => {
            setMissingPolicy(event.target.value as "keep" | "terminate");
            markPreviewDirty();
          }}
          className="h-9 border border-border bg-background px-2 text-sm"
        >
          <option value="keep">缺失保留</option>
          <option value="terminate">缺失终止</option>
        </select>
      </div>
      <input
        ref={fileInput}
        id="current-import-file"
        name="current_import_file"
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setPreview(null);
          setPreviewDirty(false);
          setCorrectedRows([]);
        }}
      />
      <input
        id="current-import-summary"
        name="current_import_summary"
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        className="mt-2 h-9 w-full border border-border bg-background px-2 text-sm outline-none"
        placeholder="变更摘要"
      />
      {preview && <PreviewSummary preview={preview} />}
      {preview && preview.identity_diagnostics.status === "error" && (
        <ImportIdentityDiagnosticsAlert diagnostics={preview.identity_diagnostics} />
      )}
      {preview && previewDirty && (
        <div className="mt-3 border border-[var(--color-status-modified)] bg-[var(--color-status-modified)]/10 px-3 py-2 text-xs text-foreground">
          导入参数已变化，请重新预览后再生成草稿。
        </div>
      )}
      {preview && (
        <MappingEditor
          preview={preview}
          fields={fields}
          overrides={mappingOverrides}
          onChange={(source, fieldKey) => {
            setMappingOverrides((current) => ({ ...current, [source]: fieldKey }));
            markPreviewDirty();
          }}
        />
      )}
      {preview && correctedRows.some((row) => row.action === "invalid") && (
        <CorrectionEditor
          rows={correctedRows}
          fields={fields}
          onRowsChange={setCorrectedRows}
        />
      )}
      <div className="sticky bottom-0 -mx-4 mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-4 py-3">
        <p className="min-h-5 text-xs text-muted-foreground">{message}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="preview-import"
            disabled={!file || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
            className="h-9 border border-border px-3 text-sm hover:border-foreground disabled:opacity-40"
          >
            预览
          </button>
          <button
            type="button"
            data-testid="commit-import"
            disabled={
              !preview ||
              previewDirty ||
              correctedRows.some((row) => row.action === "invalid") ||
              commitMutation.isPending
            }
            onClick={() => void handleCommit()}
            className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-40"
          >
            <Upload className="size-4" aria-hidden />
            生成草稿
          </button>
        </div>
      </div>
    </section>
  );

  function formData(includeSummary = false) {
    const data = new FormData();
    if (file) data.append("file", file);
    data.append("at", at);
    data.append("missing_policy", missingPolicy);
    const mappings = Object.entries(mappingOverrides).map(([source_column, field_key]) => ({
      source_column,
      field_key,
    }));
    if (mappings.length > 0) data.append("mappings_json", JSON.stringify(mappings));
    if (includeSummary) data.append("summary", summary);
    return data;
  }

  function commitFormData() {
    const data = new FormData();
    data.append("summary", summary);
    if (preview) {
      data.append("rows_json", JSON.stringify(correctedRows));
      data.append("missing_json", JSON.stringify(preview.missing));
      return data;
    }
    return formData(true);
  }

  async function handleCommit() {
    if (!preview || previewDirty) return;
    const confirmed = await notify.confirm({
      title: "确认生成导入草稿",
      description: "确认后会根据当前预览生成草稿变更批次，发布前仍可复核和撤回。",
      impactSummary: [
        formatImportPreviewSummary(preview),
        `缺失策略：${missingPolicy === "terminate" ? "缺失终止" : "缺失保留"}`,
        `修正行：${correctedRows.filter((row) => row.action !== "invalid").length} / ${correctedRows.length}`,
        `摘要：${summary}`,
      ],
      confirmLabel: "生成草稿",
      cancelLabel: "取消",
    });
    if (confirmed) commitMutation.mutate();
  }

  function markPreviewDirty() {
    if (preview) setPreviewDirty(true);
  }

  function resetImportState() {
    setFile(null);
    setPreview(null);
    setPreviewDirty(false);
    setMappingOverrides({});
    setCorrectedRows([]);
    setMissingPolicy("keep");
    setSummary(defaultSummary);
    if (fileInput.current) fileInput.current.value = "";
  }
}

function formatImportPreviewSummary(preview: ImportPreviewResponse) {
  const { create, update, missing, invalid, unchanged } = preview.summary;
  return `新增 ${create} / 修改 ${update} / 缺失 ${missing} / 无变化 ${unchanged} / 失败 ${invalid}`;
}

function importPreviewMessage(preview: ImportPreviewResponse) {
  if (preview.identity_diagnostics.status === "error") {
    return "实体标识存在重复值，请重新选择标识字段或修正导入文件";
  }
  return preview.summary.invalid > 0 ? "预览存在校验失败行" : "预览已生成";
}

function PreviewSummary({ preview }: { preview: ImportPreviewResponse }) {
  const items = [
    ["新增", preview.summary.create],
    ["修改", preview.summary.update],
    ["缺失", preview.summary.missing],
    ["失败", preview.summary.invalid],
  ];
  return (
    <div className="mt-3 grid gap-2">
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {items.map(([label, value]) => (
          <div key={label} className="border border-border px-2 py-1">
            <div className="font-mono text-sm text-foreground">{value}</div>
            <div className="text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="max-h-40 overflow-auto border border-border">
        {[...preview.rows, ...preview.missing].slice(0, 8).map((row, index) => (
          <div key={`${row.business_code}-${index}`} className="flex items-center justify-between border-b border-border px-2 py-1 text-xs last:border-b-0">
            <span className="font-mono">{importPreviewRowLabel(row)}</span>
            <span className={row.action === "invalid" ? "text-[var(--color-status-error)]" : "text-muted-foreground"}>
              {row.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MappingEditor(props: {
  preview: ImportPreviewResponse;
  fields: FieldConfig[];
  overrides: Record<string, string>;
  onChange: (source: string, fieldKey: string) => void;
}) {
  return (
    <div className="nd-interactive-surface mt-3 grid gap-2 border border-border p-2">
      <div className="text-xs font-medium">字段映射</div>
      <div className="grid gap-2 md:grid-cols-2">
        {props.preview.mappings.map((mapping, index) => (
          <label key={mapping.source_column} className="grid gap-1 text-xs text-muted-foreground">
            {mapping.source_column}
            <select
              id={`current-import-mapping-${index}`}
              name={`current_import_mapping_${index}`}
              value={props.overrides[mapping.source_column] ?? mapping.field_key}
              onChange={(event) => props.onChange(mapping.source_column, event.target.value)}
              className="h-8 border border-border bg-background px-2 text-foreground"
            >
              <option value="">忽略</option>
              {props.fields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
              <option value="valid_from">valid_from</option>
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function CorrectionEditor(props: {
  rows: ImportPreviewRow[];
  fields: FieldConfig[];
  onRowsChange: (rows: ImportPreviewRow[]) => void;
}) {
  const invalidRows = props.rows.filter((row) => row.action === "invalid");
  return (
    <div className="mt-3 grid gap-2 border border-[var(--color-status-error)] p-2">
      <div className="text-xs font-medium text-[var(--color-status-error)]">修正失败行</div>
      {invalidRows.map((row, rowIndex) => (
        <div key={row.row_number ?? row.business_code} className="nd-interactive-surface grid gap-2 border border-border p-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">row {row.row_number}</span>
            <select
              id={`current-import-row-action-${rowIndex}`}
              name={`current_import_row_action_${rowIndex}`}
              value={row.action}
              onChange={(event) => updateRow(row, { action: event.target.value as ImportPreviewRow["action"] })}
              className="h-8 border border-border bg-background px-2 text-xs"
            >
              <option value="invalid">待修正</option>
              <option value="create">新增</option>
              <option value="update">修改</option>
            </select>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {props.fields.map((field) => (
              <FieldValueInput
                field={field}
                key={field.key}
                id={`current-import-row-${rowIndex}-${field.key}`}
                name={`current_import_row_${rowIndex}_${field.key}`}
                value={row.data_after?.[field.key] ?? ""}
                onChange={(value) =>
                  updateRow(row, {
                    data_after: {
                      ...(row.data_after ?? {}),
                      [field.key]: value,
                    },
                  })
                }
                placeholder={field.label}
                compact
              />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.errors.map((error) => error.message).join(" / ")}
          </div>
        </div>
      ))}
    </div>
  );

  function updateRow(target: ImportPreviewRow, patch: Partial<ImportPreviewRow>) {
    props.onRowsChange(
      props.rows.map((row) =>
        row === target ? { ...row, ...patch, errors: patch.action === "invalid" ? row.errors : [] } : row
      )
    );
  }
}

function importPreviewRowLabel(row: ImportPreviewRow) {
  return row.display_code || row.business_code || `row ${row.row_number}`;
}
