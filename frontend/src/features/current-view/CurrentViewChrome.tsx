import { useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import {
  Columns3,
  Eye,
  EyeOff,
  RotateCcw,
  Search,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { CurrentViewFilter, FieldConfig, SchemaRole } from "@/api/schemas";
import { cn } from "@/lib/utils";
import {
  GRID_DENSITY_OPTIONS,
  type GridDensity,
} from "./currentGridDensity";
import { fieldByKey } from "./currentViewUtils";
import { CurrentViewFilters } from "./CurrentViewFilters";

const PAGE_SIZE_OPTIONS = [50, 100, 200];

export function LinkButton({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      <Settings className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

export function ActionButton(
  props: {
    icon: LucideIcon;
    label: string;
    active?: boolean;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">
) {
  const { icon: Icon, label, active = false, className, type = "button", ...buttonProps } = props;

  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-9 items-center gap-2 border px-3 text-sm transition-colors",
        active
          ? "border-foreground bg-muted text-foreground"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
        className
      )}
      {...buttonProps}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

export function Toolbar(props: {
  retro: boolean;
  searchInput: string;
  pageSize: number;
  density: GridDensity;
  fields: FieldConfig[];
  filters: CurrentViewFilter[];
  schemaRole: SchemaRole | null;
  identityFieldKey: string;
  hiddenFields: Record<string, boolean>;
  batchScope?: { id: number; summary?: string };
  onRetroChange: (value: boolean) => void;
  onSearchInputChange: (value: string) => void;
  onSearchSubmit: () => void;
  onPageSizeChange: (value: number) => void;
  onDensityChange: (density: GridDensity) => void;
  onFiltersChange: (filters: CurrentViewFilter[]) => void;
  onToggleField: (key: string) => void;
  onApplyColumnPreset: (visibleKeys: string[]) => void;
  onResetFields: () => void;
  onClearBatchScope: () => void;
  onCopyRows: () => void;
}) {
  const lookup = fieldByKey(props.fields);
  const [columnSearch, setColumnSearch] = useState("");
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const columnSettingsRef = useRef<HTMLDetailsElement>(null);
  const filteredFields = useMemo(
    () => props.fields.filter((field) => matchesColumnSearch(field, columnSearch)),
    [columnSearch, props.fields]
  );
  const presets = useMemo(
    () => columnPresets(props.fields, props.identityFieldKey),
    [props.fields, props.identityFieldKey]
  );

  useEffect(() => {
    if (!columnSettingsOpen) return;

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && columnSettingsRef.current?.contains(target)) return;
      setColumnSettingsOpen(false);
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [columnSettingsOpen]);

  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-border p-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <label className="inline-flex h-9 shrink-0 items-center gap-2 border border-border px-3 text-sm">
          <input
            id="current-view-retro"
            name="retro"
            type="checkbox"
            checked={props.retro}
            onChange={(event) => props.onRetroChange(event.target.checked)}
            className="size-4 accent-foreground"
          />
          回溯 Schema
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            props.onSearchSubmit();
          }}
          className="flex h-9 min-w-[260px] flex-1 items-center gap-2 border border-border px-3"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            id="current-view-search"
            name="search"
            value={props.searchInput}
            onChange={(event) => props.onSearchInputChange(event.target.value)}
            placeholder="搜索实体编号或字段值"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" className="text-xs font-medium text-muted-foreground hover:text-foreground">
            搜索
          </button>
        </form>
        {props.batchScope && (
          <button
            type="button"
            onClick={props.onClearBatchScope}
            className="inline-flex h-9 max-w-full items-center gap-2 border border-[var(--color-status-info)] px-3 text-sm text-[var(--color-status-info)] hover:bg-[var(--color-status-info)]/10"
            title={props.batchScope.summary}
          >
            <RowsChipLabel id={props.batchScope.id} summary={props.batchScope.summary} />
            <X className="size-3.5 shrink-0" aria-hidden />
          </button>
        )}
        <CurrentViewFilters
          fields={props.fields}
          filters={props.filters}
          schemaRole={props.schemaRole}
          onFiltersChange={props.onFiltersChange}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="current-view-page-size"
          name="page_size"
          value={props.pageSize}
          onChange={(event) => props.onPageSizeChange(Number(event.target.value))}
          className="h-9 border border-border bg-transparent px-3 text-sm"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / 页
            </option>
          ))}
        </select>
        <DensityControl density={props.density} onChange={props.onDensityChange} />
        <button
          type="button"
          onClick={props.onCopyRows}
          className="h-9 border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          复制当前页
        </button>
        <details
          ref={columnSettingsRef}
          open={columnSettingsOpen}
          onToggle={(event) => setColumnSettingsOpen(event.currentTarget.open)}
          className="relative min-w-0"
        >
          <summary
            aria-expanded={columnSettingsOpen}
            className="inline-flex h-9 cursor-pointer items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <Columns3 className="size-4" aria-hidden />
            列设置
          </summary>
          <div className="absolute right-0 z-10 mt-2 grid max-h-[28rem] w-80 gap-2 overflow-auto border border-border bg-background p-2 shadow-xl">
            <label className="flex h-8 items-center gap-2 border border-border px-2 text-xs">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={columnSearch}
                onChange={(event) => setColumnSearch(event.target.value)}
                placeholder="搜索字段"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div className="grid grid-cols-2 gap-1">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={preset.keys.length === 0}
                  onClick={() => props.onApplyColumnPreset(preset.keys)}
                  className="flex h-8 items-center justify-between gap-2 border border-border px-2 text-left text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
                >
                  <span className="truncate">{preset.label}</span>
                  <span className="font-mono">{preset.keys.length}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={props.onResetFields}
              className="inline-flex h-8 items-center justify-center gap-2 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              恢复默认列
            </button>
            <div className="grid gap-1 border-t border-border pt-2">
              {filteredFields.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  没有匹配字段
                </div>
              ) : (
                filteredFields.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => props.onToggleField(field.key)}
                    className="flex items-center justify-between gap-2 px-2 py-1 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{lookup[field.key].label}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {field.key}
                      </span>
                    </span>
                    {props.hiddenFields[field.key] ? (
                      <EyeOff className="size-4 shrink-0" />
                    ) : (
                      <Eye className="size-4 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function RowsChipLabel(props: { id: number; summary?: string }) {
  return (
    <span className="min-w-0 truncate">
      仅看批次 <span className="font-mono">#{props.id}</span>
      {props.summary ? ` · ${props.summary}` : ""}
    </span>
  );
}

function columnPresets(fields: FieldConfig[], identityFieldKey: string) {
  const core = fields.filter(
    (field, index) =>
      field.key === identityFieldKey || field.required || field.indexed || index < 6
  );
  const business = fields.filter((field) => !field.deprecated && !field.sensitive);
  const source = fields.filter((field) =>
    fieldMatchesTerms(field, ["source", "origin", "import", "file", "来源", "导入", "文件"])
  );
  const audit = fields.filter((field) =>
    fieldMatchesTerms(field, [
      "status",
      "state",
      "audit",
      "review",
      "created",
      "updated",
      "状态",
      "审批",
      "审计",
    ])
  );
  return [
    { id: "core", label: "核心字段", keys: uniqueKeys(core) },
    { id: "business", label: "业务字段", keys: uniqueKeys(business) },
    { id: "source", label: "来源字段", keys: uniqueKeys(source) },
    { id: "audit", label: "审计字段", keys: uniqueKeys(audit) },
  ];
}

function matchesColumnSearch(field: FieldConfig, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return true;
  return fieldMatchesTerms(field, [normalized]);
}

function fieldMatchesTerms(field: FieldConfig, terms: string[]) {
  const haystack = `${field.key} ${field.label}`.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function uniqueKeys(fields: FieldConfig[]) {
  return [...new Set(fields.map((field) => field.key))];
}

function DensityControl(props: {
  density: GridDensity;
  onChange: (density: GridDensity) => void;
}) {
  return (
    <div
      className="inline-flex h-9 items-center border border-border bg-background p-0.5"
      aria-label="表格密度"
    >
      {GRID_DENSITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={props.density === option.value}
          onClick={() => props.onChange(option.value)}
          className={cn(
            "h-7 px-2 text-xs text-muted-foreground hover:text-foreground",
            props.density === option.value && "bg-foreground text-background hover:text-background"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PaginationBar(props: {
  page: number;
  totalPages: number;
  count: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        共 <span className="font-mono text-foreground">{props.count}</span> 条
      </span>
      <div className="flex items-center gap-2">
        <button
          disabled={props.page <= 1}
          onClick={() => props.onPage(props.page - 1)}
          className="border border-border px-3 py-1 disabled:opacity-40"
        >
          上一页
        </button>
        <span className="font-mono text-xs text-muted-foreground">
          {props.page} / {props.totalPages}
        </span>
        <button
          disabled={props.page >= props.totalPages}
          onClick={() => props.onPage(props.page + 1)}
          className="border border-border px-3 py-1 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
