import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip, Plus, Trash2 } from "lucide-react";

import {
  createMaterialChecklistItem,
  deleteMaterialChecklistItem,
  listMaterialChecklist,
  updateMaterialChecklistItem,
  type MaterialChecklistItem,
  type MaterialChecklistStatus,
  type WorkbenchMaterialItem,
} from "@/api/workbench";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import {
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
} from "@/features/workbench/NoteFormControls";
import { getMaterialDisplayTitle } from "@/features/workbench/materialMeta";
import { formatWorkbenchDateTime } from "@/features/workbench/noteMeta";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";

const STATUS_OPTIONS: Array<readonly [MaterialChecklistStatus, string]> = [
  ["missing", "缺失"],
  ["uploaded", "已上传"],
  ["pending_confirm", "待确认"],
  ["not_applicable", "不适用"],
];

interface MaterialChecklistPanelProps {
  schemaId: number;
  open: boolean;
  relatedMaterials: WorkbenchMaterialItem[];
  onDirtyChange?: (dirty: boolean) => void;
}

export function MaterialChecklistPanel(props: MaterialChecklistPanelProps) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const { onDirtyChange } = props;
  const [newTitle, setNewTitle] = useState("");
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const materialsById = useMemo(
    () => new Map(props.relatedMaterials.map((item) => [item.id, item])),
    [props.relatedMaterials]
  );
  const checklistDirty = newTitle.trim().length > 0 || dirtyIds.size > 0;
  const checklistQuery = useQuery({
    queryKey: ["schema-workbench", props.schemaId, "material-checklist"],
    queryFn: () => listMaterialChecklist(props.schemaId),
    enabled: props.open,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string }) => createMaterialChecklistItem(props.schemaId, payload),
    onSuccess: async (item) => {
      setNewTitle("");
      notify.success({ title: "已加入材料清单", message: item.title });
      await queryClient.invalidateQueries({
        queryKey: ["schema-workbench", props.schemaId, "material-checklist"],
      });
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "新增清单项失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      itemId: number;
      title: string;
      status: MaterialChecklistStatus;
      note: string;
    }) =>
      updateMaterialChecklistItem(props.schemaId, payload.itemId, {
        title: payload.title,
        status: payload.status,
        note: payload.note,
      }),
    onMutate: ({ itemId }) => setSavingIds((current) => toggleId(current, itemId, true)),
    onSuccess: async (item) => {
      notify.success({ title: "清单项已保存", message: item.title });
      await queryClient.invalidateQueries({
        queryKey: ["schema-workbench", props.schemaId, "material-checklist"],
      });
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "保存清单项失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
    onSettled: (_, __, payload) => {
      setSavingIds((current) => toggleId(current, payload.itemId, false));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: MaterialChecklistItem) => deleteMaterialChecklistItem(props.schemaId, item.id),
    onMutate: (item) => setDeletingIds((current) => toggleId(current, item.id, true)),
    onSuccess: async (_, item) => {
      notify.success({ title: "清单项已删除", message: item.title });
      await queryClient.invalidateQueries({
        queryKey: ["schema-workbench", props.schemaId, "material-checklist"],
      });
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "删除清单项失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
    onSettled: (_, __, item) => {
      setDeletingIds((current) => toggleId(current, item.id, false));
    },
  });

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      notify.error({ title: "新增清单项失败", message: "请输入材料名称。" });
      return;
    }
    createMutation.mutate({ title });
  }

  async function handleDelete(item: MaterialChecklistItem) {
    if (savingIds.has(item.id) || deletingIds.has(item.id)) return;
    const confirmed = await notify.confirm({
      title: "确认删除清单项",
      description: `“${item.title}”会从当前表的材料准备清单中移除。`,
      impactSummary: ["该项备注会一并删除", "不会删除已上传的材料", "可稍后重新添加"],
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) deleteMutation.mutate(item);
  }

  const handleRowDirtyChange = useCallback((itemId: number, dirty: boolean) => {
    setDirtyIds((current) => {
      const hasDirty = current.has(itemId);
      if (dirty === hasDirty) return current;
      const next = new Set(current);
      if (dirty) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  useEffect(() => {
    onDirtyChange?.(checklistDirty);
  }, [checklistDirty, onDirtyChange]);

  return (
    <div className="grid gap-3">
      <form
        className="grid gap-3 border border-border p-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-end sm:p-4"
        onSubmit={handleCreate}
      >
        <LabeledInput
          label="新增清单项"
          value={newTitle}
          onChange={setNewTitle}
          placeholder="例如：营业执照扫描件"
          required
          disabled={createMutation.isPending}
        />
        <button
          type="submit"
          disabled={createMutation.isPending || !newTitle.trim()}
          className="inline-flex h-10 items-center justify-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="material-checklist-add-submit"
        >
          {createMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          添加
        </button>
      </form>

      {checklistQuery.isLoading ? (
        <LoadingState minH="min-h-32" label="加载材料清单" />
      ) : checklistQuery.isError ? (
        <ErrorState
          title="材料清单加载失败"
          error={checklistQuery.error}
          onRetry={() => void checklistQuery.refetch()}
          minH="min-h-32"
        />
      ) : checklistQuery.data?.results.length ? (
        <div className="grid gap-3">
          {checklistQuery.data.results.map((item) => (
            <ChecklistRow
              key={`${item.id}:${item.updated_at}`}
              item={item}
              linkedMaterialTitle={resolveLinkedMaterialTitle(item, materialsById)}
              saving={savingIds.has(item.id)}
              deleting={deletingIds.has(item.id)}
              onDirtyChange={handleRowDirtyChange}
              onSave={(draft) => updateMutation.mutate(draft)}
              onDelete={() => void handleDelete(item)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          minH="min-h-32"
          title="还没有材料准备清单"
          description="可以先列出待收集材料，再逐项补充状态和备注。"
        />
      )}
    </div>
  );
}

function ChecklistRow(props: {
  item: MaterialChecklistItem;
  linkedMaterialTitle: string | null;
  saving: boolean;
  deleting: boolean;
  onDirtyChange?: (itemId: number, dirty: boolean) => void;
  onSave: (draft: {
    itemId: number;
    title: string;
    status: MaterialChecklistStatus;
    note: string;
  }) => void;
  onDelete: () => void;
}) {
  const { item, onDirtyChange } = props;
  const [title, setTitle] = useState(props.item.title);
  const [status, setStatus] = useState<MaterialChecklistStatus>(props.item.status);
  const [note, setNote] = useState(props.item.note);

  const disabled = props.saving || props.deleting;
  const dirty = useMemo(
    () => title !== item.title || status !== item.status || note !== item.note,
    [item.note, item.status, item.title, note, status, title]
  );

  useEffect(() => {
    onDirtyChange?.(item.id, dirty);
  }, [dirty, item.id, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(item.id, false);
    },
    [item.id, onDirtyChange]
  );

  return (
    <section className="grid gap-3 border border-border p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <LabeledInput
          label="材料名称"
          value={title}
          onChange={setTitle}
          required
          disabled={disabled}
        />
        <LabeledSelect
          label="状态"
          value={status}
          onChange={(value) => setStatus(value as MaterialChecklistStatus)}
          options={STATUS_OPTIONS}
          disabled={disabled}
        />
      </div>

      {props.linkedMaterialTitle ? (
        <div className="flex flex-wrap items-center gap-2 border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <Paperclip className="size-3.5" aria-hidden />
          <span className="text-foreground">已关联材料</span>
          <span className="truncate">{props.linkedMaterialTitle}</span>
        </div>
      ) : null}

      <LabeledTextarea label="备注" value={note} onChange={setNote} rows={3} disabled={disabled} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          更新于 {formatWorkbenchDateTime(props.item.updated_at)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || !title.trim() || !dirty}
            onClick={() =>
              props.onSave({
                itemId: props.item.id,
                title: title.trim(),
                status,
                note,
              })
            }
            className="inline-flex h-9 items-center gap-2 border border-foreground bg-foreground px-3 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            保存
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={props.onDelete}
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.deleting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            删除
          </button>
        </div>
      </div>
    </section>
  );
}

function resolveLinkedMaterialTitle(
  item: MaterialChecklistItem,
  materialsById: Map<number, WorkbenchMaterialItem>
) {
  if (!item.linked_material_item) return null;
  const material = materialsById.get(item.linked_material_item.id);
  if (material) return getMaterialDisplayTitle(material);
  return `关联材料 #${item.linked_material_item.id}`;
}

function toggleId(source: Set<number>, id: number, enabled: boolean) {
  const next = new Set(source);
  if (enabled) next.add(id);
  else next.delete(id);
  return next;
}
