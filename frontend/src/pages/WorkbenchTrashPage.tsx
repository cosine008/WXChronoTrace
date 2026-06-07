import { useRef, useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  purgeWorkbenchItem,
  restoreWorkbenchItem,
  type WorkbenchItem,
  type WorkbenchItemType,
} from "@/api/workbench";
import { ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { TrashList } from "@/features/workbench/TrashList";
import { WorkbenchChrome, WorkbenchSection } from "@/features/workbench/WorkbenchChrome";
import { useWorkbenchTrashQuery, workbenchKeys } from "@/features/workbench/useWorkbenchQueries";
import { extractApiError } from "@/lib/api";

export function WorkbenchTrashPage() {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const query = useWorkbenchTrashQuery();
  const [typeFilter, setTypeFilter] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [restoringIds, setRestoringIds] = useState<Set<number>>(() => new Set());
  const [purgingIds, setPurgingIds] = useState<Set<number>>(() => new Set());
  const [confirmingPurgeIds, setConfirmingPurgeIds] = useState<Set<number>>(() => new Set());
  const restoringIdsRef = useRef<Set<number>>(new Set());
  const purgingIdsRef = useRef<Set<number>>(new Set());
  const confirmingPurgeIdsRef = useRef<Set<number>>(new Set());
  const items = query.data?.results ?? [];
  const sensitiveCount = items.filter((item) => item.is_sensitive).length;

  const restoreMutation = useMutation({
    mutationFn: (item: WorkbenchItem) => restoreWorkbenchItem(item.id),
    onMutate: (item) => applyIdState(setRestoringIds, restoringIdsRef, item.id, true),
    onSuccess: async (restoredItem) => {
      notify.success({ title: "恢复成功", message: getTrashItemDisplayTitle(restoredItem) });
      await invalidateAfterRestore(queryClient, restoredItem.type);
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({ title: "恢复失败", message: apiError.message, code: apiError.code });
    },
    onSettled: (_, __, item) => applyIdState(setRestoringIds, restoringIdsRef, item.id, false),
  });

  const purgeMutation = useMutation({
    mutationFn: (item: WorkbenchItem) => purgeWorkbenchItem(item.id),
    onMutate: (item) => applyIdState(setPurgingIds, purgingIdsRef, item.id, true),
    onSuccess: async (_, item) => {
      notify.success({ title: "已永久删除", message: getTrashItemDisplayTitle(item) });
      await invalidateAfterPurge(queryClient, item.type);
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({ title: "永久删除失败", message: apiError.message, code: apiError.code });
    },
    onSettled: (_, __, item) => applyIdState(setPurgingIds, purgingIdsRef, item.id, false),
  });

  function isItemBusy(itemId: number) {
    return isItemBusyByRef(itemId, restoringIdsRef, purgingIdsRef, confirmingPurgeIdsRef);
  }

  function handleRestore(item: WorkbenchItem) {
    if (isItemBusy(item.id)) return;
    restoreMutation.mutate(item);
  }

  async function handlePurge(item: WorkbenchItem) {
    if (isItemBusy(item.id)) return;
    applyIdState(setConfirmingPurgeIds, confirmingPurgeIdsRef, item.id, true);
    try {
      const confirmed = await notify.confirm({
        title: "确认永久删除",
        description: `“${getTrashItemDisplayTitle(item)}”将被永久删除且不可恢复，请确认操作。`,
        impactSummary: [
          "该记录会从回收站中移除",
          "关联工作台列表将同步更新",
          "永久删除后无法恢复",
        ],
        confirmLabel: "永久删除",
        cancelLabel: "取消",
        tone: "destructive",
      });
      if (!confirmed) return;
      if (isItemMutatingByRef(item.id, restoringIdsRef, purgingIdsRef)) return;
      purgeMutation.mutate(item);
    } finally {
      applyIdState(setConfirmingPurgeIds, confirmingPurgeIdsRef, item.id, false);
    }
  }

  return (
    <WorkbenchChrome
      title="回收站"
      subtitle="已删除内容恢复与永久清理"
      meta={
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          已删除 {items.length} 项 / 敏感 {sensitiveCount} 项
        </span>
      }
    >
      <WorkbenchSection index="01" title="回收站工作区" subtitle="TRASH">
        {query.isLoading ? (
          <LoadingState minH="min-h-56" label="加载回收站" />
        ) : query.isError ? (
          <ErrorState
            title="回收站加载失败"
            error={query.error}
            onRetry={() => query.refetch()}
            minH="min-h-56"
          />
        ) : (
          <TrashList
            items={items}
            typeFilter={typeFilter}
            tagQuery={tagQuery}
            restoringIds={restoringIds}
            purgingIds={purgingIds}
            confirmingPurgeIds={confirmingPurgeIds}
            onTypeFilterChange={setTypeFilter}
            onTagQueryChange={setTagQuery}
            onRestore={handleRestore}
            onPurge={(item) => void handlePurge(item)}
          />
        )}
      </WorkbenchSection>
    </WorkbenchChrome>
  );
}

async function invalidateAfterRestore(queryClient: QueryClient, type: WorkbenchItemType) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: workbenchKeys.trash() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.items() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.overview() }),
  ];
  const scopedKey = getScopedListKey(type);
  if (scopedKey) tasks.push(queryClient.invalidateQueries({ queryKey: scopedKey }));
  await Promise.all(tasks);
}

async function invalidateAfterPurge(
  queryClient: QueryClient,
  type: WorkbenchItemType | null | undefined
) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: workbenchKeys.trash() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.items() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.overview() }),
  ];
  const scopedKey = type ? getScopedListKey(type) : null;
  if (scopedKey) tasks.push(queryClient.invalidateQueries({ queryKey: scopedKey }));
  await Promise.all(tasks);
}

function getScopedListKey(type: WorkbenchItemType) {
  if (type === "data_card") return workbenchKeys.dataCards();
  if (type === "note") return workbenchKeys.notes();
  if (type === "material") return workbenchKeys.materials();
  return null;
}

function withIdToggled(source: Set<number>, id: number, enabled: boolean) {
  const next = new Set(source);
  if (enabled) next.add(id);
  else next.delete(id);
  return next;
}

function applyIdState(
  setter: (updater: (current: Set<number>) => Set<number>) => void,
  targetRef: { current: Set<number> },
  id: number,
  enabled: boolean
) {
  targetRef.current = withIdToggled(targetRef.current, id, enabled);
  setter((current) => withIdToggled(current, id, enabled));
}

function isItemBusyByRef(
  itemId: number,
  restoringIdsRef: { current: Set<number> },
  purgingIdsRef: { current: Set<number> },
  confirmingPurgeIdsRef: { current: Set<number> }
) {
  return (
    restoringIdsRef.current.has(itemId) ||
    purgingIdsRef.current.has(itemId) ||
    confirmingPurgeIdsRef.current.has(itemId)
  );
}

function isItemMutatingByRef(
  itemId: number,
  restoringIdsRef: { current: Set<number> },
  purgingIdsRef: { current: Set<number> }
) {
  return restoringIdsRef.current.has(itemId) || purgingIdsRef.current.has(itemId);
}

function getTrashItemDisplayTitle(item: Pick<WorkbenchItem, "id" | "type" | "title" | "is_sensitive">) {
  if (item.type === "material" && item.is_sensitive) return `敏感材料 #${item.id}`;
  return item.title;
}
