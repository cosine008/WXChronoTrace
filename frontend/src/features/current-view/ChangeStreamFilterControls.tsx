import { Filter } from "lucide-react";

import type { ChangeStreamFilters } from "./ChangeStreamPanel";

export function FilterToggleBar(props: {
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        aria-label={props.open ? "收起变更筛选" : "展开变更筛选"}
        className="inline-flex h-7 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <Filter className="size-3.5" aria-hidden />
        {props.open ? "收起筛选" : "筛选"}
        {props.active && <span className="rounded-sm bg-muted px-1.5 py-0.5">已启用</span>}
      </button>
      {props.active && (
        <button
          type="button"
          onClick={props.onClear}
          aria-label="清除全部变更筛选条件"
          className="h-7 border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          清除全部
        </button>
      )}
    </div>
  );
}

export function ChangeStreamFilterBar(props: {
  filters: ChangeStreamFilters;
  currentUserId?: number;
  onChange: (patch: Partial<ChangeStreamFilters>) => void;
}) {
  return (
    <div className="grid gap-2 border-b border-border p-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={props.filters.status}
          onChange={(event) =>
            props.onChange({ status: event.target.value as ChangeStreamFilters["status"] })
          }
          className="h-8 border border-border bg-background px-2 text-xs"
          aria-label="批次状态"
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="submitted">待审批</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
          <option value="applied">已生效</option>
          <option value="reverted">已回滚</option>
        </select>
        <select
          value={props.filters.createdBy}
          disabled={!props.currentUserId}
          onChange={(event) =>
            props.onChange({ createdBy: event.target.value as ChangeStreamFilters["createdBy"] })
          }
          className="h-8 border border-border bg-background px-2 text-xs disabled:opacity-50"
          aria-label="创建者"
        >
          <option value="all">全部创建者</option>
          <option value="mine">我创建的</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={props.filters.createdFrom}
          onChange={(event) => props.onChange({ createdFrom: event.target.value })}
          className="h-8 border border-border bg-background px-2 text-xs"
          aria-label="创建日期起"
        />
        <input
          type="date"
          value={props.filters.createdTo}
          onChange={(event) => props.onChange({ createdTo: event.target.value })}
          className="h-8 border border-border bg-background px-2 text-xs"
          aria-label="创建日期止"
        />
      </div>
    </div>
  );
}
