import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";

import {
  addChangeSetEntry,
  createChangeSet,
  type ChangeAction,
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
import { recordDisplayCode, stringifyCell } from "./currentViewUtils";

interface Props {
  schemaId: number;
  at: string;
  fields: FieldConfig[];
  records: CurrentViewRecord[];
  identityFieldKey: string;
  identityMode: IdentityMode;
  identityFieldKeys: string[];
  onDraftReady: (id: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function BulkChangeSetPanel({
  schemaId,
  at,
  fields,
  records,
  identityFieldKey,
  identityMode,
  identityFieldKeys,
  onDraftReady,
  onDirtyChange,
}: Props) {
  const identity = identityFieldKey;
  const notify = useNotification();
  const editableFields = fields.filter((field) => !field.deprecated && !isSystemHiddenField(field));
  const [draft, setDraft] = useState<ChangeSetDetail | null>(null);
  const [action, setAction] = useState<ChangeAction>("update");
  const [entityId, setEntityId] = useState(records[0]?.entity_id ? String(records[0].entity_id) : "");
  const [businessCode, setBusinessCode] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState("");
  const resolvedBusinessCode = buildIdentityCode(values, identityMode, identity, identityFieldKeys);
  const selectedRecord = useMemo(
    () => records.find((record) => String(record.entity_id) === entityId),
    [entityId, records]
  );
  const mutation = useMutation({
    mutationFn: async () => {
      const currentDraft =
        draft ?? (await createChangeSet(schemaId, { summary: `批量登记草稿 ${at}` }));
      if (!draft) {
        setDraft(currentDraft);
        onDraftReady(currentDraft.id);
      }
      await addChangeSetEntry(currentDraft.id, buildEntryPayload());
      return currentDraft;
    },
    onSuccess: (currentDraft) => {
      setDraft(currentDraft);
      onDraftReady(currentDraft.id);
      const message = `已自动保存到草稿 #${currentDraft.id}`;
      setMessage(message);
      notify.success({
        title: "批量登记已暂存",
        message,
      });
      setValues({});
      if (action === "create") setBusinessCode("");
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setMessage(apiError.message);
      notify.error({
        title: "批量登记失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  useEffect(() => {
    const hasFieldValues = Object.values(values).some((value) => !isEmptyFieldValue(value));
    onDirtyChange?.(hasFieldValues || businessCode.trim().length > 0);
  }, [businessCode, onDirtyChange, values]);

  return (
    <section className="grid gap-3">
      <div
        data-testid="bulk-change-draft-status"
        className="nd-interactive-surface flex items-center justify-between gap-3 border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
      >
        <span>草稿状态</span>
        <span className="font-mono">{draft ? `#${draft.id}` : "新草稿"}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-[140px_1fr]">
        <select
          id="bulk-change-action"
          name="bulk_change_action"
          value={action}
          onChange={(event) => setAction(event.target.value as ChangeAction)}
          className="h-9 border border-border bg-background px-2 text-sm"
        >
          <option value="update">修改已有</option>
          <option value="create">新增</option>
          <option value="terminate">终止</option>
        </select>
        {action === "create" && identityMode !== "composite" ? (
          <input
            id="bulk-change-business-code"
            name="bulk_change_business_code"
            value={businessCode}
            onChange={(event) => setBusinessCode(event.target.value)}
            placeholder={identity}
            className="h-9 border border-border bg-background px-2 text-sm outline-none"
          />
        ) : action === "create" ? (
          <div className="flex h-9 items-center border border-border bg-background px-2 font-mono text-sm text-muted-foreground">
            {resolvedBusinessCode || "组合标识待生成"}
          </div>
        ) : (
          <select
            id="bulk-change-entity"
            name="bulk_change_entity"
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            className="h-9 border border-border bg-background px-2 text-sm"
          >
            {records.map((record) => (
              <option key={record.entity_id} value={record.entity_id}>
                {recordDisplayCode(record)}
              </option>
            ))}
          </select>
        )}
      </div>
      {action !== "terminate" && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {editableFields.map((field) => (
            <label key={field.key} className="grid gap-1 text-xs text-muted-foreground">
              <span>
                {field.label}
                {field.required || field.key === identity || identityFieldKeys.includes(field.key) ? (
                  <span className="ml-1 text-[var(--color-status-error)]">*</span>
                ) : null}
              </span>
              <FieldValueInput
                field={field}
                id={`bulk-change-field-${field.key}`}
                name={`bulk_change_field_${field.key}`}
                value={field.key === identity && action === "create" ? businessCode : values[field.key] ?? ""}
                disabled={field.key === identity && action !== "create"}
                onChange={(value) =>
                  field.key === identity
                    ? setBusinessCode(stringifyCell(value))
                    : setValues((current) => ({ ...current, [field.key]: value }))
                }
                placeholder={String(selectedRecord?.data_payload[field.key] ?? "")}
              />
            </label>
          ))}
        </div>
      )}
      <div className="sticky bottom-0 -mx-4 mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-4 py-3">
        <p className="min-h-5 text-xs text-muted-foreground">{message}</p>
        <button
          type="button"
          disabled={mutation.isPending || (action !== "create" && !entityId)}
          onClick={() => void handleSave()}
          className="inline-flex h-9 items-center justify-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-40"
        >
          <Save className="size-4" aria-hidden />
          暂存草稿
        </button>
      </div>
    </section>
  );

  async function handleSave() {
    const validation = validateInput();
    if (validation) {
      notify.error({ title: "批量登记信息不完整", message: validation });
      return;
    }
    const confirmed = await notify.confirm({
      title: action === "terminate" ? "确认终止记录" : "确认暂存批量登记",
      description:
        action === "terminate"
          ? "终止会把该记录写入当前变更草稿，后续提交生效后记录会在该日期后结束。"
          : "确认后会写入当前变更草稿，发布前仍可从变更流移除明细或放弃草稿。",
      impactSummary: buildReviewSummary(),
      confirmLabel: action === "terminate" ? "确认终止" : "确认暂存",
      cancelLabel: "取消",
      tone: action === "terminate" ? "destructive" : undefined,
    });
    if (confirmed) mutation.mutate();
  }

  function buildEntryPayload() {
    const validFrom = at;
    if (action === "terminate") return { action, entity_id: Number(entityId), valid_from: validFrom };
    const data_after = Object.fromEntries(
      editableFields
        .filter((field) => action === "create" || !isEmptyFieldValue(values[field.key]))
        .map((field) => [
          field.key,
          field.key === identity && action === "create"
            ? businessCode
            : values[field.key] ?? "",
        ])
    );
    if (action === "create" && identityMode !== "composite") data_after[identity] = businessCode;
    return {
      action,
      entity_id: action === "update" ? Number(entityId) : undefined,
      valid_from: validFrom,
      data_after,
    };
  }

  function validateInput() {
    if (action !== "create" && !entityId) return "请选择要处理的记录";
    if (action === "create" && identityMode === "composite") {
      const missing = identityFieldKeys.filter((key) => isEmptyFieldValue(values[key]));
      if (missing.length > 0) {
        return `组合实体标识字段缺失：${identityFieldLabels(editableFields, missing).join("、")}`;
      }
    }
    if (action === "create" && identityMode !== "composite" && !businessCode.trim()) {
      return "新增记录必须填写实体标识";
    }
    if (action === "update" && Object.values(values).every(isEmptyFieldValue)) {
      return "修改已有记录至少需要填写 1 个字段";
    }
    return "";
  }

  function buildReviewSummary() {
    if (action === "terminate") {
      return [
        `动作：终止`,
        `记录：${selectedRecord ? recordDisplayCode(selectedRecord) : entityId}`,
        `生效日期：${at}`,
        draft ? `草稿：#${draft.id}` : "将自动创建新草稿",
      ];
    }
    const fieldCount = Object.keys(buildEntryPayload().data_after ?? {}).length;
    return [
      `动作：${action === "create" ? "新增" : "修改"}`,
      `记录：${action === "create" ? createBusinessCodeLabel() : selectedRecord ? recordDisplayCode(selectedRecord) : entityId}`,
      `字段数量：${fieldCount}`,
      draft ? `草稿：#${draft.id}` : "将自动创建新草稿",
    ];
  }

  function createBusinessCodeLabel() {
    if (identityMode === "composite") return resolvedBusinessCode || "组合标识待生成";
    return businessCode;
  }
}

export function TogglePanelButton(props: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="open-bulk-change-editor"
      onClick={props.onClick}
      aria-haspopup="dialog"
      aria-expanded={props.open}
      className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      <Plus className="size-4" aria-hidden />
      {props.open ? "关闭登记" : "批量登记"}
    </button>
  );
}
