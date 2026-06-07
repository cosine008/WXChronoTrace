import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";

import {
  addChangeSetEntry,
  createChangeSet,
  type ChangeSetDetail,
  type CurrentViewRecord,
  type FieldConfig,
  type IdentityMode,
} from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import {
  buildIdentityCode,
  identityFieldLabels,
  isSystemHiddenField,
} from "@/lib/schemaFields";
import { FieldValueInput } from "./FieldValueInput";
import { isEmptyFieldValue } from "./fieldValueUtils";
import { recordDisplayCode } from "./currentViewUtils";

interface Props {
  schemaId: number;
  at: string;
  fields: FieldConfig[];
  records: CurrentViewRecord[];
  identityFieldKey: string;
  identityMode: IdentityMode;
  identityFieldKeys: string[];
  onCreated: (changeSetId: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SingleRecordCreatePanel({
  schemaId,
  at,
  fields,
  records,
  identityFieldKey,
  identityMode,
  identityFieldKeys,
  onCreated,
  onDirtyChange,
}: Props) {
  const notify = useNotification();
  const editableFields = fields.filter((field) => !field.deprecated && !isSystemHiddenField(field));
  const identityField = editableFields.find((field) => field.key === identityFieldKey);
  const compositeIdentityLabels = identityFieldLabels(editableFields, identityFieldKeys);
  const defaultSummary = `单条新增草稿 ${at}`;
  const [draft, setDraft] = useState<ChangeSetDetail | null>(null);
  const [summary, setSummary] = useState(defaultSummary);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState("");
  const businessCode = buildIdentityCode(values, identityMode, identityFieldKey, identityFieldKeys);
  const duplicateRecord = useMemo(
    () => records.find((record) => record.business_code === businessCode),
    [businessCode, records]
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const currentDraft = draft ?? (await createChangeSet(schemaId, { summary }));
      if (!draft) setDraft(currentDraft);
      await addChangeSetEntry(currentDraft.id, {
        action: "create",
        valid_from: at,
        data_after: buildDataAfter(),
      });
      return currentDraft;
    },
    onSuccess: (currentDraft) => {
      setDraft(currentDraft);
      onCreated(currentDraft.id);
      setValues({});
      const successMessage = `新增已暂存到草稿 #${currentDraft.id}`;
      setMessage(successMessage);
      notify.success({
        title: "新增记录已暂存",
        message: successMessage,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "新增记录失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  useEffect(() => {
    const hasFieldValues = Object.values(values).some((value) => !isEmptyFieldValue(value));
    onDirtyChange?.(hasFieldValues || (!draft && summary !== defaultSummary));
  }, [defaultSummary, draft, onDirtyChange, summary, values]);

  return (
    <section className="grid gap-3">
      <div
        data-testid="single-record-draft-status"
        className="nd-interactive-surface flex items-center justify-between gap-3 border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
      >
        <span>草稿状态</span>
        <span className="font-mono">{draft ? `#${draft.id}` : "新草稿"}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
        <label className="grid gap-1 text-xs text-muted-foreground">
          草稿摘要
          <input
            id="single-record-summary"
            name="single_record_summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="h-9 border border-border bg-background px-2 text-sm text-foreground outline-none"
          />
        </label>
        <div className="grid gap-1 text-xs text-muted-foreground">
          生效日期
          <div className="flex h-9 items-center border border-border bg-background px-2 font-mono text-sm text-foreground">
            {at}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {editableFields.map((field) => (
          <label key={field.key} className="grid gap-1 text-xs text-muted-foreground">
            <span>
              {field.label}
              {field.required || field.key === identityFieldKey || identityFieldKeys.includes(field.key) ? (
                <span className="ml-1 text-[var(--color-status-error)]">*</span>
              ) : null}
            </span>
            <FieldValueInput
              field={field}
              id={`single-record-field-${field.key}`}
              name={`single_record_field_${field.key}`}
              value={values[field.key]}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
              placeholder={field.key}
            />
          </label>
        ))}
      </div>
      {duplicateRecord && (
        <p className="mt-2 text-xs text-[var(--color-status-error)]">
          当前实体编号已存在：{recordDisplayCode(duplicateRecord)}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-4 py-3">
        <p className="min-h-5 text-xs text-muted-foreground">{message}</p>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => void handleSave()}
          className="inline-flex h-9 items-center justify-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-40"
        >
          <Save className="size-4" aria-hidden />
          暂存新增
        </button>
      </div>
    </section>
  );

  async function handleSave() {
    const validation = validateInput();
    if (validation) {
      notify.error({ title: "新增记录信息不完整", message: validation });
      return;
    }
    const confirmed = await notify.confirm({
      title: "确认暂存新增记录",
      description: "确认后会在当前草稿中增加一条 create 明细，发布前仍可删除或放弃。",
      impactSummary: [
        `新增实体：${businessCode}`,
        `生效日期：${at}`,
        `字段数量：${Object.keys(buildDataAfter()).length}`,
        draft ? `写入草稿：#${draft.id}` : "将自动创建新草稿",
      ],
      confirmLabel: "确认暂存",
      cancelLabel: "取消",
    });
    if (confirmed) mutation.mutate();
  }

  function validateInput() {
    if (identityMode === "composite") {
      const missing = identityFieldKeys.filter((key) => isEmptyFieldValue(values[key]));
      if (missing.length > 0) return `组合实体标识字段缺失：${identityFieldLabels(editableFields, missing).join("、")}`;
    } else if (!identityField) {
      return `实体标识字段 ${identityFieldKey} 不存在`;
    }
    const identityLabel =
      identityMode === "composite" ? compositeIdentityLabels.join(" + ") : identityField?.label ?? identityFieldKey;
    if (!businessCode) return `${identityLabel} 必填`;
    if (duplicateRecord) return `实体编号 ${businessCode} 已存在，新增记录不能复用已有编号`;
    const missing = editableFields
      .filter((field) => field.required && isEmptyFieldValue(values[field.key]))
      .map((field) => field.label);
    if (missing.length > 0) return `必填字段缺失：${missing.join("、")}`;
    return "";
  }

  function buildDataAfter() {
    return Object.fromEntries(
      editableFields
        .filter((field) => !isEmptyFieldValue(values[field.key]))
        .map((field) => [field.key, values[field.key]])
    );
  }
}

export function NewRecordButton(props: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="open-create-record-editor"
      onClick={props.onClick}
      aria-haspopup="dialog"
      aria-expanded={props.open}
      className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background"
    >
      <Plus className="size-4" aria-hidden />
      {props.open ? "关闭新增" : "新增记录"}
    </button>
  );
}
