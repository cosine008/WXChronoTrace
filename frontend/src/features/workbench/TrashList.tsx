import { useMemo } from "react";
import {
  Database,
  NotebookPen,
  Paperclip,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import type { WorkbenchItem, WorkbenchItemType } from "@/api/workbench";
import { EmptyState } from "@/components/feedback";
import { formatWorkbenchDateTime } from "@/features/workbench/noteMeta";
import {
  WorkbenchFilterSelect,
  WorkbenchInlineMeta,
  WorkbenchMetaLine,
  WorkbenchRow,
  WorkbenchRowActionButton,
  WorkbenchRowActions,
  WorkbenchRowContent,
  WorkbenchTagList,
  WorkbenchTagSearch,
  WorkbenchToolbar,
} from "@/features/workbench/WorkbenchLayout";

const ITEM_TYPE_LABELS: Record<WorkbenchItemType, string> = {
  data_card: "资料卡",
  note: "笔记",
  material: "材料",
};

interface TrashListProps {
  items: WorkbenchItem[];
  typeFilter: string;
  tagQuery: string;
  restoringIds: ReadonlySet<number>;
  purgingIds: ReadonlySet<number>;
  confirmingPurgeIds: ReadonlySet<number>;
  onTypeFilterChange: (value: string) => void;
  onTagQueryChange: (value: string) => void;
  onRestore: (item: WorkbenchItem) => void;
  onPurge: (item: WorkbenchItem) => void;
}

export function TrashList(props: TrashListProps) {
  const filteredItems = useMemo(
    () =>
      props.items
        .filter((item) => matchesFilters(item, props.typeFilter, props.tagQuery))
        .sort(sortTrashItems),
    [props.items, props.typeFilter, props.tagQuery]
  );

  if (props.items.length === 0) {
    return (
      <EmptyState
        minH="min-h-56"
        title="回收站为空"
        description="删除后的资料卡、笔记和材料会显示在这里，可选择恢复或永久删除。"
      />
    );
  }

  return (
    <div className="grid gap-0">
      <WorkbenchToolbar
        className="md:grid-cols-[180px_minmax(0,1fr)_220px]"
        summary={
          <>
            <span>共 {props.items.length} 条，当前显示 {filteredItems.length} 条</span>
            <span>永久删除后不可恢复</span>
          </>
        }
      >
        <WorkbenchFilterSelect
          label="类型筛选"
          value={props.typeFilter}
          onChange={props.onTypeFilterChange}
          options={[
            { value: "", label: "全部类型" },
            ...Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <WorkbenchTagSearch
          label="标签关键词"
          value={props.tagQuery}
          onChange={props.onTagQueryChange}
          placeholder="输入标签关键词"
        />
      </WorkbenchToolbar>

      {filteredItems.length === 0 ? (
        <EmptyState
          minH="min-h-48"
          title="没有符合筛选条件的记录"
          description="可调整类型筛选或标签关键词后重试。"
        />
      ) : (
        <div className="divide-y divide-border">
          {filteredItems.map((item) => (
            <TrashRow
              key={item.id}
              item={item}
              restoring={props.restoringIds.has(item.id)}
              purging={props.purgingIds.has(item.id)}
              confirmingPurge={props.confirmingPurgeIds.has(item.id)}
              onRestore={props.onRestore}
              onPurge={props.onPurge}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrashRow(props: {
  item: WorkbenchItem;
  restoring: boolean;
  purging: boolean;
  confirmingPurge: boolean;
  onRestore: (item: WorkbenchItem) => void;
  onPurge: (item: WorkbenchItem) => void;
}) {
  const busy = props.restoring || props.purging || props.confirmingPurge;

  return (
    <WorkbenchRow>
      <WorkbenchRowContent>
        <div className="flex flex-wrap items-center gap-2">
          <WorkbenchInlineMeta>
            <TypeIcon type={props.item.type} />
            {ITEM_TYPE_LABELS[props.item.type]}
          </WorkbenchInlineMeta>
          {props.item.is_sensitive && (
            <WorkbenchInlineMeta emphasis>
              <ShieldAlert className="size-3.5" aria-hidden />
              敏感
            </WorkbenchInlineMeta>
          )}
        </div>

        <div className="grid gap-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {getTrashItemDisplayTitle(props.item)}
          </div>
          <p className="text-sm text-muted-foreground">
            {props.item.is_sensitive ? "敏感内容已隐藏" : safeSummary(props.item.summary)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <WorkbenchTagList tags={props.item.tags} />
        </div>

        <WorkbenchMetaLine>
          <span>删除时间 {formatDeletedAt(props.item.deleted_at)}</span>
          <span>更新时间 {formatWorkbenchDateTime(props.item.updated_at)}</span>
        </WorkbenchMetaLine>
      </WorkbenchRowContent>

      <WorkbenchRowActions className="sm:w-[260px]">
        <WorkbenchRowActionButton
          label="恢复"
          loading={props.restoring}
          disabled={busy}
          icon={<RotateCcw className="size-4" aria-hidden />}
          onClick={() => props.onRestore(props.item)}
        />
        <WorkbenchRowActionButton
          label="永久删除"
          tone="destructive"
          loading={props.purging}
          disabled={busy}
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={() => props.onPurge(props.item)}
        />
      </WorkbenchRowActions>
    </WorkbenchRow>
  );
}

function TypeIcon(props: { type: WorkbenchItemType }) {
  if (props.type === "data_card") return <Database className="size-3.5" aria-hidden />;
  if (props.type === "note") return <NotebookPen className="size-3.5" aria-hidden />;
  return <Paperclip className="size-3.5" aria-hidden />;
}

function matchesFilters(item: WorkbenchItem, typeFilter: string, tagQuery: string) {
  const normalizedTag = tagQuery.trim().toLowerCase();
  if (typeFilter && item.type !== typeFilter) return false;
  if (normalizedTag && !item.tags.some((tag) => tag.toLowerCase().includes(normalizedTag))) {
    return false;
  }
  return true;
}

function sortTrashItems(left: WorkbenchItem, right: WorkbenchItem) {
  return toTimestamp(right.deleted_at) - toTimestamp(left.deleted_at);
}

function safeSummary(summary: string) {
  return summary.trim() || "未填写摘要";
}

function formatDeletedAt(value: string | null) {
  if (!value) return "未知";
  return formatWorkbenchDateTime(value);
}

function toTimestamp(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getTrashItemDisplayTitle(item: Pick<WorkbenchItem, "id" | "type" | "title" | "is_sensitive">) {
  if (item.type === "material" && item.is_sensitive) return `敏感材料 #${item.id}`;
  return item.title;
}
