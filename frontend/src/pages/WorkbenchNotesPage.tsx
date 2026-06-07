import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, PencilLine, Plus, Trash2 } from "lucide-react";

import {
  deleteWorkbenchItem,
  getNote,
  type WorkbenchNoteItem,
  type WorkbenchNoteListItem,
} from "@/api/workbench";
import { ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { CurrentViewDrawer } from "@/features/current-view/CurrentViewDrawer";
import { NoteDetailView } from "@/features/workbench/NoteDetailView";
import { NoteDrawerActionButton } from "@/features/workbench/NoteDrawerActionButton";
import { NoteEditor } from "@/features/workbench/NoteEditor";
import { NoteList } from "@/features/workbench/NoteList";
import { getSafeNoteListDetail, hasFullNoteDetail } from "@/features/workbench/noteMeta";
import {
  invalidateWorkbenchQueries,
  isNoteBusy,
  noteDetailQueryKey,
  withIdToggled,
} from "@/features/workbench/notePageUtils";
import { QuickCapture } from "@/features/workbench/QuickCapture";
import { WorkbenchChrome, WorkbenchSection } from "@/features/workbench/WorkbenchChrome";
import { useWorkbenchNotesQuery } from "@/features/workbench/useWorkbenchQueries";

type NoteTarget = WorkbenchNoteListItem | WorkbenchNoteItem;

export function WorkbenchNotesPage() {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const query = useWorkbenchNotesQuery();
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [linkedSchemaFilter, setLinkedSchemaFilter] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [detailTarget, setDetailTarget] = useState<NoteTarget | null>(null);
  const [editorTarget, setEditorTarget] = useState<NoteTarget | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const [deletingNoteIds, setDeletingNoteIds] = useState<Set<number>>(() => new Set());
  const [savingNoteIds, setSavingNoteIds] = useState<Set<number>>(() => new Set());
  const items = query.data?.results ?? [];
  const pendingCount = items.filter((item) => getSafeNoteListDetail(item).status === "pending_confirm").length;
  const sensitiveCount = items.filter((item) => item.is_sensitive).length;

  const detailQuery = useQuery({
    queryKey: noteDetailQueryKey(detailTarget?.id),
    queryFn: () => getNote(detailTarget!.id),
    enabled: detailTarget !== null,
    initialData: hasFullNoteDetail(detailTarget) ? detailTarget : undefined,
  });

  const editorQuery = useQuery({
    queryKey: noteDetailQueryKey(editorTarget?.id),
    queryFn: () => getNote(editorTarget!.id),
    enabled: editorOpen && editorTarget !== null,
    initialData: hasFullNoteDetail(editorTarget) ? editorTarget : undefined,
  });

  const detailItem = detailTarget ? (detailQuery.data ?? null) : null;
  const editorItem = editorTarget ? (editorQuery.data ?? null) : null;
  const detailReference = detailItem ?? detailTarget;
  const detailLoading = detailTarget !== null && detailItem === null && detailQuery.isLoading;
  const editorLoading = editorOpen && editorTarget !== null && editorItem === null && editorQuery.isLoading;
  const detailBlocked = detailReference ? isNoteBusy(detailReference.id, deletingNoteIds, savingNoteIds) : false;

  const deleteMutation = useMutation({
    mutationFn: (item: NoteTarget) => deleteWorkbenchItem(item.id),
    onMutate: (item) => {
      setDeletingNoteIds((current) => withIdToggled(current, item.id, true));
    },
    onSuccess: async (_, item) => {
      notify.success({ title: "笔记已移入回收站", message: item.title });
      if (detailReference?.id === item.id) {
        setDetailTarget(null);
      }
      if (editorTarget?.id === item.id) {
        setEditorOpen(false);
        setEditorTarget(null);
      }
      queryClient.removeQueries({ queryKey: noteDetailQueryKey(item.id) });
      await invalidateWorkbenchQueries(queryClient, true);
    },
    onError: () => {
      notify.error({ title: "删除失败", message: "笔记未能移入回收站。" });
    },
    onSettled: (_, __, item) => {
      setDeletingNoteIds((current) => withIdToggled(current, item.id, false));
    },
  });

  function openCreate() {
    setDetailTarget(null);
    setEditorTarget(null);
    setEditorOpen(true);
  }

  function openDetail(item: WorkbenchNoteListItem) {
    setDetailTarget(item);
  }

  function openEdit(item: NoteTarget) {
    if (isNoteBusy(item.id, deletingNoteIds, savingNoteIds)) return;
    setDetailTarget(null);
    setEditorTarget(item);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (editorPending) return;
    setEditorOpen(false);
    setEditorTarget(null);
  }

  const handleEditorPendingChange = useCallback((pending: boolean, noteId: number | null) => {
    setEditorPending(pending);
    if (noteId === null) return;
    setSavingNoteIds((current) => withIdToggled(current, noteId, pending));
  }, []);

  async function handleSaved(item: WorkbenchNoteItem) {
    queryClient.setQueryData(noteDetailQueryKey(item.id), item);
    setEditorOpen(false);
    setEditorTarget(null);
    setDetailTarget(item);
    await invalidateWorkbenchQueries(queryClient, false);
  }

  async function handleDelete(item: NoteTarget) {
    if (isNoteBusy(item.id, deletingNoteIds, savingNoteIds)) return;
    const confirmed = await notify.confirm({
      title: "确认删除笔记",
      description: `“${item.title}”会被移入回收站，不会立即永久删除。`,
      impactSummary: [
        "笔记会从当前列表移除",
        "可在回收站恢复",
        "正文与关联信息会保留在回收站记录中",
      ],
      confirmLabel: "移入回收站",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) deleteMutation.mutate(item);
  }

  return (
    <WorkbenchChrome
      title="我的笔记"
      subtitle="过程记录、待确认项与个人 Markdown 沉淀"
      meta={
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          共 {items.length} 条 / 待确认 {pendingCount} 条 / 敏感 {sensitiveCount} 条
        </span>
      }
      action={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background"
          aria-label="新建笔记"
        >
          <Plus className="size-4" aria-hidden />
          新建笔记
        </button>
      }
    >
      <WorkbenchSection index="01" title="笔记工作区" subtitle="NOTES">
        {query.isLoading ? (
          <LoadingState minH="min-h-56" label="加载笔记列表" />
        ) : query.isError ? (
          <ErrorState
            title="笔记列表加载失败"
            error={query.error}
            onRetry={() => query.refetch()}
            minH="min-h-56"
          />
        ) : (
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
            <div className="min-w-0">
              <NoteList
                items={items}
                stageFilter={stageFilter}
                statusFilter={statusFilter}
                linkedSchemaFilter={linkedSchemaFilter}
                tagQuery={tagQuery}
                onStageFilterChange={setStageFilter}
                onStatusFilterChange={setStatusFilter}
                onLinkedSchemaFilterChange={setLinkedSchemaFilter}
                onTagQueryChange={setTagQuery}
                onOpen={openDetail}
                onCreate={openCreate}
              />
            </div>

            <aside className="min-w-0 border-t border-border xl:self-start xl:border-l xl:border-t-0">
              <div className="grid gap-4 px-4 py-4 md:px-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center border border-border text-muted-foreground">
                    <NotebookPen className="size-4" aria-hidden />
                  </span>
                  <div className="grid gap-1">
                    <h3 className="text-sm font-semibold text-foreground">快速捕获</h3>
                    <p className="text-xs text-muted-foreground">
                      先收纳临时判断和审批备注，再回到笔记详情继续整理 Markdown。
                    </p>
                  </div>
                </div>
                <div className="border border-border p-3">
                  <QuickCapture onCreated={() => void invalidateWorkbenchQueries(queryClient, false)} />
                </div>
              </div>
            </aside>
          </div>
        )}
      </WorkbenchSection>

      <CurrentViewDrawer
        open={Boolean(detailTarget)}
        title={detailReference?.title ?? "笔记详情"}
        description={
          detailReference?.is_sensitive
            ? "敏感笔记，列表页不会渲染正文。"
            : detailReference?.summary || "未填写摘要"
        }
        meta={detailReference ? `#${detailReference.id}` : undefined}
        actions={
          detailReference ? (
            <>
              <NoteDrawerActionButton
                label="编辑"
                icon={<PencilLine className="size-4" aria-hidden />}
                disabled={detailBlocked}
                onClick={() => openEdit(detailReference)}
              />
              <NoteDrawerActionButton
                label="删除"
                tone="destructive"
                loading={detailReference ? deletingNoteIds.has(detailReference.id) : false}
                disabled={detailBlocked}
                icon={<Trash2 className="size-4" aria-hidden />}
                onClick={() => void handleDelete(detailReference)}
              />
            </>
          ) : null
        }
        onRequestClose={() => setDetailTarget(null)}
      >
        {detailLoading ? (
          <LoadingState minH="min-h-48" label="加载笔记详情" />
        ) : detailTarget !== null && detailItem === null && detailQuery.isError ? (
          <ErrorState
            title="笔记详情加载失败"
            error={detailQuery.error}
            onRetry={() => detailQuery.refetch()}
            minH="min-h-48"
          />
        ) : detailItem ? (
          <NoteDetailView item={detailItem} />
        ) : null}
      </CurrentViewDrawer>

      <CurrentViewDrawer
        open={editorOpen}
        title={editorTarget ? "编辑笔记" : "新建笔记"}
        description="维护标题、标签、阶段、状态与 Markdown 正文。"
        size="lg"
        onRequestClose={closeEditor}
      >
        {editorLoading ? (
          <LoadingState minH="min-h-48" label="加载笔记详情" />
        ) : editorOpen && editorTarget !== null && editorItem === null && editorQuery.isError ? (
          <ErrorState
            title="笔记详情加载失败"
            error={editorQuery.error}
            onRetry={() => editorQuery.refetch()}
            minH="min-h-48"
          />
        ) : (
          <NoteEditor
            key={editorItem?.id ?? (editorTarget?.id ?? "new")}
            item={editorTarget ? editorItem : null}
            disabled={editorTarget ? deletingNoteIds.has(editorTarget.id) : false}
            onCancel={closeEditor}
            onSaved={(item) => void handleSaved(item)}
            onPendingChange={handleEditorPendingChange}
          />
        )}
      </CurrentViewDrawer>
    </WorkbenchChrome>
  );
}
