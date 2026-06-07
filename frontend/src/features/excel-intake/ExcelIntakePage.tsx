import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { createNote, createWorkbenchLink } from "@/api/workbench";
import {
  commitExcelIntake,
  previewExcelIntake,
  scanExcelIntake,
  type ExcelIntakePayload,
  type ExcelIntakePreviewResponse,
  type ExcelIntakeScanResponse,
  type FieldDraft,
  type SchemaDraft,
} from "@/api/excelIntake";
import { useNotification } from "@/components/notifications";
import { workbenchKeys } from "@/features/workbench/useWorkbenchQueries";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import {
  PreviewPanel,
  SheetPanel,
  StepTabs,
  StrategyPanel,
  UploadPanel,
} from "./ExcelIntakePanels";
import { FieldsPanel } from "./FieldDraftPanel";
import {
  buildIntakePayload,
  initialStrategy,
  type IntakeStrategy,
  type IntakeStep,
  validateReadyForPreview,
} from "./excelIntakeState";
import { regenerateFieldKeys } from "./fieldKeyGeneration";

export function ExcelIntakePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [step, setStep] = useState<IntakeStep>("upload");
  const [scan, setScan] = useState<ExcelIntakeScanResponse | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [dataStartRow, setDataStartRow] = useState(2);
  const [schema, setSchema] = useState<SchemaDraft | null>(null);
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [strategy, setStrategy] = useState<IntakeStrategy>(() => initialStrategy());
  const [preview, setPreview] = useState<ExcelIntakePreviewResponse | null>(null);
  const [previewPayload, setPreviewPayload] = useState<ExcelIntakePayload | null>(null);
  const [previewDirty, setPreviewDirty] = useState(true);
  const [message, setMessage] = useState("");
  const [savedWorkbenchNoteIds, setSavedWorkbenchNoteIds] = useState<number[]>([]);
  const [savedPreviewNoteKey, setSavedPreviewNoteKey] = useState<string | null>(null);

  const scanMutation = useMutation({
    mutationFn: scanExcelIntake,
    onSuccess: (data) => {
      const selected = data.sheets.length === 1 ? data.sheets[0] : data.sheets[0];
      setScan(data);
      setSavedWorkbenchNoteIds([]);
      setSavedPreviewNoteKey(null);
      setSheetName(selected?.name ?? "");
      setHeaderRow(selected?.recommended_header_row ?? 1);
      setDataStartRow(selected?.recommended_data_start_row ?? 2);
      setSchema(null);
      setFields([]);
      setPreview(null);
      setPreviewPayload(null);
      setPreviewDirty(true);
      setMessage("工作簿已扫描，请确认 Sheet 和表头行");
      setStep("sheet");
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "工作簿扫描失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  const inferMutation = useMutation({
    mutationFn: () => previewExcelIntake(payloadForPreview(false)),
    onSuccess: (data) => {
      const generated = regenerateFieldKeys({
        schema: data.schema_draft,
        fields: data.fields,
      });
      setSchema(generated.schema);
      setFields(generated.fields);
      setPreview(null);
      setPreviewPayload(null);
      setPreviewDirty(true);
      setSavedPreviewNoteKey(null);
      setMessage("字段草案已生成");
      setStep("fields");
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "字段草稿生成失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const payload = payloadForPreview(true);
      const data = await previewExcelIntake(payload);
      return { data, payload };
    },
    onSuccess: ({ data, payload }) => {
      setPreview(data);
      setPreviewPayload(payload);
      setPreviewDirty(false);
      setSavedPreviewNoteKey(null);
      setMessage(previewMessage(data));
      setStep("preview");
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "预览生成失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: (payload: ExcelIntakePayload) => commitExcelIntake(payload),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["schemas"] });
      const isEmptyImport = data.rows.length === 0;
      notify.success({
        title: isEmptyImport ? "空表已创建" : "导入草稿已生成",
        message: isEmptyImport
          ? `${data.schema.name} 已创建，暂无数据行`
          : `${data.schema.name} 已创建变更批次 #${data.change_set.id}`,
      });
      void linkSavedWorkbenchNotes({
        noteIds: savedWorkbenchNoteIds,
        schemaId: data.schema.id,
        queryClient,
        notify,
      });
      navigate(`/schemas/${data.schema.id}/records?change_set=${data.change_set.id}`);
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
  const savePreviewNoteMutation = useMutation({
    mutationFn: async () => {
      if (!preview || !schema) throw new Error("missing preview");
      const previewNoteKey = buildPreviewWorkbenchNoteKey(preview, schema, fields, strategy);
      const item = await createNote(buildPreviewWorkbenchNotePayload(preview, schema, fields, strategy));
      return { item, previewNoteKey };
    },
    onSuccess: async ({ item, previewNoteKey }) => {
      setSavedWorkbenchNoteIds((current) =>
        current.includes(item.id) ? current : [...current, item.id]
      );
      setSavedPreviewNoteKey(previewNoteKey);
      notify.success({
        title: "工作台笔记已保存",
        message: `${item.title} 将在提交后自动关联`,
      });
      await queryClient.invalidateQueries({ queryKey: workbenchKeys.all });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "保存工作台笔记失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const currentPreviewNoteKey =
    preview && schema ? buildPreviewWorkbenchNoteKey(preview, schema, fields, strategy) : null;
  const previewNoteSaved =
    currentPreviewNoteKey !== null && savedPreviewNoteKey === currentPreviewNoteKey;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6">
        <StepTabs step={step} canSelect={canSelectStep} onSelect={handleStepSelect} />
        <section className="min-h-[560px]">
          {step === "upload" && (
            <UploadPanel
              filename={scan?.filename ?? ""}
              loading={scanMutation.isPending}
              onPick={handleScanPick}
            />
          )}
          {step === "sheet" && scan && (
            <SheetPanel
              scan={scan}
              sheetName={sheetName}
              headerRow={headerRow}
              dataStartRow={dataStartRow}
              loading={inferMutation.isPending}
              onSheet={handleSheetChange}
              onHeaderRow={handleHeaderRowChange}
              onDataStartRow={handleDataStartRowChange}
              onInfer={handleInfer}
            />
          )}
          {step === "fields" && schema && (
            <FieldsPanel
              schema={schema}
              fields={fields}
              onSchema={(nextSchema) => {
                invalidatePreview();
                setSchema(nextSchema);
              }}
              onFields={(nextFields) => {
                invalidatePreview();
                setFields(nextFields);
              }}
            />
          )}
          {step === "strategy" && schema && (
            <StrategyPanel
              schema={schema}
              strategy={strategy}
              onSchema={(nextSchema) => {
                invalidatePreview();
                setSchema(nextSchema);
              }}
              onStrategy={(nextStrategy) => {
                invalidatePreview();
                setStrategy(nextStrategy);
              }}
              onPreview={handlePreview}
              loading={previewMutation.isPending}
            />
          )}
          {step === "preview" && (
            <PreviewPanel
              preview={preview}
              previewDirty={previewDirty}
              schema={schema}
              fields={fields}
              strategy={strategy}
              savedNoteCount={savedWorkbenchNoteIds.length}
              saveNoteSaved={previewNoteSaved}
              saveNoteLoading={savePreviewNoteMutation.isPending}
              canCommit={Boolean(previewPayload)}
              loading={commitMutation.isPending}
              onSaveNote={handleSavePreviewNote}
              onCommit={handleCommit}
            />
          )}
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="min-h-5 text-sm text-muted-foreground">{message}</p>
          <div className="flex items-center gap-2">
            {step === "fields" && (
              <button type="button" onClick={() => setStep("strategy")} className="h-10 bg-foreground px-4 text-sm text-background">
                确认字段
              </button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );

  function handleSheetChange(nextSheet: string) {
    const sheet = scan?.sheets.find((item) => item.name === nextSheet);
    setSheetName(nextSheet);
    setHeaderRow(sheet?.recommended_header_row ?? 1);
    setDataStartRow(sheet?.recommended_data_start_row ?? 2);
    setSchema(null);
    setFields([]);
    setPreview(null);
    setPreviewPayload(null);
    setPreviewDirty(true);
    setSavedPreviewNoteKey(null);
  }

  function handleHeaderRowChange(nextHeaderRow: number) {
    setHeaderRow(nextHeaderRow);
    setSchema(null);
    setFields([]);
    setPreview(null);
    setPreviewPayload(null);
    setPreviewDirty(true);
    setSavedPreviewNoteKey(null);
  }

  function handleDataStartRowChange(nextDataStartRow: number) {
    setDataStartRow(nextDataStartRow);
    setSchema(null);
    setFields([]);
    setPreview(null);
    setPreviewPayload(null);
    setPreviewDirty(true);
    setSavedPreviewNoteKey(null);
  }

  function handleScanPick(file: File) {
    if (scanMutation.isPending) return;
    scanMutation.mutate(file);
  }

  function handleInfer() {
    const error = validateSheetRows(headerRow, dataStartRow);
    if (error) return setMessage(error);
    return inferMutation.mutate();
  }

  function handlePreview() {
    const rowError = validateSheetRows(headerRow, dataStartRow);
    if (rowError) return setMessage(rowError);
    const error = validateReadyForPreview(scan, sheetName, schema, fields);
    if (error) return setMessage(error);
    return previewMutation.mutate();
  }

  function handleCommit() {
    if (savePreviewNoteMutation.isPending) {
      setMessage("工作台笔记仍在保存，请稍后提交");
      return;
    }
    if (!preview || previewDirty || !previewPayload) {
      setMessage("请先在策略步骤生成当前预览");
      return;
    }
    if (preview.summary.invalid > 0) {
      setMessage("预览仍有校验失败行，请修正后重新生成预览");
      return;
    }
    commitMutation.mutate(previewPayload);
  }

  function handleSavePreviewNote() {
    if (!preview || previewDirty || !schema) {
      setMessage("请先生成当前预览后再保存工作台笔记");
      return;
    }
    if (previewNoteSaved) {
      setMessage("当前预览已保存到工作台笔记");
      return;
    }
    savePreviewNoteMutation.mutate();
  }

  function handleStepSelect(nextStep: IntakeStep) {
    if (canSelectStep(nextStep)) {
      setStep(nextStep);
      return;
    }
    setMessage(disabledStepMessage(nextStep));
  }

  function canSelectStep(nextStep: IntakeStep) {
    if (nextStep === "upload") return true;
    if (nextStep === "sheet") return Boolean(scan);
    if (nextStep === "fields") return Boolean(schema && fields.length > 0);
    if (nextStep === "strategy") return Boolean(schema && fields.length > 0);
    if (nextStep === "preview") return Boolean(preview && !previewDirty);
    return false;
  }

  function disabledStepMessage(nextStep: IntakeStep) {
    if (nextStep === "sheet") return "请先上传 Excel";
    if (nextStep === "fields" || nextStep === "strategy") return "请先生成字段草案";
    if (nextStep === "preview") return "请先在策略步骤生成当前预览";
    return "";
  }

  function invalidatePreview() {
    setPreview(null);
    setPreviewPayload(null);
    setPreviewDirty(true);
    setSavedPreviewNoteKey(null);
    setMessage("参数已变更，请重新生成预览");
  }

  function validateSheetRows(nextHeaderRow: number, nextDataStartRow: number) {
    if (nextHeaderRow < 1) return "表头行必须大于 0";
    if (nextDataStartRow < 1) return "数据起始行必须大于 0";
    if (nextDataStartRow <= nextHeaderRow) return "数据起始行必须晚于表头行";
    return "";
  }

  function payloadForPreview(includeFields: boolean) {
    if (!scan) throw new Error("missing scan");
    return buildIntakePayload({
      scan,
      sheetName,
      headerRow,
      dataStartRow,
      schema: schema ?? fallbackSchema(),
      fields: includeFields ? fields : [],
      strategy,
    });
  }

  function fallbackSchema(): SchemaDraft {
    return {
      schema_code: "excel_table",
      name: sheetName || "Excel 数据表",
      description: "",
      icon: "table",
      temporal_mode: "continuous",
      period_unit: null,
      identity_mode: "single",
      identity_field_key: "",
      identity_field_keys: [],
      visibility: "private",
      approval_required: false,
      fields_config: [],
    };
  }
}

function previewMessage(data: ExcelIntakePreviewResponse) {
  if (data.identity_diagnostics.status === "error") {
    return "实体标识存在重复值，请重新选择标识字段";
  }
  if (data.summary.invalid > 0) return "预览存在校验失败行";
  if (data.rows.length === 0) return "预览已生成，将创建空表";
  return "预览已生成";
}

function buildPreviewWorkbenchNotePayload(
  preview: ExcelIntakePreviewResponse,
  schema: SchemaDraft,
  fields: FieldDraft[],
  strategy: IntakeStrategy
) {
  return {
    title: `Excel 导入诊断 · ${schema.name || schema.schema_code || "未命名表"}`,
    summary: buildPreviewSummaryLine(preview.summary),
    tags: [],
    markdown_content: buildPreviewWorkbenchMarkdown(preview, schema, fields, strategy),
    stage: "excel_import" as const,
    status: "pending_confirm" as const,
  };
}

function buildPreviewWorkbenchMarkdown(
  preview: ExcelIntakePreviewResponse,
  schema: SchemaDraft,
  fields: FieldDraft[],
  strategy: IntakeStrategy
) {
  const importedFields = fields.filter((field) => field.import);
  const diagnostics = preview.identity_diagnostics;
  const warnings = preview.identity_warnings ?? [];
  const duplicates = diagnostics.duplicate_values.slice(0, 6);
  const visibleErrors = preview.errors.slice(0, 8);
  const sections = [
    "# Excel 导入诊断",
    "",
    "## 表草稿",
    `- 表名: ${schema.name || "-"}`,
    `- 表编码: ${schema.schema_code || "-"}`,
    `- 实体标识: ${identityDraftValue(schema)}`,
    `- 导入字段: ${importedFields.length} 个`,
    "",
    "## 导入策略",
    `- 生效日期: ${strategy.validFrom || "-"}`,
    `- 缺失策略: ${strategy.missingPolicy === "terminate" ? "缺失终止" : "缺失保留"}`,
    `- 来源追踪: ${strategy.sourceTracking ? "附加 source_file / source_sheet / source_row_no" : "不附加"}`,
    `- 变更摘要: ${strategy.summary || "-"}`,
    "",
    "## 预览汇总",
    `- 新增: ${preview.summary.create}`,
    `- 更新: ${preview.summary.update}`,
    `- 缺失: ${preview.summary.missing}`,
    `- 失败: ${preview.summary.invalid}`,
    `- 不变: ${preview.summary.unchanged}`,
    "",
    "## 实体标识诊断",
    `- 状态: ${diagnostics.status}`,
    `- 字段: ${diagnostics.identity_field_label || diagnostics.identity_field_key || "-"}`,
    `- 说明: ${diagnostics.message || "-"}`,
  ];

  if (duplicates.length > 0) {
    sections.push("", "## 可见重复值样例");
    duplicates.forEach((item) => {
      sections.push(`- ${item.value}: ${item.count} 次，行 ${item.row_numbers.join(", ")}`);
    });
  }

  if (warnings.length > 0) {
    sections.push("", "## 实体标识提醒");
    warnings.forEach((warning) => {
      sections.push(`- ${warning.message}`);
    });
  }

  if (visibleErrors.length > 0) {
    sections.push("", "## 可见校验错误（前 8 条）");
    visibleErrors.forEach((error) => {
      sections.push(`- \`${error.path}\`: ${error.message}`);
    });
  }

  return sections.join("\n");
}

function buildPreviewSummaryLine(summary: ExcelIntakePreviewResponse["summary"]) {
  return `新增 ${summary.create} / 更新 ${summary.update} / 失败 ${summary.invalid}`;
}

function buildPreviewWorkbenchNoteKey(
  preview: ExcelIntakePreviewResponse,
  schema: SchemaDraft,
  fields: FieldDraft[],
  strategy: IntakeStrategy
) {
  const payload = buildPreviewWorkbenchNotePayload(preview, schema, fields, strategy);
  return JSON.stringify(payload);
}

function identityDraftValue(schema: SchemaDraft) {
  if (schema.identity_mode === "composite") {
    return schema.identity_field_keys.join(" + ") || "-";
  }
  return schema.identity_field_key || "-";
}

async function linkSavedWorkbenchNotes(args: {
  noteIds: number[];
  schemaId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  notify: ReturnType<typeof useNotification>;
}) {
  const noteIds = [...new Set(args.noteIds)];
  if (noteIds.length === 0) return;

  const results = await Promise.allSettled(
    noteIds.map((source_item_id) =>
      createWorkbenchLink({ source_item_id, target_schema_id: args.schemaId })
    )
  );
  await args.queryClient.invalidateQueries({ queryKey: workbenchKeys.all });

  const failedCount = results.filter((result) => result.status === "rejected").length;
  if (failedCount === 0) return;

  args.notify.info({
    title: "工作台笔记未全部关联",
    message: `导入已提交，但仍有 ${failedCount}/${noteIds.length} 条笔记关联失败，可稍后在工作台补链。`,
  });
}
