import { Children, useCallback, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Database,
  FileText,
  Loader2,
  NotebookPen,
  Paperclip,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  getSchemaWorkbench,
  quickCreateSchemaNote,
  type WorkbenchDataCardItem,
  type WorkbenchItem,
  type WorkbenchMaterialItem,
  type WorkbenchNoteItem,
} from "@/api/workbench";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { CurrentViewDrawer } from "@/features/current-view/CurrentViewDrawer";
import {
  DATA_CARD_CATEGORY_LABELS,
  DATA_CARD_STATUS_LABELS,
  dataCardStatusTone,
  getDataCardDetail,
} from "@/features/workbench/dataCardMeta";
import { MaterialChecklistPanel } from "@/features/workbench/MaterialChecklistPanel";
import {
  formatMaterialPreviewStatus,
  formatMaterialTypeLabel,
  getMaterialDetail,
  getMaterialDisplayTitle,
  getMaterialListDescription,
  getMaterialTypeKey,
} from "@/features/workbench/materialMeta";
import {
  NOTE_STAGE_LABELS,
  NOTE_STATUS_LABELS,
  formatWorkbenchDateTime,
  getSafeNoteListDetail,
} from "@/features/workbench/noteMeta";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
  WorkbenchStatusTag,
} from "@/features/workbench/WorkbenchObjectMarkers";
import { WorkbenchSurface } from "@/features/workbench/WorkbenchChrome";
import { workbenchKeys } from "@/features/workbench/useWorkbenchQueries";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";

const schemaWorkbenchQueryKey = (schemaId: number) =>
  ["schema-workbench", schemaId, "items"] as const;

interface SchemaWorkbenchDrawerProps {
  schemaId: number;
  schemaCode: string;
  schemaName: string;
  open: boolean;
  onClose: () => void;
}

export function SchemaWorkbenchDrawer(props: SchemaWorkbenchDrawerProps) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const navigate = useNavigate();
  const { onClose, open, schemaCode, schemaId, schemaName } = props;
  const [content, setContent] = useState("");
  const [localError, setLocalError] = useState("");
  const [checklistDirty, setChecklistDirty] = useState(false);
  const query = useQuery({
    queryKey: schemaWorkbenchQueryKey(schemaId),
    queryFn: () => getSchemaWorkbench(schemaId),
    enabled: open,
  });

  const quickNoteMutation = useMutation({
    mutationFn: (payload: { content: string }) => quickCreateSchemaNote(schemaId, payload),
    onSuccess: async (response) => {
      setContent("");
      setLocalError("");
      notify.success({
        title: "工作台笔记已保存",
        message: `已记录到当前表：${response.item.title}`,
      });
      if (response.warning) {
        notify.info({ title: "已保存，但有提示", message: response.warning });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: schemaWorkbenchQueryKey(schemaId) }),
        queryClient.invalidateQueries({ queryKey: workbenchKeys.notes() }),
        queryClient.invalidateQueries({ queryKey: workbenchKeys.items() }),
        queryClient.invalidateQueries({ queryKey: workbenchKeys.overview() }),
      ]);
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "快速记笔记失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  const items = useMemo(() => query.data?.results ?? [], [query.data?.results]);
  const dataCards = useMemo(
    () => items.filter((item): item is WorkbenchDataCardItem => item.type === "data_card"),
    [items]
  );
  const notes = useMemo(
    () => items.filter((item): item is WorkbenchNoteItem => item.type === "note"),
    [items]
  );
  const materials = useMemo(
    () => items.filter((item): item is WorkbenchMaterialItem => item.type === "material"),
    [items]
  );
  const quickNoteDirty = content.trim().length > 0;
  const hasDirty = quickNoteDirty || checklistDirty;

  const performClose = useCallback(() => {
    setContent("");
    setLocalError("");
    setChecklistDirty(false);
    onClose();
  }, [onClose]);

  const confirmDiscardChanges = useCallback(async () => {
    if (!hasDirty) return true;

    const impactSummary: string[] = [];
    if (quickNoteDirty) {
      impactSummary.push("快速笔记草稿将被清空");
    }
    if (checklistDirty) {
      impactSummary.push("材料清单未保存修改将被清空");
    }

    return notify.confirm({
      title: "关闭工作台？",
      description: "关闭后，工作台中尚未保存的输入会被清空。",
      impactSummary,
      confirmLabel: "放弃并关闭",
      cancelLabel: "继续编辑",
      tone: "destructive",
    });
  }, [checklistDirty, hasDirty, notify, quickNoteDirty]);

  const requestClose = useCallback(async () => {
    if (await confirmDiscardChanges()) {
      performClose();
    }
  }, [confirmDiscardChanges, performClose]);

  const handleGuardedNavigation = useCallback(
    (to: string, event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldGuardNavigation(event, hasDirty)) return;
      event.preventDefault();
      void confirmDiscardChanges().then((confirmed) => {
        if (!confirmed) return;
        performClose();
        navigate(to);
      });
    },
    [confirmDiscardChanges, hasDirty, navigate, performClose]
  );

  function handleQuickNoteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = content.trim();
    if (!value) {
      setLocalError("请输入要记录的内容。");
      return;
    }
    setLocalError("");
    quickNoteMutation.mutate({ content: value });
  }

  return (
    <CurrentViewDrawer
      open={open}
      title="工作台"
      description={
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>围绕“{schemaName}”整理当前表相关资料、笔记、材料和准备事项。</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span>资料 {dataCards.length}</span>
            <span>笔记 {notes.length}</span>
            <span>材料 {materials.length}</span>
          </div>
        </div>
      }
      meta={schemaCode}
      actions={
        <Link
          to="/workbench"
          onClick={(event) => handleGuardedNavigation("/workbench", event)}
          className="inline-flex h-8 items-center gap-2 border border-border px-3 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" aria-hidden />
          打开我的工作台
        </Link>
      }
      testId="schema-workbench-drawer"
      closeTestId="schema-workbench-drawer-close"
      onRequestClose={() => void requestClose()}
    >
      <div className="grid gap-4">
        <DrawerSection
          title="相关资料"
          count={dataCards.length}
          icon={Database}
          to="/workbench/data-cards"
          onNavigateClick={(event) => handleGuardedNavigation("/workbench/data-cards", event)}
        >
          <RelatedBlock
            query={query}
            emptyTitle="还没有关联资料"
            emptyDescription="可在我的资料中维护常用资料卡，并与当前表建立关联。"
          >
            {dataCards.map((item) => (
              <RelatedWorkbenchRow
                key={item.id}
                item={item}
                title={item.title}
                summary={safeSummary(item)}
              />
            ))}
          </RelatedBlock>
        </DrawerSection>

        <DrawerSection
          title="相关笔记"
          count={notes.length}
          icon={FileText}
          to="/workbench/notes"
          onNavigateClick={(event) => handleGuardedNavigation("/workbench/notes", event)}
        >
          <RelatedBlock
            query={query}
            emptyTitle="还没有关联笔记"
            emptyDescription="可先用下方快速记笔记，把当前表的判断和待办沉淀下来。"
          >
            {notes.map((item) => (
              <RelatedWorkbenchRow
                key={item.id}
                item={item}
                title={item.title}
                summary={safeSummary(item)}
              />
            ))}
          </RelatedBlock>
        </DrawerSection>

        <DrawerSection
          title="相关材料"
          count={materials.length}
          icon={Paperclip}
          to="/workbench/materials"
          onNavigateClick={(event) => handleGuardedNavigation("/workbench/materials", event)}
        >
          <RelatedBlock
            query={query}
            emptyTitle="还没有关联材料"
            emptyDescription="上传后的材料可关联到当前表，方便集中查看和材料准备。"
          >
            {materials.map((item) => (
              <RelatedWorkbenchRow
                key={item.id}
                item={item}
                title={getMaterialDisplayTitle(item)}
                summary={getMaterialListDescription(item)}
              />
            ))}
          </RelatedBlock>
        </DrawerSection>

        <DrawerSection title="快速记笔记" icon={NotebookPen}>
          <WorkbenchSurface className="p-4">
            <form className="grid gap-3" onSubmit={handleQuickNoteSubmit}>
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">
                  记录当前表相关判断、问题和待办
                </span>
                <textarea
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    if (localError) setLocalError("");
                  }}
                  rows={5}
                  disabled={quickNoteMutation.isPending}
                  data-testid="schema-workbench-quick-note-input"
                  aria-describedby={localError ? "schema-workbench-quick-note-error" : undefined}
                  className="min-h-28 resize-y border border-border bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
                  placeholder="记录本表当前确认的信息、待追材料或下一步动作。"
                />
              </label>
              {localError ? (
                <p
                  id="schema-workbench-quick-note-error"
                  aria-live="polite"
                  className="text-xs text-[var(--color-status-error)]"
                >
                  {localError}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  保存后会自动关联到当前表，同时同步到“我的笔记”列表。
                </p>
                <button
                  type="submit"
                  disabled={quickNoteMutation.isPending || !content.trim()}
                  data-testid="schema-workbench-quick-note-submit"
                  className="inline-flex h-10 items-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {quickNoteMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <NotebookPen className="size-4" aria-hidden />
                  )}
                  保存
                </button>
              </div>
            </form>
          </WorkbenchSurface>
        </DrawerSection>

        <DrawerSection title="材料准备清单" icon={BriefcaseBusiness}>
          <WorkbenchSurface className="p-4">
            <MaterialChecklistPanel
              schemaId={schemaId}
              open={open}
              relatedMaterials={materials}
              onDirtyChange={setChecklistDirty}
            />
          </WorkbenchSurface>
        </DrawerSection>
      </div>
    </CurrentViewDrawer>
  );
}

function DrawerSection(props: {
  title: string;
  icon: typeof Database;
  count?: number;
  to?: string;
  onNavigateClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}) {
  const Icon = props.icon;

  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
          {typeof props.count === "number" ? (
            <span className="border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {props.count}
            </span>
          ) : null}
        </div>
        {props.to ? (
          <Link
            to={props.to}
            onClick={props.onNavigateClick}
            className="inline-flex h-8 items-center gap-2 border border-border px-2.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            <ArrowUpRight className="size-3.5" aria-hidden />
            打开全部
          </Link>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

function RelatedBlock(props: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  if (props.query.isLoading) {
    return (
      <WorkbenchSurface>
        <LoadingState minH="min-h-24" label="加载中" />
      </WorkbenchSurface>
    );
  }

  if (props.query.isError) {
    return (
      <WorkbenchSurface>
        <ErrorState
          title="工作台关联内容加载失败"
          error={props.query.error}
          onRetry={() => void props.query.refetch()}
          minH="min-h-24"
        />
      </WorkbenchSurface>
    );
  }

  if (!hasChildren(props.children)) {
    return (
      <WorkbenchSurface>
        <EmptyState
          minH="min-h-24"
          title={props.emptyTitle}
          description={props.emptyDescription}
        />
      </WorkbenchSurface>
    );
  }

  return <WorkbenchSurface className="divide-y divide-border">{props.children}</WorkbenchSurface>;
}

function RelatedWorkbenchRow(props: {
  item: WorkbenchItem;
  title: string;
  summary: string;
}) {
  return (
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-4">
      <div className="min-w-0 grid gap-2">
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type={props.item.type} detail={relatedKindDetail(props.item)} />
            <RelatedStatusTags item={props.item} />
          </div>
          <WorkbenchSignalRail
            pinned={props.item.is_pinned}
            sensitive={props.item.is_sensitive}
          />
        </div>
        <div className="grid min-w-0 gap-1">
          <span className="truncate text-sm font-medium text-foreground">{props.title}</span>
          <p className="text-sm text-muted-foreground">{props.summary}</p>
        </div>
      </div>
      <div className="font-mono text-[11px] text-muted-foreground sm:text-right">
        更新于 {formatWorkbenchDateTime(props.item.updated_at)}
      </div>
    </div>
  );
}

function RelatedStatusTags({ item }: { item: WorkbenchItem }) {
  if (item.type === "data_card") {
    const detail = getDataCardDetail(item);
    if (!detail) return null;
    return (
      <>
        <WorkbenchStatusTag code="CAT" label={DATA_CARD_CATEGORY_LABELS[detail.category]} tone="info" />
        <WorkbenchStatusTag
          code="STATE"
          label={DATA_CARD_STATUS_LABELS[detail.status]}
          tone={dataCardStatusTone(detail.status)}
        />
      </>
    );
  }
  if (item.type === "note") {
    const detail = getSafeNoteListDetail(item);
    return (
      <>
        <WorkbenchStatusTag code="STAGE" label={NOTE_STAGE_LABELS[detail.stage]} tone="info" />
        <WorkbenchStatusTag
          code="STATE"
          label={NOTE_STATUS_LABELS[detail.status]}
          tone={detail.status === "confirmed" ? "success" : detail.status === "pending_confirm" ? "warning" : "neutral"}
        />
      </>
    );
  }

  const detail = getMaterialDetail(item);
  return (
    <>
      <WorkbenchStatusTag code="TYPE" label={formatMaterialTypeLabel(getMaterialTypeKey(item))} />
      {detail ? (
        <WorkbenchStatusTag
          code="PREVIEW"
          label={formatMaterialPreviewStatus(detail.preview_status)}
          tone={detail.preview_status === "failed" ? "danger" : detail.preview_status === "none" ? "neutral" : "info"}
        />
      ) : null}
    </>
  );
}

function relatedKindDetail(item: WorkbenchItem) {
  if (item.type === "material") return formatMaterialTypeLabel(getMaterialTypeKey(item));
  if (item.type === "data_card") return "key-value";
  return "document";
}

function safeSummary(item: WorkbenchItem) {
  if (item.is_sensitive) return "敏感内容已隐藏。";
  const summary = item.summary.trim();
  if (summary) return summary;
  if (item.type === "data_card") return "未填写资料摘要。";
  if (item.type === "note") return "未填写笔记摘要。";
  return "未填写材料说明。";
}

function hasChildren(children: ReactNode) {
  return Children.count(children) > 0;
}

function shouldGuardNavigation(event: MouseEvent<HTMLAnchorElement>, dirty: boolean) {
  if (!dirty || event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  return true;
}
