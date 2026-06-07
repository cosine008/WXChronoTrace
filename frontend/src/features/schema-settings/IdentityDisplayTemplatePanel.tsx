import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, Save } from "lucide-react";

import {
  getCurrentRecords,
  updateIdentityDisplayTemplate,
  type CurrentViewRecord,
  type DataSchema,
  type FieldConfig,
} from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { visibleUserFields } from "@/lib/schemaFields";

const TEMPLATE_TOKEN_RE = /\{([a-z_][a-z0-9_]*)\}/g;
const MISSING_DISPLAY_VALUE = "—";

export function IdentityDisplayTemplatePanel({
  schema,
  readOnly = false,
}: {
  schema: DataSchema;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const savedTemplate = schema.identity_display_template ?? "";
  const [template, setTemplate] = useState(savedTemplate);
  const editableFields = useMemo(
    () => visibleUserFields(schema.fields_config),
    [schema.fields_config]
  );
  const templateFieldKeys = useMemo(
    () => new Set(editableFields.map((field) => field.key)),
    [editableFields]
  );
  const fieldByKey = useMemo(
    () => new Map(schema.fields_config.map((field) => [field.key, field])),
    [schema.fields_config]
  );
  const suggestions = useMemo(
    () => buildTemplateSuggestions(editableFields),
    [editableFields]
  );
  const dirty = template !== savedTemplate;
  const unavailableKeys = useMemo(
    () => collectUnavailableTemplateKeys(template, templateFieldKeys),
    [template, templateFieldKeys]
  );
  const previewQuery = useQuery({
    queryKey: ["schema-records", schema.id, "identity-preview"],
    queryFn: () => getCurrentRecords(schema.id, { page_size: 5 }),
    enabled: Number.isFinite(schema.id),
  });
  const previewItems = useMemo(
    () =>
      (previewQuery.data?.results ?? [])
        .slice(0, 5)
        .map((record) => buildPreviewItem(schema, record, template, templateFieldKeys, fieldByKey)),
    [fieldByKey, previewQuery.data?.results, schema, template, templateFieldKeys]
  );
  const mutation = useMutation({
    mutationFn: (nextTemplate: string) =>
      updateIdentityDisplayTemplate(schema.id, {
        identity_display_template: nextTemplate,
      }),
    onSuccess: async (updatedSchema) => {
      const nextTemplate = updatedSchema.identity_display_template ?? "";
      setTemplate(nextTemplate);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema", schema.id] }),
        queryClient.invalidateQueries({ queryKey: ["schema-records", schema.id] }),
      ]);
      notify.success({
        title: "实体展示格式已保存",
        message: nextTemplate
          ? `${schema.name} 的实体展示模板已更新。`
          : `${schema.name} 已恢复默认实体展示逻辑。`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "实体展示格式保存失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  function handleInsertField(fieldKey: string) {
    if (readOnly) return;
    const insertion = insertTokenAtSelection(
      template,
      `{${fieldKey}}`,
      textareaRef.current?.selectionStart,
      textareaRef.current?.selectionEnd
    );
    setTemplate(insertion.value);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(insertion.cursor, insertion.cursor);
    });
  }

  function handleApplySuggestion(nextTemplate: string) {
    if (readOnly) return;
    setTemplate(nextTemplate);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleSave() {
    if (readOnly || !dirty) return;
    mutation.mutate(template);
  }

  function handleClear() {
    if (readOnly || (!template && !savedTemplate)) return;
    mutation.mutate("");
  }

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">实体展示格式</h2>
        </div>
        {dirty && !readOnly ? (
          <span className="text-xs text-muted-foreground">有未保存修改</span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">模板</span>
            <textarea
              ref={textareaRef}
              value={template}
              disabled={readOnly}
              onChange={(event) => setTemplate(event.target.value)}
              placeholder="{employee_no} / {name}"
              className="min-h-28 w-full border border-border bg-background px-3 py-2 outline-none focus:border-foreground disabled:opacity-60"
            />
          </label>
          {unavailableKeys.length > 0 ? (
            <div className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              当前模板包含不可用字段：{unavailableKeys.join("、")}。保存时以后端校验结果为准。
            </div>
          ) : null}
          <OptionGroup
            title="字段插入"
            emptyText="当前没有可用于插入的可见字段。"
          >
            {editableFields.map((field) => (
              <button
                key={field.key}
                type="button"
                disabled={readOnly}
                onClick={() => handleInsertField(field.key)}
                className="inline-flex h-8 items-center gap-2 border border-border px-2 text-xs hover:border-foreground disabled:opacity-50"
              >
                <span className="font-medium">{field.label}</span>
                <span className="font-mono text-muted-foreground">{`{${field.key}}`}</span>
              </button>
            ))}
          </OptionGroup>
          <OptionGroup
            title="建议示例"
            emptyText="未检测到常用示例字段，可直接使用上方字段占位符自行组合。"
          >
            {suggestions.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={readOnly}
                onClick={() => handleApplySuggestion(item.value)}
                className="inline-flex h-8 items-center border border-border px-2 text-xs hover:border-foreground disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </OptionGroup>
        </div>
        <PreviewPanel
          loading={previewQuery.isLoading}
          error={previewQuery.error}
          items={previewItems}
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span aria-hidden />
        {readOnly ? (
          <span className="text-xs text-muted-foreground">只读模式</span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={mutation.isPending || (!template && !savedTemplate)}
              onClick={handleClear}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm hover:border-foreground disabled:opacity-50"
            >
              <Eraser className="size-4" aria-hidden />
              清空模板
            </button>
            <button
              type="button"
              disabled={mutation.isPending || !dirty}
              onClick={handleSave}
              className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-50"
            >
              <Save className="size-4" aria-hidden />
              保存
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function OptionGroup(props: {
  title: string;
  emptyText: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="grid gap-2">
      <div className="text-xs text-muted-foreground">{props.title}</div>
      {props.children.length > 0 ? (
        <div className="flex flex-wrap gap-2">{props.children}</div>
      ) : (
        <div className="text-xs text-muted-foreground">{props.emptyText}</div>
      )}
    </div>
  );
}

function PreviewPanel(props: {
  loading: boolean;
  error: unknown;
  items: PreviewItem[];
}) {
  const apiError = props.error ? extractApiError(props.error) : null;
  return (
    <div className="grid gap-2 border border-border p-3">
      <div>
        <h3 className="font-display text-sm font-semibold">当前数据样例</h3>
      </div>
      {props.loading ? <div className="text-sm text-muted-foreground">正在加载样例记录...</div> : null}
      {apiError ? <div className="text-sm text-destructive">{apiError.message}</div> : null}
      {!props.loading && !apiError && props.items.length === 0 ? (
        <div className="text-sm text-muted-foreground">当前没有可预览的记录。</div>
      ) : null}
      {!props.loading && !apiError ? (
        <div className="divide-y divide-border border border-border">
          {props.items.map((item) => (
            <div key={item.record.record_id} className="grid gap-1 px-3 py-2 text-sm">
              <div className="font-medium">{item.text || "—"}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {item.record.business_code}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type PreviewItem = {
  record: CurrentViewRecord;
  text: string;
};

type TemplateSuggestion = {
  label: string;
  value: string;
};

function buildTemplateSuggestions(fields: FieldConfig[]): TemplateSuggestion[] {
  const visibleKeys = new Set(fields.map((field) => field.key));
  return [
    ["employee_no", "name"],
    ["company_code", "employee_no", "name"],
  ]
    .filter((keys) => keys.every((key) => visibleKeys.has(key)))
    .map((keys) => {
      const value = keys.map((key) => `{${key}}`).join(" / ");
      return { label: value, value };
    });
}

function collectUnavailableTemplateKeys(template: string, fieldKeys: Set<string>) {
  return [...new Set([...template.matchAll(TEMPLATE_TOKEN_RE)].map((match) => match[1]))].filter(
    (fieldKey) => !fieldKeys.has(fieldKey)
  );
}

function buildPreviewItem(
  schema: DataSchema,
  record: CurrentViewRecord,
  template: string,
  templateFieldKeys: Set<string>,
  fieldByKey: Map<string, FieldConfig>
): PreviewItem {
  const customText = template.trim()
    ? renderIdentityDisplayTemplate(template, record.data_payload, templateFieldKeys, fieldByKey)
    : record.display_code || renderDefaultIdentityDisplay(schema, record.data_payload, fieldByKey);
  return {
    record,
    text: customText || record.display_code || record.business_code || "",
  };
}

function renderIdentityDisplayTemplate(
  template: string,
  values: Record<string, unknown>,
  templateFieldKeys: Set<string>,
  fieldByKey: Map<string, FieldConfig>
) {
  return template
    .replace(TEMPLATE_TOKEN_RE, (_, fieldKey: string) => {
      if (!templateFieldKeys.has(fieldKey)) return "";
      return stringifyDisplayValue(values[fieldKey], fieldByKey.get(fieldKey));
    })
    .trim();
}

function renderDefaultIdentityDisplay(
  schema: DataSchema,
  values: Record<string, unknown>,
  fieldByKey: Map<string, FieldConfig>
) {
  const fieldKeys =
    schema.identity_mode === "composite"
      ? schema.identity_field_keys
      : [schema.identity_field_key];
  const parts = fieldKeys.map((fieldKey) =>
    stringifyDisplayValue(values[fieldKey], fieldByKey.get(fieldKey))
  );
  if (parts.some((part) => !part)) return "";
  return schema.identity_mode === "composite" ? parts.join(" / ") : (parts[0] ?? "");
}

function stringifyDisplayValue(value: unknown, field?: FieldConfig) {
  if (value === null || value === undefined || value === "") return MISSING_DISPLAY_VALUE;
  if (isMaskedDisplayValue(value)) {
    return String(value.display ?? "").trim() || MISSING_DISPLAY_VALUE;
  }
  if (field?.sensitive) {
    return maskSensitiveValue(value, field);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim() || MISSING_DISPLAY_VALUE;
}

function isMaskedDisplayValue(value: unknown): value is { display?: unknown } {
  return Boolean(value && typeof value === "object" && "display" in value);
}

function maskSensitiveValue(value: unknown, field: FieldConfig) {
  const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  if (field.masking?.mode === "partial" && text) return partialMask(text);
  return "***";
}

function partialMask(value: string) {
  if (value.length <= 4) return "*".repeat(value.length);
  const prefix = value.slice(0, 3);
  const suffix = value.length > 7 ? value.slice(-4) : value.slice(-1);
  return `${prefix}${"*".repeat(Math.max(3, value.length - prefix.length - suffix.length))}${suffix}`;
}

function insertTokenAtSelection(
  value: string,
  token: string,
  selectionStart?: number | null,
  selectionEnd?: number | null
) {
  if (selectionStart === undefined || selectionStart === null) {
    return { value: `${value}${token}`, cursor: value.length + token.length };
  }
  const start = value.slice(0, selectionStart);
  const end = value.slice(selectionEnd ?? selectionStart);
  const nextValue = `${start}${token}${end}`;
  return { value: nextValue, cursor: start.length + token.length };
}
