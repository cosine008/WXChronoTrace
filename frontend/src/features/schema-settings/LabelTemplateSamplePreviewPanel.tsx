import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";

import {
  listSchemaActiveLabelSamples,
  previewLabel,
  type EntityLabel,
} from "@/api/labels";
import {
  LABEL_TEMPLATE_CODES,
  LABEL_TEMPLATE_LABELS,
  type DataSchema,
  type LabelPrintConfig,
  type LabelTemplateCode,
} from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { LabelPreviewDialog } from "@/features/labels/LabelPrintPanel";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { ensureDefaultTemplateEnabled } from "./labelPrintTemplateUtils";

type PreviewTarget = {
  blob: Blob;
  labelCode: string;
  templateCode: LabelTemplateCode;
};

const EMPTY_LABELS: EntityLabel[] = [];

export function LabelTemplateSamplePreviewPanel({
  schema,
  config,
  disabled = false,
}: {
  schema: DataSchema;
  config: LabelPrintConfig;
  disabled?: boolean;
}) {
  const notify = useNotification();
  const [sampleLabelId, setSampleLabelId] = useState("");
  const [templateCode, setTemplateCode] = useState<LabelTemplateCode>(config.default_template_code);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const effectiveConfig = useMemo(() => ensureDefaultTemplateEnabled(config), [config]);
  const templateOptions = LABEL_TEMPLATE_CODES.filter(
    (code) => effectiveConfig.templates[code]?.enabled
  );
  const selectedTemplateCode = templateOptions.includes(templateCode)
    ? templateCode
    : effectiveConfig.default_template_code;
  const samplesQuery = useQuery({
    queryKey: ["schema-label-samples", schema.id],
    queryFn: () => listSchemaActiveLabelSamples(schema.id),
    enabled: Number.isFinite(schema.id),
    retry: false,
  });
  const samples = samplesQuery.data?.results ?? EMPTY_LABELS;
  const selectedLabel = useMemo(
    () => samples.find((label) => label.id === Number(sampleLabelId)) ?? samples[0] ?? null,
    [sampleLabelId, samples]
  );
  const previewMutation = useMutation({
    mutationFn: (vars: { label: EntityLabel; templateCode: LabelTemplateCode }) =>
      previewLabel(vars.label.id, {
        format: "svg",
        template_code: vars.templateCode,
        label_print_config: effectiveConfig,
      }),
    onSuccess: (blob, vars) => {
      setPreviewTarget({
        blob,
        labelCode: vars.label.label_code,
        templateCode: vars.templateCode,
      });
      notify.success({
        title: "样张预览已生成",
        message: "预览使用当前页面配置，未保存配置，也未记录打印。",
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "样张预览生成失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const samplesError = samplesQuery.isError ? extractApiError(samplesQuery.error) : null;
  const busy = disabled || previewMutation.isPending || samplesQuery.isLoading;
  const canPreview = Boolean(selectedLabel) && templateOptions.length > 0 && !busy;

  return (
    <section className="grid gap-3 border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <Eye className="size-4" aria-hidden />
            样张预览
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            使用当前页面配置生成 SVG；不保存配置，不记录打印。
          </p>
        </div>
        {samplesQuery.isFetching && (
          <span className="text-xs text-muted-foreground">加载样本标签...</span>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] lg:items-end">
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">样本标签</span>
          <select
            value={selectedLabel ? String(selectedLabel.id) : ""}
            disabled={busy || samples.length === 0}
            onChange={(event) => setSampleLabelId(event.target.value)}
            className="h-9 min-w-0 border border-border bg-background px-3 text-sm"
          >
            {samples.length === 0 ? (
              <option value="">暂无 active 标签</option>
            ) : (
              samples.map((label) => (
                <option key={label.id} value={label.id}>
                  {sampleOptionLabel(label)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">预览模板</span>
          <select
            value={selectedTemplateCode}
            disabled={busy || templateOptions.length === 0}
            onChange={(event) => setTemplateCode(event.target.value as LabelTemplateCode)}
            className="h-9 border border-border bg-background px-3 text-sm"
          >
            {templateOptions.map((code) => (
              <option key={code} value={code}>
                {effectiveConfig.templates[code]?.label ?? LABEL_TEMPLATE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!canPreview}
          onClick={() => {
            if (selectedLabel) {
              previewMutation.mutate({ label: selectedLabel, templateCode: selectedTemplateCode });
            }
          }}
          className="inline-flex h-9 items-center justify-center gap-2 border border-foreground bg-foreground px-3 text-sm text-background disabled:opacity-40"
        >
          <Eye className="size-4" aria-hidden />
          {previewMutation.isPending ? "生成中" : "生成预览"}
        </button>
      </div>

      {samplesError ? (
        <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {samplesError.message}
        </div>
      ) : samples.length === 0 && !samplesQuery.isLoading ? (
        <div className="border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          当前表还没有可用的 active 标签，先在数据视图中生成标签后即可预览样张。
        </div>
      ) : null}

      <LabelPreviewDialog
        blob={previewTarget?.blob ?? null}
        title={previewTarget ? `样张预览 · ${LABEL_TEMPLATE_LABELS[previewTarget.templateCode]}` : "样张预览"}
        filename={
          previewTarget
            ? `${previewTarget.labelCode}-${previewTarget.templateCode}-preview.svg`
            : `${schema.schema_code}-label-preview.svg`
        }
        description="此预览仅用于核对当前模板配置，不保存配置，也不写入打印审计。"
        downloadLabel="下载样张 SVG"
        onClose={() => setPreviewTarget(null)}
      />
    </section>
  );
}

function sampleOptionLabel(label: EntityLabel) {
  return `${label.label_code} · entity #${label.entity_id}`;
}
