import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import type {
  AdminExportEventParams,
  AdminExportJobParams,
  AdminExportTab,
} from "@/api/adminExports";

type FilterDraft = AdminExportJobParams | AdminExportEventParams;

interface Props {
  tab: AdminExportTab;
  filters: FilterDraft;
  onChange: (filters: FilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
}

export function AdminExportFilters(props: Props) {
  const isJobs = props.tab === "jobs";
  const jobFilters = props.filters as AdminExportJobParams;
  const eventFilters = props.filters as AdminExportEventParams;

  function update(patch: Partial<FilterDraft>) {
    props.onChange({ ...props.filters, ...patch });
  }

  return (
    <section className="nd-interactive-surface grid gap-4 border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="size-4" aria-hidden />
          导出筛选
        </div>
        <div className="flex items-center gap-2">
          <ActionButton onClick={props.onReset} icon={<RotateCcw className="size-3.5" aria-hidden />}>
            重置
          </ActionButton>
          <ActionButton onClick={props.onApply}>应用筛选</ActionButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <DateField
          label="创建起始"
          value={props.filters.created_after ?? ""}
          onChange={(value) => update({ created_after: value })}
        />
        <DateField
          label="创建截止"
          value={props.filters.created_before ?? ""}
          onChange={(value) => update({ created_before: value })}
        />
        <SearchField
          label="用户"
          placeholder={isJobs ? "用户名 / ID" : "操作人 / ID"}
          value={isJobs ? jobFilters.owner ?? "" : eventFilters.actor ?? ""}
          onChange={(value) => update(isJobs ? { owner: value } : { actor: value })}
        />
        <SearchField
          label="表"
          placeholder="schema_id / 名称 / code"
          value={props.filters.schema ?? ""}
          onChange={(value) => update({ schema: value })}
        />
        <SelectField
          label="格式"
          value={props.filters.format ?? ""}
          onChange={(value) => update({ format: value as AdminExportJobParams["format"] })}
          options={[
            ["", "全部"],
            ["csv", "CSV"],
            ["xlsx", "XLSX"],
          ]}
        />
        <SelectField
          label="风险"
          value={props.filters.risk ?? ""}
          onChange={(value) => update({ risk: value as AdminExportJobParams["risk"] })}
          options={[
            ["", "全部"],
            ["large_export", "大批量"],
            ["sensitive_fields", "敏感字段"],
          ]}
        />

        {isJobs ? (
          <>
            <SelectField
              label="状态"
              value={jobFilters.status ?? ""}
              onChange={(value) => update({ status: value as AdminExportJobParams["status"] })}
              options={[
                ["", "全部"],
                ["queued", "排队中"],
                ["running", "执行中"],
                ["completed", "已完成"],
                ["failed", "失败"],
                ["expired", "已过期"],
                ["canceled", "已取消"],
              ]}
            />
            <SelectField
              label="文件"
              value={jobFilters.has_file ?? ""}
              onChange={(value) => update({ has_file: value as AdminExportJobParams["has_file"] })}
              options={[
                ["", "全部"],
                ["true", "有文件"],
                ["false", "无文件"],
              ]}
            />
            <DateField
              label="完成起始"
              value={jobFilters.finished_after ?? ""}
              onChange={(value) => update({ finished_after: value })}
            />
            <DateField
              label="完成截止"
              value={jobFilters.finished_before ?? ""}
              onChange={(value) => update({ finished_before: value })}
            />
            <DateField
              label="过期前"
              value={jobFilters.expires_before ?? ""}
              onChange={(value) => update({ expires_before: value })}
            />
          </>
        ) : (
          <>
            <SelectField
              label="来源"
              value={eventFilters.source ?? ""}
              onChange={(value) => update({ source: value as AdminExportEventParams["source"] })}
              options={[
                ["", "全部"],
                ["export_job", "任务导出"],
                ["sync_export", "同步导出"],
                ["unknown", "未知来源"],
              ]}
            />
            <SearchField
              label="目标类型"
              placeholder="current_view / schema"
              value={eventFilters.target_type ?? ""}
              onChange={(value) => update({ target_type: value })}
            />
            <SearchField
              label="任务号"
              placeholder="EXP-..."
              value={eventFilters.job_code ?? ""}
              onChange={(value) => update({ job_code: value })}
            />
            <NumberField
              label="最少行数"
              value={eventFilters.min_rows ?? ""}
              onChange={(value) => update({ min_rows: value })}
            />
          </>
        )}
      </div>
    </section>
  );
}

function ActionButton(props: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex h-8 items-center gap-2 border border-border px-3 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function SearchField(props: {
  label: string;
  placeholder: string;
  value: string;
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

function NumberField(props: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type="number"
        min="0"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="1000"
        className="h-10 border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
