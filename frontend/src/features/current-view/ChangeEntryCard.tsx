import { ChevronDown, ChevronUp, LocateFixed, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ChangeSetEntry, FieldConfig } from "@/api/schemas";
import { DiffCell } from "@/components/badges";
import { IDENTITY_CODE_FIELD_KEY } from "@/lib/schemaFields";
import { cn } from "@/lib/utils";
import { MarkdownDiffSummary } from "./MarkdownDiffSummary";
import { recordDisplayCode, stringifyCell } from "./currentViewUtils";

interface Props {
  entry: ChangeSetEntry;
  fieldLabels?: Record<string, string>;
  fieldTypes?: Record<string, FieldConfig["type"]>;
  canRemove?: boolean;
  removeLoading?: boolean;
  fieldFilter?: string | null;
  onLocateEntry?: (entry: ChangeSetEntry) => void;
  onLocateField?: (entry: ChangeSetEntry, fieldKey: string) => void;
  onRemove?: (entryId: number) => void;
}

const COLLAPSED_FIELD_COUNT = 4;

export function ChangeEntryCard({
  entry,
  fieldLabels = {},
  fieldTypes = {},
  canRemove = false,
  removeLoading = false,
  fieldFilter = null,
  onLocateEntry,
  onLocateField,
  onRemove,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const changedFields = entry.changed_fields.filter((field) => field !== IDENTITY_CODE_FIELD_KEY);
  const availableFields = fieldFilter
    ? changedFields.filter((field) => field === fieldFilter)
    : changedFields;
  const hiddenCount = Math.max(availableFields.length - COLLAPSED_FIELD_COUNT, 0);
  const fields = expanded ? availableFields : availableFields.slice(0, COLLAPSED_FIELD_COUNT);
  const displayCode = recordDisplayCode(entry);

  return (
    <div
      className={cn(
        "border border-border bg-card p-2",
        "border-l-2",
        actionToneClass(entry.action)
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate font-mono text-xs">{displayCode}</span>
          <span className="text-[11px] text-muted-foreground">
            {actionLabel(entry.action)} · {entry.valid_from}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onLocateEntry && (
            <button
              type="button"
              onClick={() => onLocateEntry(entry)}
              aria-label={`定位实体 ${displayCode}`}
              className="inline-flex h-7 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              <LocateFixed className="size-3.5" aria-hidden />
              定位行
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              disabled={removeLoading}
              onClick={() => onRemove?.(entry.id)}
              aria-label={`移除明细 ${entry.id}`}
              className="inline-flex h-7 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:text-[var(--color-status-error)] disabled:opacity-40"
            >
              <Trash2 className="size-3.5" aria-hidden />
              移除
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-1">
        {fields.map((field) => (
          <div key={field} className="grid gap-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {fieldLabels[field] ? `${fieldLabels[field]} / ${field}` : field}
              </span>
              {onLocateField && (
                <button
                  type="button"
                  title={`定位字段 ${fieldLabels[field] ?? field}`}
                  aria-label={`定位字段 ${fieldLabels[field] ?? field}`}
                  onClick={() => onLocateField(entry, field)}
                  className="inline-flex h-6 shrink-0 items-center gap-1 border border-border px-1.5 text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  <LocateFixed className="size-3" aria-hidden />
                  字段
                </button>
              )}
            </div>
            {fieldTypes[field] === "markdown" ? (
              <MarkdownDiffSummary
                before={stringifyCell(entry.data_before?.[field])}
                after={stringifyCell(entry.data_after?.[field])}
                className="w-full"
              />
            ) : (
              <DiffCell
                before={stringifyCell(entry.data_before?.[field])}
                after={stringifyCell(entry.data_after?.[field])}
                className="w-full"
              />
            )}
          </div>
        ))}
        {availableFields.length === 0 && (
          <span className="text-xs text-muted-foreground">无字段差异</span>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              "mt-1 inline-flex h-7 w-fit items-center gap-1 border border-border px-2 text-xs",
              "text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {expanded ? "收起字段" : `展开全部，还有 ${hiddenCount} 个字段`}
          </button>
        )}
      </div>
    </div>
  );
}

function actionLabel(action: string) {
  if (action === "create") return "新增";
  if (action === "update") return "修改";
  return "终止";
}

function actionToneClass(action: string) {
  if (action === "create") return "border-l-[var(--color-status-new)]";
  if (action === "update") return "border-l-[var(--color-status-modified)]";
  return "border-l-[var(--color-status-terminated)]";
}
