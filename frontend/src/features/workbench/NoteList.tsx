import { useMemo } from "react";

import type { WorkbenchNoteListItem } from "@/api/workbench";
import { EmptyState } from "@/components/feedback";
import { NoteListRow } from "@/features/workbench/NoteListRow";
import {
  WorkbenchFilterSelect,
  WorkbenchTagSearch,
  WorkbenchToolbar,
} from "@/features/workbench/WorkbenchLayout";
import {
  NOTE_STAGE_LABELS,
  NOTE_STATUS_LABELS,
  formatLinkedSchemaLabel,
  getSafeNoteListDetail,
} from "@/features/workbench/noteMeta";

interface NoteListProps {
  items: WorkbenchNoteListItem[];
  stageFilter: string;
  statusFilter: string;
  linkedSchemaFilter: string;
  tagQuery: string;
  onStageFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onLinkedSchemaFilterChange: (value: string) => void;
  onTagQueryChange: (value: string) => void;
  onOpen: (item: WorkbenchNoteListItem) => void;
  onCreate: () => void;
}

export function NoteList(props: NoteListProps) {
  const filteredItems = useMemo(
    () =>
      props.items
        .filter((item) =>
          matchesFilters(
            item,
            props.stageFilter,
            props.statusFilter,
            props.linkedSchemaFilter,
            props.tagQuery
          )
        )
        .sort(sortNotes),
    [
      props.items,
      props.stageFilter,
      props.statusFilter,
      props.linkedSchemaFilter,
      props.tagQuery,
    ]
  );

  const linkedSchemaOptions = useMemo(() => {
    const options = new Map<number, { value: string; label: string }>();
    props.items.forEach((item) => {
      item.links.forEach((link) => {
        if (!link.target_schema || options.has(link.target_schema.id)) return;
        options.set(link.target_schema.id, {
          value: String(link.target_schema.id),
          label: formatLinkedSchemaLabel(link.target_schema),
        });
      });
    });
    const values = [...options.values()].sort((left, right) => Number(left.value) - Number(right.value));
    if (
      props.linkedSchemaFilter &&
      !values.some((option) => option.value === props.linkedSchemaFilter)
    ) {
      return [
        {
          value: props.linkedSchemaFilter,
          label: `schema #${props.linkedSchemaFilter}`,
        },
        ...values,
      ];
    }
    return values;
  }, [props.items, props.linkedSchemaFilter]);

  if (props.items.length === 0) {
    return (
      <EmptyState
        minH="min-h-56"
        title="还没有工作台笔记"
        description="可以先记录流程判断、导入备注和待确认事项，后续再在详情中整理 Markdown。"
        action={
          <button
            type="button"
            onClick={props.onCreate}
            className="inline-flex h-10 items-center border border-foreground bg-foreground px-4 text-sm text-background"
          >
            新建笔记
          </button>
        }
      />
    );
  }

  return (
    <div className="grid gap-0">
      <WorkbenchToolbar className="lg:grid-cols-[repeat(4,minmax(0,1fr))_220px]">
        <WorkbenchFilterSelect
          label="阶段筛选"
          value={props.stageFilter}
          onChange={props.onStageFilterChange}
          options={[
            { value: "", label: "全部阶段" },
            ...Object.entries(NOTE_STAGE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <WorkbenchFilterSelect
          label="状态筛选"
          value={props.statusFilter}
          onChange={props.onStatusFilterChange}
          options={[
            { value: "", label: "全部状态" },
            ...Object.entries(NOTE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <WorkbenchFilterSelect
          label="关联 Schema"
          value={props.linkedSchemaFilter}
          onChange={props.onLinkedSchemaFilterChange}
          options={[{ value: "", label: "全部 Schema" }, ...linkedSchemaOptions]}
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
            aria-label="新建笔记"
          >
            新建笔记
          </button>
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>共 {props.items.length} 条，当前显示 {filteredItems.length} 条</span>
            <span>置顶笔记优先显示</span>
          </div>
        </div>
      </WorkbenchToolbar>

      {filteredItems.length === 0 ? (
        <EmptyState
          minH="min-h-48"
          title="没有符合筛选条件的笔记"
          description="可以调整阶段、状态、标签或关联 Schema 过滤条件。"
        />
      ) : (
        <div className="divide-y divide-border">
          {filteredItems.map((item) => (
            <NoteListRow key={item.id} item={item} onOpen={props.onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function matchesFilters(
  item: WorkbenchNoteListItem,
  stage: string,
  status: string,
  linkedSchemaId: string,
  tagQuery: string
) {
  const detail = getSafeNoteListDetail(item);
  const normalizedTag = tagQuery.trim().toLowerCase();

  if (stage && detail.stage !== stage) return false;
  if (status && detail.status !== status) return false;
  if (
    linkedSchemaId &&
    !item.links.some((link) => String(link.target_schema?.id ?? "") === linkedSchemaId)
  ) {
    return false;
  }
  if (normalizedTag && !item.tags.some((tag) => tag.toLowerCase().includes(normalizedTag))) {
    return false;
  }
  return true;
}

function sortNotes(left: WorkbenchNoteListItem, right: WorkbenchNoteListItem) {
  if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1;
  return toTimestamp(right.updated_at) - toTimestamp(left.updated_at);
}

function toTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
