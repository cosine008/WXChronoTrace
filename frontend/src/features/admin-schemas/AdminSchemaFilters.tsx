import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import type { AdminSchemaLedgerParams } from "@/api/adminSchemas";

export function AdminSchemaFilters(props: {
  filters: AdminSchemaLedgerParams;
  onChange: (filters: AdminSchemaLedgerParams) => void;
  onReset: () => void;
}) {
  function update(patch: Partial<AdminSchemaLedgerParams>) {
    props.onChange({ ...props.filters, ...patch });
  }

  return (
    <section className="nd-interactive-surface grid gap-3 border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="size-4" aria-hidden />
          筛选表资产
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="grid gap-1 xl:col-span-2">
          <span className="text-xs text-muted-foreground">Owner</span>
          <span className="flex h-10 items-center gap-2 border border-border bg-background px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              value={props.filters.owner ?? ""}
              onChange={(event) => update({ owner: event.target.value })}
              placeholder="用户名或 ID"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </span>
        </label>
        <SelectField
          label="可见性"
          value={props.filters.visibility ?? ""}
          onChange={(value) =>
            update({ visibility: value as AdminSchemaLedgerParams["visibility"] })
          }
          options={[
            ["", "全部"],
            ["private", "私有"],
            ["shared", "共享"],
            ["public", "公共"],
          ]}
        />
        <SelectField
          label="归档"
          value={props.filters.archived ?? "false"}
          onChange={(value) => update({ archived: value as AdminSchemaLedgerParams["archived"] })}
          options={[
            ["false", "仅活跃"],
            ["all", "全部"],
            ["true", "仅归档"],
          ]}
        />
        <SelectField
          label="审批"
          value={props.filters.approval_required ?? ""}
          onChange={(value) =>
            update({
              approval_required: value as AdminSchemaLedgerParams["approval_required"],
            })
          }
          options={[
            ["", "全部"],
            ["true", "需审批"],
            ["false", "无需审批"],
          ]}
        />
        <DateField
          label="变更起始"
          value={props.filters.changed_after ?? ""}
          onChange={(value) => update({ changed_after: value })}
        />
        <DateField
          label="变更截止"
          value={props.filters.changed_before ?? ""}
          onChange={(value) => update({ changed_before: value })}
        />
      </div>
    </section>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 text-sm outline-none"
      >
        {props.options.map(([value, label]) => (
          <option key={value || "all"} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type="date"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 text-sm outline-none"
      />
    </label>
  );
}
