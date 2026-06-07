import { useState } from "react";
import { Filter } from "lucide-react";

import type { AuditLogListParams } from "@/api/audit";

export function AuditFilters(props: {
  sensitiveOnly: boolean;
  filters: AuditLogListParams;
  onChange: (filters: AuditLogListParams) => void;
}) {
  const [draft, setDraft] = useState<AuditLogListParams>(props.filters);
  const update = (key: keyof AuditLogListParams, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Filter className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-display text-sm font-semibold">筛选</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <FilterInput label="操作者" value={draft.actor ?? ""} onChange={(v) => update("actor", v)} />
        <FilterInput label="操作类型" value={draft.action ?? ""} onChange={(v) => update("action", v)} />
        <FilterInput
          label="目标类型"
          value={draft.target_type ?? ""}
          onChange={(v) => update("target_type", v)}
        />
        <FilterInput
          label="目标 ID"
          value={String(draft.target_id ?? "")}
          onChange={(v) => update("target_id", v)}
        />
        <FilterInput
          label="开始日期"
          type="date"
          value={draft.created_after ?? ""}
          onChange={(v) => update("created_after", v)}
        />
        <FilterInput
          label="结束日期"
          type="date"
          value={draft.created_before ?? ""}
          onChange={(v) => update("created_before", v)}
        />
        {!props.sensitiveOnly && (
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">敏感标记</span>
            <select
              value={String(draft.is_sensitive ?? "")}
              onChange={(event) => update("is_sensitive", event.target.value)}
              className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground"
            >
              <option value="">全部</option>
              <option value="true">仅敏感</option>
              <option value="false">非敏感</option>
            </select>
          </label>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => {
            setDraft({ page_size: 20 });
            props.onChange({ page_size: 20 });
          }}
          className="h-9 border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          重置
        </button>
        <button
          type="button"
          onClick={() => props.onChange(draft)}
          className="h-9 bg-foreground px-3 text-sm text-background"
        >
          应用
        </button>
      </div>
    </section>
  );
}

function FilterInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground"
      />
    </label>
  );
}
