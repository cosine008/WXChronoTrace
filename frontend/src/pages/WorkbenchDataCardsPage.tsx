import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Copy, Loader2, PencilLine, Pin, Plus, ShieldAlert, Trash2 } from "lucide-react";

import {
  copyDataCardText,
  deleteWorkbenchItem,
  type WorkbenchDataCardDetail,
  type WorkbenchDataCardField,
  type WorkbenchDataCardItem,
} from "@/api/workbench";
import { ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { CurrentViewDrawer } from "@/features/current-view/CurrentViewDrawer";
import { DataCardEditor } from "@/features/workbench/DataCardEditor";
import { DataCardList } from "@/features/workbench/DataCardList";
import { RelationPanel } from "@/features/workbench/RelationPanel";
import { WorkbenchChrome, WorkbenchSection } from "@/features/workbench/WorkbenchChrome";
import { useWorkbenchDataCardsQuery, workbenchKeys } from "@/features/workbench/useWorkbenchQueries";

export function WorkbenchDataCardsPage() {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const query = useWorkbenchDataCardsQuery();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [detailItem, setDetailItem] = useState<WorkbenchDataCardItem | null>(null);
  const [editorItem, setEditorItem] = useState<WorkbenchDataCardItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const items = query.data?.results ?? [];
  const pinnedCount = items.filter((item) => item.is_pinned).length;
  const isDeletingCurrent = detailItem !== null && deletingItemId === detailItem.id;

  const copyCardMutation = useMutation({
    mutationFn: (item: WorkbenchDataCardItem) => copyDataCardText(item.id),
    onSuccess: async (response, item) => {
      if (!(await writeClipboardText(response.text))) {
        notify.error({ title: "复制失败", message: "当前环境无法访问剪贴板。" });
        return;
      }
      notify.success({ title: "整卡内容已复制", message: item.title });
    },
    onError: () => {
      notify.error({ title: "复制失败", message: "未能生成资料卡复制文本。" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: WorkbenchDataCardItem) => deleteWorkbenchItem(item.id),
    onMutate: (item) => {
      setDeletingItemId(item.id);
    },
    onSuccess: async (_, item) => {
      notify.success({ title: "资料卡已移入回收站", message: item.title });
      setDetailItem((current) => (current?.id === item.id ? null : current));
      await invalidateWorkbenchQueries(queryClient, true);
    },
    onError: () => {
      notify.error({ title: "删除失败", message: "资料卡未能移入回收站。" });
    },
    onSettled: () => {
      setDeletingItemId(null);
    },
  });

  function openCreate() {
    setEditorItem(null);
    setEditorOpen(true);
  }

  function openEdit(item: WorkbenchDataCardItem) {
    if (deletingItemId === item.id) return;
    setDetailItem(null);
    setEditorItem(item);
    setEditorOpen(true);
  }

  async function handleSaved(item: WorkbenchDataCardItem) {
    setEditorOpen(false);
    setEditorItem(item);
    setDetailItem(item);
    await invalidateWorkbenchQueries(queryClient, false);
  }

  async function handleDelete(item: WorkbenchDataCardItem) {
    if (deletingItemId === item.id) return;
    const confirmed = await notify.confirm({
      title: "确认删除资料卡",
      description: `“${item.title}”会被移入回收站，不会立即永久删除。`,
      impactSummary: [
        "资料卡会从当前列表移除",
        "可在回收站恢复",
        "关联信息会保留在回收站记录中",
      ],
      confirmLabel: "移入回收站",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) deleteMutation.mutate(item);
  }

  async function handleCopyField(field: WorkbenchDataCardField) {
    if (!(await writeClipboardText(field.value))) {
      notify.error({ title: "复制失败", message: "当前环境无法访问剪贴板。" });
      return;
    }
    notify.success({ title: "字段值已复制", message: field.name });
  }

  return (
    <WorkbenchChrome
      title="我的资料"
      subtitle="资料卡与个人高频信息"
      meta={
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          共 {items.length} 项 / 置顶 {pinnedCount} 项
        </span>
      }
      action={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background"
          aria-label="新建资料卡"
        >
          <Plus className="size-4" aria-hidden />
          新建资料卡
        </button>
      }
    >
      <WorkbenchSection index="01" title="资料卡工作区" subtitle="DATA CARDS">
        {query.isLoading ? (
          <LoadingState minH="min-h-56" label="加载资料卡列表" />
        ) : query.isError ? (
          <ErrorState
            title="资料卡列表加载失败"
            error={query.error}
            onRetry={() => query.refetch()}
            minH="min-h-56"
          />
        ) : (
          <DataCardList
            items={items}
            categoryFilter={categoryFilter}
            statusFilter={statusFilter}
            tagQuery={tagQuery}
            onCategoryFilterChange={setCategoryFilter}
            onStatusFilterChange={setStatusFilter}
            onTagQueryChange={setTagQuery}
            onOpen={setDetailItem}
            onCreate={openCreate}
          />
        )}
      </WorkbenchSection>

      <CurrentViewDrawer
        open={Boolean(detailItem)}
        title={detailItem?.title ?? "资料卡详情"}
        description={
          detailItem?.is_sensitive
            ? "敏感资料卡，列表页已隐藏字段预览。"
            : detailItem?.summary || "未填写摘要"
        }
        meta={detailItem ? `#${detailItem.id}` : undefined}
        actions={
          detailItem ? (
            <>
              <DrawerActionButton
                label="复制整卡"
                icon={<Copy className="size-4" aria-hidden />}
                loading={copyCardMutation.isPending}
                disabled={isDeletingCurrent}
                onClick={() => copyCardMutation.mutate(detailItem)}
              />
              <DrawerActionButton
                label="编辑"
                icon={<PencilLine className="size-4" aria-hidden />}
                disabled={isDeletingCurrent}
                onClick={() => openEdit(detailItem)}
              />
              <DrawerActionButton
                label="删除"
                tone="destructive"
                loading={isDeletingCurrent}
                disabled={isDeletingCurrent}
                icon={<Trash2 className="size-4" aria-hidden />}
                onClick={() => void handleDelete(detailItem)}
              />
            </>
          ) : null
        }
        onRequestClose={() => setDetailItem(null)}
      >
        {detailItem && <DataCardDetailView item={detailItem} onCopyField={handleCopyField} />}
      </CurrentViewDrawer>

      <CurrentViewDrawer
        open={editorOpen}
        title={editorItem ? "编辑资料卡" : "新建资料卡"}
        description="维护标题、范围、状态与字段内容。"
        size="lg"
        onRequestClose={() => setEditorOpen(false)}
      >
        <DataCardEditor
          key={editorItem?.id ?? "new"}
          item={editorItem}
          onCancel={() => setEditorOpen(false)}
          onSaved={(item) => void handleSaved(item)}
        />
      </CurrentViewDrawer>
    </WorkbenchChrome>
  );
}

function DataCardDetailView(props: {
  item: WorkbenchDataCardItem;
  onCopyField: (field: WorkbenchDataCardField) => void;
}) {
  const detail = getDetail(props.item);

  return (
    <div className="grid min-w-0 gap-5">
      <section className="grid min-w-0 gap-3 border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          {props.item.is_pinned && <InfoBadge icon={Pin} label="置顶资料" />}
          {props.item.is_sensitive && (
            <InfoBadge icon={ShieldAlert} label="敏感资料" emphasis />
          )}
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <MetaBlock label="摘要" value={props.item.summary || "未填写摘要"} />
          <MetaBlock
            label="标签"
            value={
              props.item.tags.length > 0
                ? props.item.tags.map((tag) => `#${tag}`).join(" ")
                : "暂无标签"
            }
          />
          <MetaBlock label="分类" value={detail ? formatCategory(detail.category) : "未填写"} />
          <MetaBlock label="状态" value={detail ? formatStatus(detail.status) : "未填写"} />
          <MetaBlock
            label="适用年份"
            value={detail?.applicable_year ? String(detail.applicable_year) : "不限"}
          />
          <MetaBlock label="适用地区" value={detail?.applicable_region || "不限"} />
          <MetaBlock label="适用对象" value={detail?.applicable_subject || "不限"} />
          <MetaBlock label="生效区间" value={formatRange(detail)} />
          <MetaBlock label="更新时间" value={formatDateTime(props.item.updated_at)} />
          <MetaBlock label="备注" value={detail?.remark || "无备注"} />
        </div>
      </section>

      <section className="grid min-w-0 gap-3 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">字段内容</h3>
        {detail && detail.fields.length > 0 ? (
          <div className="min-w-0 divide-y divide-border border border-border">
            {detail.fields.map((field) => (
              <div
                key={field.id}
                className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-4"
              >
                <div className="min-w-0 grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{field.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {field.value_type}
                    </span>
                    {field.unit && (
                      <span className="text-xs text-muted-foreground">单位 {field.unit}</span>
                    )}
                  </div>
                  <div className="break-all text-sm text-foreground">
                    {formatFieldValue(field)}
                  </div>
                  {field.remark && (
                    <div className="text-xs text-muted-foreground">{field.remark}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void props.onCopyField(field)}
                  className="inline-flex h-8 items-center justify-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                  aria-label={`复制字段 ${field.name}`}
                >
                  <Copy className="size-3.5" aria-hidden />
                  复制
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">当前没有结构化字段。</div>
        )}
      </section>

      <section className="grid min-w-0 gap-3 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">关联信息</h3>
        <RelationPanel links={props.item.links} />
      </section>
    </div>
  );
}

function DrawerActionButton(props: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "default" | "destructive";
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        "inline-flex h-8 items-center gap-1 border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60",
        props.tone === "destructive"
          ? "border-[var(--color-status-error)] text-[var(--color-status-error)]"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
      ].join(" ")}
      aria-label={props.label}
    >
      {props.loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : props.icon}
      {props.label}
    </button>
  );
}

function InfoBadge(props: { icon: typeof Pin; label: string; emphasis?: boolean }) {
  const Icon = props.icon;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 border px-2 py-1 text-xs",
        props.emphasis ? "border-foreground text-foreground" : "border-border text-muted-foreground",
      ].join(" ")}
    >
      <Icon className="size-3.5" aria-hidden />
      {props.label}
    </span>
  );
}

function MetaBlock(props: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 border border-border px-3 py-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="break-words text-sm text-foreground">{props.value}</div>
    </div>
  );
}

function getDetail(item: WorkbenchDataCardItem): WorkbenchDataCardDetail | null {
  return isDataCardDetail(item.detail) ? item.detail : null;
}

function formatFieldValue(field: { value: string; unit: string }) {
  return field.unit ? `${field.value} ${field.unit}` : field.value || "未填写";
}

function formatCategory(category: WorkbenchDataCardDetail["category"]) {
  return {
    organization: "机构",
    people: "人员",
    social_security: "社保",
    finance: "财务",
    policy: "政策",
    import_template: "导入模板",
    common_text: "常用文本",
    other: "其他",
  }[category];
}

function formatStatus(status: WorkbenchDataCardDetail["status"]) {
  return {
    draft: "草稿",
    pending_confirm: "待确认",
    confirmed: "已确认",
    expired: "已失效",
  }[status];
}

function formatRange(detail: WorkbenchDataCardDetail | null) {
  if (!detail) return "未填写";
  return `${detail.effective_from || "不限"} 至 ${detail.effective_to || "不限"}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function invalidateWorkbenchQueries(queryClient: QueryClient, includeTrash: boolean) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: workbenchKeys.dataCards() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.items() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.overview() }),
  ];
  if (includeTrash) {
    tasks.push(queryClient.invalidateQueries({ queryKey: workbenchKeys.trash() }));
  }
  await Promise.all(tasks);
}

async function writeClipboardText(value: string) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function isDataCardDetail(
  detail: WorkbenchDataCardItem["detail"]
): detail is WorkbenchDataCardDetail {
  return "fields" in detail && Array.isArray(detail.fields);
}
