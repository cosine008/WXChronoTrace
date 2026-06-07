import { useMemo } from "react";
import {
  ArrowUpRight,
  FileDigit,
} from "lucide-react";

import type { WorkbenchDataCardItem } from "@/api/workbench";
import { EmptyState } from "@/components/feedback";
import {
  DATA_CARD_CATEGORY_LABELS,
  DATA_CARD_STATUS_LABELS,
  dataCardStatusTone,
  getDataCardDetail,
} from "@/features/workbench/dataCardMeta";
import {
  WorkbenchFilterSelect,
  WorkbenchMetaLine,
  WorkbenchRow,
  WorkbenchRowActionButton,
  WorkbenchRowActions,
  WorkbenchRowContent,
  WorkbenchTagList,
  WorkbenchTagSearch,
  WorkbenchToolbar,
} from "@/features/workbench/WorkbenchLayout";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
  WorkbenchStatusTag,
} from "@/features/workbench/WorkbenchObjectMarkers";

interface DataCardListProps {
  items: WorkbenchDataCardItem[];
  categoryFilter: string;
  statusFilter: string;
  tagQuery: string;
  onCategoryFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onTagQueryChange: (value: string) => void;
  onOpen: (item: WorkbenchDataCardItem) => void;
  onCreate: () => void;
}

export function DataCardList(props: DataCardListProps) {
  const filteredItems = useMemo(
    () =>
      props.items
        .filter((item) => matchesFilters(item, props.categoryFilter, props.statusFilter, props.tagQuery))
        .sort(sortDataCards),
    [props.items, props.categoryFilter, props.statusFilter, props.tagQuery]
  );

  const categoryOptions = useMemo(
    () => {
      const categories = props.items.flatMap((item) => {
        const detail = getDataCardDetail(item);
        return detail ? [detail.category] : [];
      });
      return [...new Set(categories)].map((value) => ({
        value,
        label: DATA_CARD_CATEGORY_LABELS[value],
      }));
    },
    [props.items]
  );

  if (props.items.length === 0) {
    return (
      <EmptyState
        minH="min-h-56"
        title="还没有资料卡"
        description="可从这里维护政策摘录、联系人、财务口径和常用模板文本。"
        action={
          <button
            type="button"
            onClick={props.onCreate}
            className="inline-flex h-10 items-center border border-foreground bg-foreground px-4 text-sm text-background"
          >
            新建资料卡
          </button>
        }
      />
    );
  }

  return (
    <div className="grid gap-0">
      <WorkbenchToolbar className="lg:grid-cols-[repeat(3,minmax(0,1fr))_220px]">
        <WorkbenchFilterSelect
          label="分类筛选"
          value={props.categoryFilter}
          onChange={props.onCategoryFilterChange}
          options={[{ value: "", label: "全部分类" }, ...categoryOptions]}
        />
        <WorkbenchFilterSelect
          label="状态筛选"
          value={props.statusFilter}
          onChange={props.onStatusFilterChange}
          options={[
            { value: "", label: "全部状态" },
            ...Object.entries(DATA_CARD_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <WorkbenchTagSearch
          label="标签搜索"
          value={props.tagQuery}
          onChange={props.onTagQueryChange}
          placeholder="输入标签关键字"
        />
        <div className="grid min-w-0 content-end gap-2 self-end">
          <button
            type="button"
            onClick={props.onCreate}
            className="inline-flex h-10 w-full items-center justify-center border border-foreground bg-foreground px-4 text-sm text-background"
            aria-label="新建资料卡"
          >
            新建资料卡
          </button>
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>共 {props.items.length} 项，当前显示 {filteredItems.length} 项</span>
            <span>置顶资料优先显示</span>
          </div>
        </div>
      </WorkbenchToolbar>

      {filteredItems.length === 0 ? (
        <EmptyState
          minH="min-h-48"
          title="没有符合筛选条件的资料卡"
          description="可调整分类、状态或标签关键字。"
        />
      ) : (
        <div className="divide-y divide-border">
          {filteredItems.map((item) => (
            <DataCardRow key={item.id} item={item} onOpen={props.onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function DataCardRow(props: { item: WorkbenchDataCardItem; onOpen: (item: WorkbenchDataCardItem) => void }) {
  const detail = getDataCardDetail(props.item);
  const previewFields = !props.item.is_sensitive ? detail?.fields.slice(0, 2) ?? [] : [];

  return (
    <WorkbenchRow>
      <WorkbenchRowContent>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type="data_card" />
            {detail && (
              <WorkbenchStatusTag
                code="CAT"
                label={DATA_CARD_CATEGORY_LABELS[detail.category]}
                tone="info"
              />
            )}
            {detail && (
              <WorkbenchStatusTag
                code="STATE"
                label={DATA_CARD_STATUS_LABELS[detail.status]}
                tone={dataCardStatusTone(detail.status)}
              />
            )}
          </div>
          <WorkbenchSignalRail
            pinned={props.item.is_pinned}
            sensitive={props.item.is_sensitive}
          />
        </div>

        <div className="grid gap-1">
          <div className="truncate text-sm font-semibold text-foreground">{props.item.title}</div>
          <p className="text-sm text-muted-foreground">{safeSummary(props.item.summary)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <WorkbenchTagList tags={props.item.tags} />
        </div>

        {props.item.is_sensitive ? (
          <div className="text-xs text-muted-foreground">字段预览已隐藏，详情抽屉中可查看。</div>
        ) : previewFields.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {previewFields.map((field) => (
              <div
                key={`${field.name}-${field.sort_order}`}
                className="grid min-w-0 grid-cols-[minmax(4.5rem,0.42fr)_minmax(0,1fr)] overflow-hidden border border-border bg-background"
              >
                <div className="border-r border-border px-2 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {field.name}
                </div>
                <div className="min-w-0 px-3 py-2">
                  <div className="line-clamp-1 text-sm text-foreground">{formatFieldValue(field)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <FileDigit className="size-4" aria-hidden />
            暂无字段预览
          </div>
        )}

        <WorkbenchMetaLine>
          <span>更新于 {formatDateTime(props.item.updated_at)}</span>
          {detail?.applicable_year && <span>适用年份 {detail.applicable_year}</span>}
          {detail?.applicable_region && <span>适用地区 {detail.applicable_region}</span>}
        </WorkbenchMetaLine>
      </WorkbenchRowContent>

      <WorkbenchRowActions className="sm:w-[132px]">
        <WorkbenchRowActionButton
          label="查看详情"
          icon={<ArrowUpRight className="size-4" aria-hidden />}
          onClick={() => props.onOpen(props.item)}
        />
      </WorkbenchRowActions>
    </WorkbenchRow>
  );
}

function matchesFilters(item: WorkbenchDataCardItem, category: string, status: string, tagQuery: string) {
  const detail = getDataCardDetail(item);
  const normalizedTag = tagQuery.trim().toLowerCase();
  if (category && detail?.category !== category) return false;
  if (status && detail?.status !== status) return false;
  if (normalizedTag && !item.tags.some((tag) => tag.toLowerCase().includes(normalizedTag))) return false;
  return true;
}

function sortDataCards(left: WorkbenchDataCardItem, right: WorkbenchDataCardItem) {
  if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1;
  return toTimestamp(right.updated_at) - toTimestamp(left.updated_at);
}

function formatFieldValue(field: { value: string; unit: string }) {
  return field.unit ? `${field.value} ${field.unit}` : field.value || "未填写";
}
function safeSummary(summary: string) { return summary.trim() || "未填写摘要"; }

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

function toTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
