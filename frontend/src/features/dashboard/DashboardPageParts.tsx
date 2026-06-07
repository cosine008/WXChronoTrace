import {
  ArrowDown,
  ArrowUp,
  Database,
  RefreshCw,
} from "lucide-react";

import type { DataSchema } from "@/api/schemas";
import { SchemaObjectRow } from "@/components/schema/SchemaObjectRow";
import {
  SCHEMA_LIST_SORT_OPTIONS,
  type SchemaListSortField,
} from "@/features/dashboard/schemaListPreferences";
import { cn } from "@/lib/utils";

export type SchemaListFilter = "all" | "managed" | "shared" | "public" | "archived";

export function Toolbar(props: {
  loading: boolean;
  visibleCount: number;
  visibleLabel: string;
  sortField: SchemaListSortField;
  sortDesc: boolean;
  onSortFieldChange: (sortField: SchemaListSortField) => void;
  onSortDirectionToggle: () => void;
  showArchived: boolean;
  onShowArchivedChange: (showArchived: boolean) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <ToolbarTitle visibleCount={props.visibleCount} visibleLabel={props.visibleLabel} />
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <SortControl
          sortField={props.sortField}
          sortDesc={props.sortDesc}
          onSortFieldChange={props.onSortFieldChange}
          onSortDirectionToggle={props.onSortDirectionToggle}
        />
        <ArchivedToggle
          showArchived={props.showArchived}
          onShowArchivedChange={props.onShowArchivedChange}
        />
        <RefreshButton loading={props.loading} onRefresh={props.onRefresh} />
      </div>
    </div>
  );
}

function ToolbarTitle({
  visibleCount,
  visibleLabel,
}: {
  visibleCount: number;
  visibleLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center border border-border text-muted-foreground">
        <Database className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-sm font-semibold">数据表清单</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          当前显示 {visibleCount} 张{visibleLabel}
        </p>
      </div>
    </div>
  );
}

function SortControl(props: {
  sortField: SchemaListSortField;
  sortDesc: boolean;
  onSortFieldChange: (sortField: SchemaListSortField) => void;
  onSortDirectionToggle: () => void;
}) {
  const directionLabel = props.sortDesc ? "降序" : "升序";
  const directionTitle = props.sortDesc ? "当前降序，点击切换为升序" : "当前升序，点击切换为降序";
  return (
    <div className="inline-flex h-8 w-full max-w-full items-center border border-border text-xs text-muted-foreground sm:w-auto">
      <span className="border-r border-border px-3">排序</span>
      <select
        aria-label="排序字段"
        value={props.sortField}
        onChange={(event) => props.onSortFieldChange(event.target.value as SchemaListSortField)}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-foreground outline-none sm:min-w-24"
      >
        {SCHEMA_LIST_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        title={directionTitle}
        onClick={props.onSortDirectionToggle}
        className="inline-flex h-full items-center gap-1 border-l border-border px-2 text-foreground hover:bg-muted"
      >
        {directionLabel}
        {props.sortDesc ? (
          <ArrowDown className="size-3.5" aria-hidden />
        ) : (
          <ArrowUp className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

function ArchivedToggle(props: {
  showArchived: boolean;
  onShowArchivedChange: (showArchived: boolean) => void;
}) {
  return (
    <label className="inline-flex h-8 items-center gap-2 border border-border px-3 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={props.showArchived}
        onChange={(event) => props.onShowArchivedChange(event.target.checked)}
      />
      显示归档表
    </label>
  );
}

function RefreshButton(props: { loading: boolean; onRefresh: () => void }) {
  return (
    <button
      type="button"
      title="刷新"
      onClick={props.onRefresh}
      className="grid size-8 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      <RefreshCw className={cn("size-4", props.loading && "animate-spin")} aria-hidden />
    </button>
  );
}

export function SchemaSummaryStrip({
  items,
  activeKey,
  onSelect,
}: {
  items: Array<{ key: SchemaListFilter; label: string; value: string; hint: string }>;
  activeKey: SchemaListFilter;
  onSelect: (key: SchemaListFilter) => void;
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-md border border-border bg-card md:grid-cols-5">
      {items.map((item) => (
        <button
          type="button"
          key={item.label}
          aria-pressed={item.key === activeKey}
          onClick={() => onSelect(item.key)}
          className={cn(
            "group relative grid gap-1 border-b border-border p-3 text-left transition-colors last:border-b-0 hover:bg-muted md:border-b-0 md:border-r md:last:border-r-0",
            item.key === activeKey && "bg-muted"
          )}
        >
          {item.key === activeKey && (
            <span
              aria-hidden
              className="absolute inset-y-3 left-0 w-0.5 bg-foreground md:inset-x-3 md:inset-y-auto md:bottom-0 md:h-0.5 md:w-auto"
            />
          )}
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-xs text-muted-foreground",
                item.key === activeKey && "text-foreground"
              )}
            >
              {item.label}
            </span>
            <span className="tabular font-mono text-xl font-semibold leading-none text-foreground">
              {item.value}
            </span>
          </div>
          <span className="truncate text-[11px] text-muted-foreground">{item.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function SchemaRow({ schema }: { schema: DataSchema }) {
  return (
    <SchemaObjectRow
      schema={{
        id: schema.id,
        name: schema.name,
        schemaCode: schema.schema_code,
        icon: schema.icon,
        temporalMode: schema.temporal_mode,
        visibility: schema.visibility,
        role: schema.role,
        isArchived: schema.is_archived,
        approvalRequired: schema.approval_required,
        fieldCount: schema.fields_config.length,
        currentVersion: schema.current_version,
        rowCount: schema.row_count,
        owner: schema.owner,
        fieldPreview: schema.fields_config,
        lastModifiedAt: schema.last_modified_at,
      }}
      recordsPath={`/schemas/${schema.id}/records`}
      settingsPath={`/schemas/${schema.id}/settings`}
    />
  );
}
