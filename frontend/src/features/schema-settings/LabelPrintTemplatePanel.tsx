import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";

import {
  LABEL_TEMPLATE_CODES,
  LABEL_TEMPLATE_LABELS,
  normalizeLabelPrintConfig,
  updateLabelPrintConfig,
  type DataSchema,
  type FieldConfig,
  type LabelPrintConfig,
  type LabelTemplateCode,
  type LabelTemplateSettings,
} from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { isSystemHiddenField } from "@/lib/schemaFields";
import { cn } from "@/lib/utils";
import { LabelTemplateSamplePreviewPanel } from "./LabelTemplateSamplePreviewPanel";
import { ensureDefaultTemplateEnabled, firstEnabledTemplate } from "./labelPrintTemplateUtils";

const VISIBILITY_OPTIONS: Array<{
  key: keyof Pick<
    LabelTemplateSettings,
    | "show_display_code"
    | "show_label_code"
    | "show_qr"
    | "show_barcode"
    | "show_scan_url"
    | "show_brand"
    | "show_hint"
  >;
  label: string;
}> = [
  { key: "show_display_code", label: "展示码" },
  { key: "show_label_code", label: "标签码" },
  { key: "show_qr", label: "QR" },
  { key: "show_barcode", label: "Code 128" },
  { key: "show_scan_url", label: "扫码 URL" },
  { key: "show_brand", label: "模板标题" },
  { key: "show_hint", label: "扫码提示" },
];

export function LabelPrintTemplatePanel({
  schema,
  readOnly = false,
}: {
  schema: DataSchema;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const savedConfig = useMemo(
    () => normalizeLabelPrintConfig(schema.label_print_config),
    [schema.label_print_config]
  );
  const [config, setConfig] = useState<LabelPrintConfig>(savedConfig);
  const fields = useMemo(
    () => schema.fields_config.filter((field) => !isSystemHiddenField(field)),
    [schema.fields_config]
  );
  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
  const enabledTemplates = LABEL_TEMPLATE_CODES.filter(
    (code) => config.templates[code]?.enabled
  );
  const mutation = useMutation({
    mutationFn: (nextConfig: LabelPrintConfig) =>
      updateLabelPrintConfig(schema.id, { label_print_config: nextConfig }),
    onSuccess: async (updatedSchema) => {
      const nextConfig = normalizeLabelPrintConfig(updatedSchema.label_print_config);
      setConfig(nextConfig);
      await queryClient.invalidateQueries({ queryKey: ["schema", schema.id] });
      notify.success({
        title: "物理标签模板已保存",
        message: `${schema.name} 的打印字段和标签显示项已更新。`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "物理标签模板保存失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  function save() {
    mutation.mutate(ensureDefaultTemplateEnabled(config));
  }

  function reset() {
    setConfig(savedConfig);
  }

  function updateTemplate(code: LabelTemplateCode, patch: Partial<LabelTemplateSettings>) {
    setConfig((current) => {
      const currentTemplate = current.templates[code] ?? normalizeLabelPrintConfig(null).templates[code]!;
      const nextTemplates = {
        ...current.templates,
        [code]: { ...currentTemplate, ...patch, code },
      };
      const nextDefault =
        patch.enabled === false && current.default_template_code === code
          ? firstEnabledTemplate(nextTemplates) ?? code
          : current.default_template_code;
      return {
        ...current,
        default_template_code: nextDefault,
        templates: nextTemplates,
      };
    });
  }

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">物理标签模板</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            控制每张表的默认标签、可打印字段和二维码/条码显示项。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">有未保存修改</span>}
          <button
            type="button"
            disabled={!dirty || mutation.isPending}
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className="size-4" aria-hidden />
            还原
          </button>
          <button
            type="button"
            disabled={!dirty || readOnly || mutation.isPending}
            onClick={save}
            className="inline-flex h-9 items-center gap-2 border border-foreground bg-foreground px-3 text-sm text-background disabled:opacity-40"
          >
            <Save className="size-4" aria-hidden />
            保存
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <label className="grid max-w-sm gap-1 text-sm">
          <span className="text-xs text-muted-foreground">默认模板</span>
          <select
            value={config.default_template_code}
            disabled={readOnly || mutation.isPending}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                default_template_code: event.target.value as LabelTemplateCode,
              }))
            }
            className="h-9 border border-border bg-background px-3 text-sm"
          >
            {enabledTemplates.map((code) => (
              <option key={code} value={code}>
                {config.templates[code]?.label ?? LABEL_TEMPLATE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>

        <LabelTemplateSamplePreviewPanel
          schema={schema}
          config={config}
          disabled={mutation.isPending}
        />

        <div className="grid gap-3">
          {LABEL_TEMPLATE_CODES.map((code) => (
            <TemplateEditor
              key={code}
              code={code}
              fields={fields}
              readOnly={readOnly || mutation.isPending}
              template={config.templates[code] ?? normalizeLabelPrintConfig(null).templates[code]!}
              isDefault={config.default_template_code === code}
              onDefault={() =>
                setConfig((current) => ({
                  ...current,
                  default_template_code: code,
                  templates: {
                    ...current.templates,
                    [code]: {
                      ...(current.templates[code] ?? normalizeLabelPrintConfig(null).templates[code]!),
                      enabled: true,
                    },
                  },
                }))
              }
              onChange={(patch) => updateTemplate(code, patch)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplateEditor(props: {
  code: LabelTemplateCode;
  template: LabelTemplateSettings;
  fields: FieldConfig[];
  isDefault: boolean;
  readOnly: boolean;
  onDefault: () => void;
  onChange: (patch: Partial<LabelTemplateSettings>) => void;
}) {
  return (
    <section className={cn("grid gap-3 border border-border p-3", !props.template.enabled && "opacity-70")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{props.template.label}</h3>
            {props.isDefault && <span className="border border-border px-2 py-0.5 text-xs">默认</span>}
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{props.code}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex h-8 items-center gap-2 border border-border px-2">
            <input
              type="checkbox"
              checked={props.template.enabled}
              disabled={props.readOnly || props.isDefault}
              onChange={(event) => props.onChange({ enabled: event.target.checked })}
              className="size-4 accent-foreground"
            />
            启用
          </label>
          <button
            type="button"
            disabled={props.readOnly || props.isDefault}
            onClick={props.onDefault}
            className="h-8 border border-border px-2 text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
          >
            设为默认
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <fieldset className="grid gap-2">
          <legend className="text-xs font-medium text-muted-foreground">打印字段</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {props.fields.map((field) => {
              const selected = props.template.field_keys.includes(field.key);
              const blocked = Boolean(field.sensitive);
              return (
                <label
                  key={field.key}
                  className={cn(
                    "grid gap-1 border border-border px-2 py-2 text-xs",
                    selected && "border-foreground",
                    blocked && "bg-muted/50 text-muted-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={props.readOnly || blocked || !props.template.enabled}
                      onChange={(event) =>
                        props.onChange({
                          field_keys: toggleField(
                            props.template.field_keys,
                            field.key,
                            event.target.checked
                          ),
                        })
                      }
                      className="size-4 accent-foreground"
                    />
                    <span className="font-medium">{field.label}</span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {field.key}
                    {blocked ? " · 敏感字段不可打印" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid content-start gap-2">
          <legend className="text-xs font-medium text-muted-foreground">显示项</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {VISIBILITY_OPTIONS.map((option) => (
              <label
                key={option.key}
                className="inline-flex min-h-8 items-center gap-2 border border-border px-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={Boolean(props.template[option.key])}
                  disabled={props.readOnly || !props.template.enabled}
                  onChange={(event) => props.onChange({ [option.key]: event.target.checked })}
                  className="size-4 accent-foreground"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function toggleField(keys: string[], fieldKey: string, selected: boolean) {
  if (selected) return keys.includes(fieldKey) ? keys : [...keys, fieldKey];
  return keys.filter((key) => key !== fieldKey);
}
