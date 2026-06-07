import { RotateCcw, Search } from "lucide-react";

import type { AdminPendingChangeSetParams } from "@/api/adminChangesets";

export function ApprovalFilters(props: {
  filters: AdminPendingChangeSetParams;
  onChange: (filters: AdminPendingChangeSetParams) => void;
  onReset: () => void;
}) {
  function update(patch: Partial<AdminPendingChangeSetParams>) {
    props.onChange({ ...props.filters, ...patch });
  }

  return (
    <section className="nd-interactive-surface grid gap-3 border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Search className="size-4" aria-hidden />
          筛选审批队列
        </div>
        <button
          type="button"
          onClick={props.onReset}
          className="inline-flex h-8 items-center gap-2 border border-border px-3 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          重置
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SearchField
          label="表"
          value={props.filters.schema ?? ""}
          placeholder="表名、编码或 ID"
          onChange={(value) => update({ schema: value })}
        />
        <SearchField
          label="提交人"
          value={props.filters.creator ?? ""}
          placeholder="用户名或 ID"
          onChange={(value) => update({ creator: value })}
        />
        <SearchField
          label="审批人"
          value={props.filters.approver ?? ""}
          placeholder="用户名或 ID"
          onChange={(value) => update({ approver: value })}
        />
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">积压时长</span>
          <select
            value={props.filters.min_age_days ?? ""}
            onChange={(event) => update({ min_age_days: event.target.value })}
            className="h-10 border border-border bg-background px-3 text-sm outline-none"
          >
            <option value="">全部</option>
            <option value="1">至少 1 天</option>
            <option value="3">至少 3 天</option>
            <option value="7">至少 7 天</option>
            <option value="14">至少 14 天</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function SearchField(props: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="flex h-10 items-center gap-2 border border-border bg-background px-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </span>
    </label>
  );
}
