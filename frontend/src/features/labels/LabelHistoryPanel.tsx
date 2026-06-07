import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  createEntityLabel,
  listEntityLabels,
  previewLabel,
  previewLabelSheet,
  printLabel,
  printLabelSheet,
  replaceLabel,
  revokeLabel,
  type EntityLabel,
} from "@/api/labels";
import { ErrorState, InlineMessage, LoadingState } from "@/components/feedback";
import { printBlob } from "@/lib/printBlob";
import { cn } from "@/lib/utils";
import { LabelPreviewButton, LabelPreviewDialog, LabelSheetPreviewButton } from "./LabelPrintPanel";
import { A4_LABEL_PRINT_TIPS, SINGLE_LABEL_PRINT_TIPS } from "./labelPrintTips";

const STATUS_LABEL: Record<EntityLabel["status"], string> = {
  active: "有效",
  revoked: "作废",
  lost: "遗失",
  replaced: "替换",
};

export function LabelHistoryPanel(props: { entityId: number; canManage: boolean }) {
  const queryClient = useQueryClient();
  const queryKey = ["entity-labels", props.entityId] as const;
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const labelsQuery = useQuery({
    queryKey,
    queryFn: () => listEntityLabels(props.entityId),
  });
  const createMutation = useMutation({
    mutationFn: () => createEntityLabel(props.entityId, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const printMutation = useMutation({
    mutationFn: async (label: EntityLabel) => {
      const filename = `${label.label_code}.svg`;
      const blob = await printLabel(label.id, { format: "svg" });
      await printBlob(blob, { title: filename });
      return label;
    },
    onSuccess: async () => {
      setPreviewTarget(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const previewMutation = useMutation({
    mutationFn: (label: EntityLabel) => previewLabel(label.id, { format: "svg" }),
    onSuccess: (blob, label) => setPreviewTarget({ kind: "label", label, blob }),
  });
  const sheetPrintMutation = useMutation({
    mutationFn: async (labels: EntityLabel[]) => {
      const schemaId = labels[0]?.schema_id;
      if (!schemaId) throw new Error("没有可打印标签");
      const blob = await printLabelSheet(schemaId, {
        format: "svg",
        template_code: "a4_grid",
        label_ids: labels.map((label) => label.id),
      });
      await printBlob(blob, { title: "labels-a4.svg" });
      return labels;
    },
    onSuccess: async () => {
      setPreviewTarget(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const sheetPreviewMutation = useMutation({
    mutationFn: (labels: EntityLabel[]) => {
      const schemaId = labels[0]?.schema_id;
      if (!schemaId) throw new Error("没有可预览标签");
      return previewLabelSheet(schemaId, {
        format: "svg",
        template_code: "a4_grid",
        label_ids: labels.map((label) => label.id),
      });
    },
    onSuccess: (blob, labels) => setPreviewTarget({ kind: "sheet", labels, blob }),
  });
  const revokeMutation = useMutation({
    mutationFn: (label: EntityLabel) => revokeLabel(label.id, { reason: "现场标签作废" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const replaceMutation = useMutation({
    mutationFn: (label: EntityLabel) =>
      replaceLabel(label.id, { reason: "现场标签替换", template_code: label.template_code }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const labels = labelsQuery.data?.results ?? [];
  const printableLabels = labels.filter((label) => label.status === "active");
  const busy =
    previewMutation.isPending ||
    printMutation.isPending ||
    sheetPreviewMutation.isPending ||
    sheetPrintMutation.isPending ||
    revokeMutation.isPending ||
    replaceMutation.isPending;

  return (
    <section className="mb-4 grid gap-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">Physical labels</p>
          <h3 className="text-sm font-semibold">实体标签</h3>
        </div>
        {props.canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <LabelSheetPreviewButton
              labelCount={printableLabels.length}
              disabled={busy || printableLabels.length === 0}
              onPreview={() => sheetPreviewMutation.mutate(printableLabels)}
            />
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
            >
              <Plus className="size-3.5" aria-hidden />
              生成
            </button>
          </div>
        )}
      </div>

      <MutationErrors
        errors={[
          createMutation.error,
          previewMutation.error,
          printMutation.error,
          sheetPreviewMutation.error,
          sheetPrintMutation.error,
          revokeMutation.error,
          replaceMutation.error,
        ]}
      />

      {labelsQuery.isLoading ? (
        <LoadingState minH="min-h-24" label="加载标签" />
      ) : labelsQuery.isError ? (
        <ErrorState
          title="标签加载失败"
          error={labelsQuery.error}
          onRetry={() => labelsQuery.refetch()}
          minH="min-h-24"
        />
      ) : (
        <div className="grid gap-2">
          {labels.map((label) => (
            <LabelRow
              key={label.id}
              label={label}
              canManage={props.canManage}
              busy={busy}
              onPreview={(item) => previewMutation.mutate(item)}
              onRevoke={(item) => {
                if (window.confirm(`作废 ${item.label_code}？`)) revokeMutation.mutate(item);
              }}
              onReplace={(item) => {
                if (window.confirm(`替换 ${item.label_code}？`)) replaceMutation.mutate(item);
              }}
            />
          ))}
          {labels.length === 0 && (
            <p className="border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              暂无标签
            </p>
          )}
        </div>
      )}
      <LabelPreviewDialog
        blob={previewTarget?.blob ?? null}
        title={previewTitle(previewTarget)}
        filename={previewFilename(previewTarget)}
        description={previewDescription(previewTarget)}
        downloadLabel={downloadLabel(previewTarget)}
        downloadDisabled={printMutation.isPending || sheetPrintMutation.isPending}
        printLabel={printActionLabel(
          previewTarget,
          printMutation.isPending || sheetPrintMutation.isPending
        )}
        printDisabled={printMutation.isPending || sheetPrintMutation.isPending}
        printTips={previewPrintTips(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        onPrint={() => {
          if (previewTarget?.kind === "label") printMutation.mutate(previewTarget.label);
          if (previewTarget?.kind === "sheet") sheetPrintMutation.mutate(previewTarget.labels);
        }}
      />
    </section>
  );
}

type PreviewTarget =
  | { kind: "label"; label: EntityLabel; blob: Blob }
  | { kind: "sheet"; labels: EntityLabel[]; blob: Blob };

function LabelRow(props: {
  label: EntityLabel;
  canManage: boolean;
  busy: boolean;
  onPreview: (label: EntityLabel) => void;
  onRevoke: (label: EntityLabel) => void;
  onReplace: (label: EntityLabel) => void;
}) {
  const active = props.label.status === "active";
  return (
    <div className="grid gap-2 border border-border px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-xs">{props.label.label_code}</span>
        <span className={cn("border px-2 py-0.5 text-xs", active ? "border-foreground" : "border-border")}>
          {STATUS_LABEL[props.label.status]}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{new Date(props.label.issued_at).toLocaleString()}</span>
        {props.canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <LabelPreviewButton
              label={props.label}
              disabled={props.busy}
              onPreview={props.onPreview}
            />
            {active && (
              <>
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onReplace(props.label)}
                  className="inline-flex h-8 items-center gap-1 border border-border px-2 hover:border-foreground hover:text-foreground disabled:opacity-40"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  替换
                </button>
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onRevoke(props.label)}
                  className="inline-flex h-8 items-center gap-1 border border-border px-2 hover:border-foreground hover:text-foreground disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  作废
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function previewTitle(target: PreviewTarget | null) {
  if (!target) return "标签预览";
  if (target.kind === "sheet") return `A4 标签预览（${target.labels.length} 个）`;
  return `标签预览 ${target.label.label_code}`;
}

function previewFilename(target: PreviewTarget | null) {
  if (!target) return "label-preview.svg";
  if (target.kind === "sheet") return "labels-a4.svg";
  return `${target.label.label_code}.svg`;
}

function previewDescription(target: PreviewTarget | null) {
  if (target?.kind === "sheet") {
    return "预览不会记录打印；点击打印 A4 后会逐个写入打印审计并打开系统打印窗口。下载 A4 SVG 不写入审计。";
  }
  return "预览不会记录打印；点击打印后会写入打印审计并打开系统打印窗口。下载 SVG 不写入审计。";
}

function downloadLabel(target: PreviewTarget | null) {
  if (!target) return undefined;
  if (target.kind === "sheet") return "下载 A4 SVG";
  return "下载 SVG";
}

function printActionLabel(target: PreviewTarget | null, pending: boolean) {
  if (pending) return "打开打印窗口中";
  if (target?.kind === "sheet") return "打印 A4";
  return "打印";
}

function previewPrintTips(target: PreviewTarget | null) {
  if (!target) return undefined;
  return target.kind === "sheet" ? A4_LABEL_PRINT_TIPS : SINGLE_LABEL_PRINT_TIPS;
}

function MutationErrors({ errors }: { errors: unknown[] }) {
  const error = errors.find(Boolean);
  if (!error) return null;
  return (
    <div className="border border-[var(--color-status-error)] px-3 py-2">
      <InlineMessage tone="error" error={error} />
    </div>
  );
}
