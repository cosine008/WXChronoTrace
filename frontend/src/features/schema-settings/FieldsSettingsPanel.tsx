import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";

import {
  addSchemaField,
  updateSchemaField,
  type DataSchema,
  type FieldConfig,
  type FieldType,
  type SchemaRole,
} from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { visibleUserFields } from "@/lib/schemaFields";
import {
  FIELD_TYPES,
  defaultValidatorsForType,
  fieldTypeLabel,
  makeEmptyField,
} from "@/features/schema-wizard/schemaWizardState";
import {
  FieldStateStrip,
  FieldTypeMarker,
  SchemaFieldRow,
} from "@/features/schema-wizard/SchemaFieldVisuals";

export function FieldsSettingsPanel({
  schema,
  readOnly = false,
  onDirtyChange,
}: {
  schema: DataSchema;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const notify = useNotification();
  const editableSchemaFields = visibleUserFields(schema.fields_config);
  const [selectedKey, setSelectedKey] = useState(editableSchemaFields[0]?.key ?? "");
  const [draft, setDraft] = useState<FieldConfig>(editableSchemaFields[0] ?? makeEmptyField(1));
  const [newField, setNewField] = useState<FieldConfig>(makeEmptyField(editableSchemaFields.length + 1));
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const selected = editableSchemaFields.find((field) => field.key === selectedKey);
  const draftDirty = Boolean(
    !readOnly &&
      selected &&
      fieldFingerprint(draft) !== (savedDraftFingerprint ?? fieldFingerprint(selected))
  );
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schema", schema.id] });
  const updateMutation = useMutation({
    mutationFn: () =>
      updateSchemaField(schema.id, draft.key, {
        label: draft.label,
        required: draft.required,
        indexed: draft.indexed,
        validators: draft.validators ?? {},
        deprecated: draft.deprecated,
        sensitive: draft.sensitive,
        masking: draft.masking,
    }),
    onSuccess: async () => {
      await invalidate();
      setSavedDraftFingerprint(fieldFingerprint(draft));
      notify.success({ title: "字段已保存", message: `${draft.label} 的字段设置已更新。` });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "字段保存失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const addMutation = useMutation({
    mutationFn: () => addSchemaField(schema.id, newField),
    onSuccess: async () => {
      await invalidate();
      notify.success({ title: "字段已新增", message: `${newField.label} 已加入字段配置。` });
      setNewField(makeEmptyField(editableSchemaFields.length + 2));
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "新增字段失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  useEffect(() => {
    onDirtyChange?.(draftDirty);
  }, [draftDirty, onDirtyChange]);

  useEffect(() => {
    if (!draftDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftDirty]);

  async function selectField(field: FieldConfig) {
    if (field.key === selectedKey) return;
    if (draftDirty) {
      const confirmed = await notify.confirm({
        title: "放弃未保存字段修改？",
        description: `切换字段会丢弃「${draft.label || draft.key}」当前未保存的配置。`,
        impactSummary: ["已保存的线上字段不会受影响", "继续编辑可回到当前字段手动保存"],
        confirmLabel: "放弃并切换",
        cancelLabel: "继续编辑",
        tone: "destructive",
      });
      if (!confirmed) return;
    }
    setSelectedKey(field.key);
    setDraft(field);
    setSavedDraftFingerprint(null);
  }

  async function handleSaveField() {
    if (readOnly || !draftDirty) return;
    if (selected && !selected.deprecated && draft.deprecated) {
      const confirmed = await notify.confirm({
        title: "确认废弃字段",
        description: "字段废弃后会从默认可用字段中移除，但不会删除历史数据。",
        impactSummary: [`字段：${draft.label} / ${draft.key}`, "历史记录保留", "新视图默认不再使用该字段"],
        confirmLabel: "确认废弃",
        cancelLabel: "取消",
        tone: "destructive",
      });
      if (!confirmed) return;
    }
    updateMutation.mutate();
  }

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <h2 className="mb-4 font-display text-lg font-semibold">字段设置</h2>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 divide-y divide-border border border-border">
          {editableSchemaFields.map((field) => (
            <SchemaFieldRow
              key={field.key}
              field={field}
              active={field.key === selectedKey}
              onSelect={() => void selectField(field)}
            />
          ))}
        </div>
        <FieldEditBox
          field={selected ? draft : null}
          dirty={draftDirty}
          loading={updateMutation.isPending}
          readOnly={readOnly}
          onChange={setDraft}
          onSave={() => void handleSaveField()}
        />
      </div>
      {readOnly ? (
        <div className="mt-4 border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          当前角色只能查看字段配置，不能新增字段。
        </div>
      ) : (
        <NewFieldBox
          field={newField}
          loading={addMutation.isPending}
          onChange={setNewField}
          onAdd={() => addMutation.mutate()}
        />
      )}
    </section>
  );
}

function FieldEditBox(props: {
  field: FieldConfig | null;
  dirty: boolean;
  loading: boolean;
  readOnly: boolean;
  onChange: (field: FieldConfig) => void;
  onSave: () => void;
}) {
  if (!props.field) return <div className="text-sm text-muted-foreground">暂无字段</div>;
  return (
    <div className="nd-interactive-surface min-w-0 border border-border p-3">
      <FieldEditHeader field={props.field} dirty={props.dirty} title="编辑字段" />
      <FieldInputs
        field={props.field}
        disabled={props.readOnly}
        onChange={props.onChange}
        lockIdentity
      />
      <div className="mt-3 flex items-center justify-end gap-3">
        {props.readOnly ? (
          <span className="text-xs text-muted-foreground">只读模式</span>
        ) : (
          <>
            {props.dirty && <span className="text-xs text-muted-foreground">有未保存修改</span>}
            <button
              type="button"
              disabled={props.loading || !props.dirty}
              onClick={props.onSave}
              className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-50"
            >
              <Save className="size-4" aria-hidden />
              保存字段
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NewFieldBox(props: {
  field: FieldConfig;
  loading: boolean;
  onChange: (field: FieldConfig) => void;
  onAdd: () => void;
}) {
  return (
    <div className="nd-interactive-surface mt-4 min-w-0 border border-border p-3">
      <FieldEditHeader field={props.field} title="新增字段" />
      <FieldInputs field={props.field} onChange={props.onChange} />
      <button
        type="button"
        disabled={props.loading}
        onClick={props.onAdd}
        className="mt-3 inline-flex h-9 items-center gap-2 border border-border px-3 text-sm hover:border-foreground disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        添加字段
      </button>
    </div>
  );
}

function FieldEditHeader(props: { field: FieldConfig; title: string; dirty?: boolean }) {
  return (
    <div className="mb-3 grid min-w-0 gap-3 border border-border bg-background p-3">
      <div className="flex min-w-0 items-start gap-3">
        <FieldTypeMarker type={props.field.type} className="h-8 min-w-[4.25rem]" />
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-display text-sm font-semibold">{props.title}</span>
            {props.dirty && (
              <span className="shrink-0 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                DIRTY
              </span>
            )}
          </span>
          <span className="truncate text-sm text-foreground">{props.field.label}</span>
        </span>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {props.field.key} · {fieldTypeLabel(props.field.type)}
        </span>
        <FieldStateStrip field={props.field} className="sm:justify-end" />
      </div>
    </div>
  );
}

function FieldInputs(props: {
  field: FieldConfig;
  disabled?: boolean;
  lockIdentity?: boolean;
  onChange: (field: FieldConfig) => void;
}) {
  const field = props.field;
  return (
    <div className="grid min-w-0 items-end gap-2 md:grid-cols-2">
      <Input
        label="字段编码"
        value={field.key}
        disabled={props.disabled || props.lockIdentity}
        onChange={(key) => props.onChange({ ...field, key })}
      />
      <Input
        label="显示名"
        value={field.label}
        disabled={props.disabled}
        onChange={(label) => props.onChange({ ...field, label })}
      />
      <label className="grid min-w-0 gap-1 text-sm">
        <span className="text-xs text-muted-foreground">类型</span>
        <select
          value={field.type}
          disabled={props.disabled || props.lockIdentity}
          onChange={(event) => {
            const type = event.target.value as FieldType;
            props.onChange({
              ...field,
              type,
              validators: defaultValidatorsForType(type),
              required: type === "formula" ? false : field.required,
              indexed: type === "formula" ? false : field.indexed,
            });
          }}
          className="h-10 w-full min-w-0 border border-border bg-background px-3 outline-none disabled:opacity-60"
        >
          {FIELD_TYPES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      <Toggle
        label="必填"
        checked={Boolean(field.required)}
        disabled={props.disabled || field.type === "formula"}
        onChange={(required) => props.onChange({ ...field, required })}
      />
      <Toggle
        label="索引"
        checked={Boolean(field.indexed)}
        disabled={props.disabled || field.type === "formula"}
        onChange={(indexed) => props.onChange({ ...field, indexed })}
      />
      {props.lockIdentity && (
        <Toggle
          label="标记废弃"
          checked={Boolean(field.deprecated)}
          disabled={props.disabled}
          onChange={(deprecated) => props.onChange({ ...field, deprecated })}
        />
      )}
      <FieldValidatorInputs
        field={field}
        disabled={props.disabled}
        onChange={(patch) => props.onChange({ ...field, ...patch })}
      />
      <FieldMaskingInputs
        field={field}
        disabled={props.disabled}
        onChange={(patch) => props.onChange({ ...field, ...patch })}
      />
    </div>
  );
}

function FieldValidatorInputs(props: {
  field: FieldConfig;
  disabled?: boolean;
  onChange: (patch: Partial<FieldConfig>) => void;
}) {
  const validators = props.field.validators ?? {};
  const setValidators = (patch: Record<string, unknown>) =>
    props.onChange({ validators: { ...validators, ...patch } });
  if (props.field.type === "attachment" || props.field.type === "image") {
    return (
      <div className="grid min-w-0 items-end gap-2 border border-border p-3 md:col-span-2 md:grid-cols-2">
        <NumberInput
          label="最大文件数"
          value={validators.max_files}
          disabled={props.disabled}
          onChange={(value) => setValidators({ max_files: value })}
        />
        <NumberInput
          label="单文件上限(B)"
          value={validators.max_file_size}
          disabled={props.disabled}
          onChange={(value) => setValidators({ max_file_size: value })}
        />
        <Input
          label="允许扩展名"
          value={String((validators.allowed_extensions as string[] | undefined)?.join(", ") ?? "")}
          disabled={props.disabled}
          onChange={(value) =>
            setValidators({
              allowed_extensions: value
                .split(",")
                .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
                .filter(Boolean),
            })
          }
        />
      </div>
    );
  }
  if (props.field.type === "formula") {
    return (
      <div className="grid min-w-0 gap-2 border border-border p-3 md:col-span-2">
        <Input
          label="公式表达式"
          value={String(validators.expression ?? "")}
          disabled={props.disabled}
          onChange={(expression) => setValidators({ expression })}
        />
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-xs text-muted-foreground">结果类型</span>
          <select
            value={String(validators.result_type ?? "text")}
            disabled={props.disabled}
            onChange={(event) => setValidators({ result_type: event.target.value })}
            className="h-10 w-full min-w-0 border border-border bg-background px-3 outline-none disabled:opacity-60"
          >
            <option value="text">文本</option>
            <option value="number">数字</option>
          </select>
        </label>
        <NumberInput
          label="小数位"
          value={validators.precision}
          disabled={props.disabled}
          onChange={(precision) => setValidators({ precision })}
        />
      </div>
    );
  }
  return (
    <Input
      label={
        props.field.type === "longtext" || props.field.type === "markdown"
          ? "最大字数"
          : "最大长度"
      }
      value={String(validators.max_length ?? "")}
      disabled={props.disabled}
      onChange={(value) => setValidators({ max_length: value ? Number(value) : undefined })}
    />
  );
}

const ROLE_OPTIONS: Array<{ value: SchemaRole; label: string }> = [
  { value: "admin", label: "系统管理员" },
  { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

function FieldMaskingInputs(props: {
  field: FieldConfig;
  disabled?: boolean;
  onChange: (patch: Partial<FieldConfig>) => void;
}) {
  const masking = props.field.masking ?? {};
  const visibleRoles = masking.visible_roles ?? ["admin", "owner"];
  return (
    <div className="grid min-w-0 items-end gap-2 border border-border p-3 md:col-span-2 md:grid-cols-2">
      <Toggle
        label="敏感字段"
        checked={Boolean(props.field.sensitive)}
        disabled={props.disabled}
        onChange={(sensitive) => props.onChange({ sensitive })}
      />
      <label className="grid min-w-0 gap-1 text-sm">
        <span className="text-xs text-muted-foreground">脱敏方式</span>
        <select
          value={masking.mode ?? "full"}
          disabled={props.disabled}
          onChange={(event) =>
            props.onChange({
              masking: { ...masking, mode: event.target.value as "full" | "partial" | "none" },
            })
          }
          className="h-10 w-full min-w-0 border border-border bg-background px-3 outline-none disabled:opacity-60"
        >
          <option value="full">完全隐藏</option>
          <option value="partial">保留首尾</option>
          <option value="none">不脱敏</option>
        </select>
      </label>
      {ROLE_OPTIONS.map((role) => (
        <Toggle
          key={role.value}
          label={role.label}
          checked={visibleRoles.includes(role.value)}
          disabled={props.disabled}
          onChange={(checked) =>
            props.onChange({
              masking: {
                ...masking,
                visible_roles: checked
                  ? [...visibleRoles, role.value]
                  : visibleRoles.filter((item) => item !== role.value),
              },
            })
          }
        />
      ))}
    </div>
  );
}

function NumberInput(props: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <Input
      label={props.label}
      value={typeof props.value === "number" ? String(props.value) : ""}
      disabled={props.disabled}
      onChange={(value) => props.onChange(value ? Number(value) : undefined)}
    />
  );
}

function Input(props: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 w-full min-w-0 border border-border bg-background px-3 outline-none disabled:opacity-60"
      />
    </label>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex h-10 min-w-0 items-center gap-2 border border-border px-3 text-sm">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className="min-w-0 truncate">{props.label}</span>
    </label>
  );
}

function fieldFingerprint(field: FieldConfig) {
  return JSON.stringify({
    key: field.key,
    label: field.label,
    required: Boolean(field.required),
    indexed: Boolean(field.indexed),
    validators: field.validators ?? {},
    deprecated: Boolean(field.deprecated),
    sensitive: Boolean(field.sensitive),
    masking: field.masking ?? {},
  });
}
