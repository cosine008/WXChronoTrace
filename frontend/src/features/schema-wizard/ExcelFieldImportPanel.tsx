import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Wand2 } from "lucide-react";

import {
  previewExcelIntake,
  scanExcelIntake,
  type ExcelIntakeScanResponse,
  type SheetSummary,
} from "@/api/excelIntake";
import type { FieldConfig } from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { regenerateFieldKeys } from "@/features/excel-intake/fieldKeyGeneration";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { cn } from "@/lib/utils";
import { buildFieldImportPayload, fieldDraftsToFieldConfigs, sheetDefaults } from "./excelFieldImport";

type Props = {
  currentCount: number;
  onImport: (fields: FieldConfig[]) => void;
};

export function ExcelFieldImportPanel({ currentCount, onImport }: Props) {
  const notify = useNotification();
  const [filename, setFilename] = useState("");
  const [scan, setScan] = useState<ExcelIntakeScanResponse | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [dataStartRow, setDataStartRow] = useState(2);
  const [message, setMessage] = useState("");

  const selectedSheet = scan?.sheets.find((sheet) => sheet.name === sheetName);

  const scanMutation = useMutation({
    mutationFn: scanExcelIntake,
    onSuccess: (data) => {
      const defaults = sheetDefaults(data.sheets[0]);
      setScan(data);
      setSheetName(defaults.sheetName);
      setHeaderRow(defaults.headerRow);
      setDataStartRow(defaults.dataStartRow);
      setFilename(data.filename);
      setMessage("已读取工作簿");
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "Excel 读取失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  const inferMutation = useMutation({
    mutationFn: () => {
      if (!scan) throw new Error("missing scan");
      return previewExcelIntake(
        buildFieldImportPayload({
          uploadToken: scan.upload_token,
          sheetName,
          headerRow,
          dataStartRow,
        })
      );
    },
    onSuccess: (data) => {
      const generated = regenerateFieldKeys({
        schema: data.schema_draft,
        fields: data.fields,
      });
      const importedFields = fieldDraftsToFieldConfigs(generated.fields);
      if (importedFields.length === 0) {
        setMessage("没有可导入的字段");
        return;
      }
      onImport(importedFields);
      setMessage(`已生成 ${importedFields.length} 个字段`);
      notify.success({
        title: "字段已导入",
        message: `${filename || sheetName} 生成了 ${importedFields.length} 个字段卡片`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "字段生成失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  const busy = scanMutation.isPending || inferMutation.isPending;

  function selectSheet(sheet: SheetSummary) {
    const defaults = sheetDefaults(sheet);
    setSheetName(defaults.sheetName);
    setHeaderRow(defaults.headerRow);
    setDataStartRow(defaults.dataStartRow);
    setMessage("已切换 Sheet");
  }

  function inferFields() {
    if (!scan || !sheetName) {
      setMessage("请先选择 Excel 文件");
      return;
    }
    if (dataStartRow <= headerRow) {
      setMessage("数据起始行必须晚于表头行");
      return;
    }
    inferMutation.mutate();
  }

  return (
    <div className="grid gap-3 border-b border-border bg-background/60 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <span className="text-xs font-medium text-foreground">Excel 字段导入</span>
          <span className="text-xs text-muted-foreground">
            {filename || `${currentCount} 个当前字段`}
          </span>
        </div>
        <label
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-2 border border-border px-3 text-sm hover:border-foreground",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) scanMutation.mutate(file);
            }}
          />
          {scanMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet className="size-4" aria-hidden />
          )}
          选择 Excel
        </label>
      </div>

      {scan && (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Sheet</span>
              <select
                value={sheetName}
                onChange={(event) => {
                  const nextSheet = scan.sheets.find((sheet) => sheet.name === event.target.value);
                  if (nextSheet) selectSheet(nextSheet);
                }}
                className="h-9 min-w-0 border border-border bg-background px-2 outline-none focus:border-foreground"
              >
                {scan.sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="表头行" value={headerRow} onChange={setHeaderRow} />
            <NumberField label="数据起始行" value={dataStartRow} onChange={setDataStartRow} />
          </div>
          <button
            type="button"
            onClick={inferFields}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-50"
          >
            {inferMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Wand2 className="size-4" aria-hidden />
            )}
            生成字段
          </button>
        </div>
      )}

      {(message || selectedSheet) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {selectedSheet && (
            <span className="border border-border bg-card px-2 py-1 font-mono">
              {selectedSheet.row_count} rows / {selectedSheet.column_count} cols
            </span>
          )}
          {message && <span className="min-w-0 truncate">{message}</span>}
        </div>
      )}
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type="number"
        min={1}
        value={props.value}
        onChange={(event) => props.onChange(Math.max(1, Number(event.target.value) || 1))}
        className="h-9 min-w-0 border border-border bg-background px-2 outline-none focus:border-foreground"
      />
    </label>
  );
}
