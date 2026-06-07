import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";

import {
  createDataCard,
  updateDataCard,
  type CreateDataCardPayload,
  type DataCardCategory,
  type DataCardFieldValueType,
  type DataCardStatus,
  type WorkbenchDataCardItem,
} from "@/api/workbench";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";

const CATEGORY_OPTIONS = [
  ["organization", "机构"],
  ["people", "人员"],
  ["social_security", "社保"],
  ["finance", "财务"],
  ["policy", "政策"],
  ["import_template", "导入模板"],
  ["common_text", "常用文本"],
  ["other", "其他"],
] as const satisfies ReadonlyArray<readonly [DataCardCategory, string]>;

const STATUS_OPTIONS = [
  ["draft", "草稿"],
  ["pending_confirm", "待确认"],
  ["confirmed", "已确认"],
  ["expired", "已失效"],
] as const satisfies ReadonlyArray<readonly [DataCardStatus, string]>;

const FIELD_TYPE_OPTIONS = [
  ["text", "文本"],
  ["number", "数字"],
  ["date", "日期"],
  ["money", "金额"],
  ["percent", "百分比"],
  ["boolean", "布尔"],
  ["url", "链接"],
  ["longtext", "长文本"],
] as const satisfies ReadonlyArray<readonly [DataCardFieldValueType, string]>;

type EditorField = {
  key: string;
  name: string;
  value: string;
  value_type: DataCardFieldValueType;
  unit: string;
  remark: string;
};

type FormState = {
  title: string;
  summary: string;
  tagsText: string;
  is_pinned: boolean;
  is_sensitive: boolean;
  category: DataCardCategory;
  applicable_year: string;
  applicable_region: string;
  applicable_subject: string;
  effective_from: string;
  effective_to: string;
  status: DataCardStatus;
  remark: string;
  fields: EditorField[];
};

type FieldErrors = Record<string, string>;

export function DataCardEditor(props: {
  item?: WorkbenchDataCardItem | null;
  onCancel: () => void;
  onSaved: (item: WorkbenchDataCardItem) => void;
}) {
  const notify = useNotification();
  const [form, setForm] = useState<FormState>(() => buildFormState(props.item ?? null));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const isEditing = Boolean(props.item);
  const heading = isEditing ? "编辑资料卡" : "新建资料卡";

  const mutation = useMutation({
    mutationFn: (payload: CreateDataCardPayload) =>
      props.item ? updateDataCard(props.item.id, payload) : createDataCard(payload),
    onSuccess: (item) => {
      notify.success({
        title: isEditing ? "资料卡已更新" : "资料卡已创建",
        message: item.title,
      });
      props.onSaved(item);
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: isEditing ? "资料卡更新失败" : "资料卡创建失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const submitDisabled = mutation.isPending || !form.title.trim();

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateField(key: string, patch: Partial<EditorField>) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.key === key ? { ...field, ...patch } : field)),
    }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function addField() {
    setForm((current) => ({
      ...current,
      fields: [...current.fields, createEditorField()],
    }));
  }

  function removeField(key: string) {
    setForm((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.key !== key),
    }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      notify.error({ title: `${heading}失败`, message: "标题不能为空" });
      return;
    }

    const validation = validateFields(form.fields);
    setFieldErrors(validation.errors);
    if (validation.firstError) {
      notify.error({ title: `${heading}失败`, message: validation.firstError });
      return;
    }

    mutation.mutate(buildPayload(form));
  }

  return (
    <form className="grid min-w-0 gap-5" onSubmit={handleSubmit}>
      <section className="grid min-w-0 gap-4 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <LabeledInput
            label="标题"
            required
            value={form.title}
            onChange={(value) => updateForm("title", value)}
          />
          <LabeledInput
            label="标签"
            value={form.tagsText}
            onChange={(value) => updateForm("tagsText", value)}
            placeholder="多个标签用逗号分隔"
          />
          <LabeledTextarea
            label="摘要"
            value={form.summary}
            onChange={(value) => updateForm("summary", value)}
            rows={3}
            className="md:col-span-2"
          />
          <LabeledSelect
            label="分类"
            value={form.category}
            onChange={(value) => updateForm("category", value as DataCardCategory)}
            options={CATEGORY_OPTIONS}
          />
          <LabeledSelect
            label="状态"
            value={form.status}
            onChange={(value) => updateForm("status", value as DataCardStatus)}
            options={STATUS_OPTIONS}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <CheckboxRow
            label="置顶"
            checked={form.is_pinned}
            onChange={(checked) => updateForm("is_pinned", checked)}
          />
          <CheckboxRow
            label="敏感资料"
            checked={form.is_sensitive}
            onChange={(checked) => updateForm("is_sensitive", checked)}
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">适用范围</h3>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <LabeledInput
            label="适用年份"
            type="number"
            min={1}
            value={form.applicable_year}
            onChange={(value) => updateForm("applicable_year", value)}
          />
          <LabeledInput
            label="适用地区"
            value={form.applicable_region}
            onChange={(value) => updateForm("applicable_region", value)}
          />
          <LabeledInput
            label="适用对象"
            value={form.applicable_subject}
            onChange={(value) => updateForm("applicable_subject", value)}
          />
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 md:col-span-2">
            <LabeledInput
              label="生效开始"
              type="date"
              value={form.effective_from}
              onChange={(value) => updateForm("effective_from", value)}
            />
            <LabeledInput
              label="生效结束"
              type="date"
              value={form.effective_to}
              onChange={(value) => updateForm("effective_to", value)}
            />
          </div>
          <LabeledTextarea
            label="备注"
            value={form.remark}
            onChange={(value) => updateForm("remark", value)}
            rows={3}
            className="md:col-span-2"
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <h3 className="text-sm font-semibold text-foreground">字段列表</h3>
          <button
            type="button"
            onClick={addField}
            className="inline-flex h-9 items-center justify-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
            aria-label="新增字段"
          >
            <Plus className="size-4" aria-hidden />
            新增字段
          </button>
        </div>
        <div className="grid gap-3">
          {form.fields.map((field, index) => (
            <FieldRowEditor
              key={field.key}
              field={field}
              index={index}
              error={fieldErrors[field.key]}
              onChange={updateField}
              onRemove={removeField}
            />
          ))}
          {form.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              当前没有字段。可按需补充数值、日期、链接或说明文本。
            </p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={props.onCancel}
          className="inline-flex h-10 items-center justify-center border border-border px-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
          aria-label="取消编辑资料卡"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          className="inline-flex h-10 items-center justify-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={isEditing ? "保存资料卡" : "创建资料卡"}
        >
          {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isEditing ? "保存变更" : "创建资料卡"}
        </button>
      </div>
    </form>
  );
}

function FieldRowEditor(props: {
  field: EditorField;
  index: number;
  error?: string;
  onChange: (key: string, patch: Partial<EditorField>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-3 border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-muted-foreground">字段 {props.index + 1}</span>
        <button
          type="button"
          onClick={() => props.onRemove(props.field.key)}
          className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-[var(--color-status-error)] hover:text-[var(--color-status-error)]"
          aria-label={`删除字段 ${props.index + 1}`}
        >
          <Trash2 className="size-3.5" aria-hidden />
          删除
        </button>
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <LabeledInput
          label="名称"
          value={props.field.name}
          onChange={(value) => props.onChange(props.field.key, { name: value })}
        />
        <LabeledSelect
          label="类型"
          value={props.field.value_type}
          onChange={(value) =>
            props.onChange(props.field.key, { value_type: value as DataCardFieldValueType })
          }
          options={FIELD_TYPE_OPTIONS}
        />
        <LabeledInput
          label="单位"
          value={props.field.unit}
          onChange={(value) => props.onChange(props.field.key, { unit: value })}
        />
        <LabeledInput
          label="值"
          value={props.field.value}
          onChange={(value) => props.onChange(props.field.key, { value })}
        />
      </div>
      <LabeledTextarea
        label="字段备注"
        value={props.field.remark}
        onChange={(value) => props.onChange(props.field.key, { remark: value })}
        rows={2}
      />
      {props.error && (
        <p className="text-xs text-[var(--color-status-error)]" aria-live="polite">
          {props.error}
        </p>
      )}
    </div>
  );
}

function CheckboxRow(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        aria-label={props.label}
        className="size-4 border border-border"
      />
      <span>{props.label}</span>
    </label>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: "text" | "number" | "date";
  min?: number;
  className?: string;
}) {
  return (
    <label className={`grid min-w-0 gap-2 ${props.className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        min={props.min}
        required={props.required}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label={props.label}
        className="h-10 w-full min-w-0 border border-border bg-transparent px-3 text-sm outline-none"
      />
    </label>
  );
}

function LabeledTextarea(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  className?: string;
}) {
  return (
    <label className={`grid min-w-0 gap-2 ${props.className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        rows={props.rows}
        aria-label={props.label}
        className="min-h-0 w-full min-w-0 resize-y border border-border bg-transparent px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}

function LabeledSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label={props.label}
        className="h-10 w-full min-w-0 border border-border bg-transparent px-3 text-sm outline-none"
      >
        {props.options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildFormState(item: WorkbenchDataCardItem | null): FormState {
  const detail = item && "fields" in item.detail ? item.detail : null;
  return {
    title: item?.title ?? "",
    summary: item?.summary ?? "",
    tagsText: item?.tags.join(", ") ?? "",
    is_pinned: item?.is_pinned ?? false,
    is_sensitive: item?.is_sensitive ?? false,
    category: detail?.category ?? "other",
    applicable_year: detail?.applicable_year ? String(detail.applicable_year) : "",
    applicable_region: detail?.applicable_region ?? "",
    applicable_subject: detail?.applicable_subject ?? "",
    effective_from: detail?.effective_from ?? "",
    effective_to: detail?.effective_to ?? "",
    status: detail?.status ?? "draft",
    remark: detail?.remark ?? "",
    fields:
      detail?.fields.map((field) => ({
        key: createFieldKey(),
        name: field.name,
        value: field.value,
        value_type: field.value_type,
        unit: field.unit,
        remark: field.remark,
      })) ?? [],
  };
}

function buildPayload(form: FormState): CreateDataCardPayload {
  const fields = form.fields
    .filter((field) => !isFieldRowEmpty(field))
    .map((field, index) => ({
      name: field.name.trim(),
      value: field.value,
      value_type: field.value_type,
      unit: field.unit.trim(),
      remark: field.remark.trim(),
      sort_order: index,
    }));

  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    tags: parseTags(form.tagsText),
    is_pinned: form.is_pinned,
    is_sensitive: form.is_sensitive,
    category: form.category,
    applicable_year: form.applicable_year ? Number(form.applicable_year) : null,
    applicable_region: form.applicable_region.trim(),
    applicable_subject: form.applicable_subject.trim(),
    effective_from: form.effective_from || null,
    effective_to: form.effective_to || null,
    status: form.status,
    remark: form.remark.trim(),
    fields,
  };
}

function validateFields(fields: EditorField[]) {
  const errors: FieldErrors = {};
  let firstError: string | null = null;

  fields.forEach((field, index) => {
    const hasName = field.name.trim().length > 0;
    const hasOtherContent =
      field.value.trim().length > 0 ||
      field.unit.trim().length > 0 ||
      field.remark.trim().length > 0;

    if (!hasName && hasOtherContent) {
      const message = `第 ${index + 1} 个字段名称不能为空`;
      errors[field.key] = message;
      if (!firstError) firstError = message;
    }
  });

  return { errors, firstError };
}

function isFieldRowEmpty(field: EditorField) {
  return (
    field.name.trim().length === 0 &&
    field.value.trim().length === 0 &&
    field.unit.trim().length === 0 &&
    field.remark.trim().length === 0
  );
}

function parseTags(text: string) {
  return [...new Set(text.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean))];
}

function createEditorField(): EditorField {
  return {
    key: createFieldKey(),
    name: "",
    value: "",
    value_type: "text",
    unit: "",
    remark: "",
  };
}

function createFieldKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
