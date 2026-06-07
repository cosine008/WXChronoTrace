import { ChevronLeft, ChevronRight, Download, Rows3 } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ChangeSetDetailPaged,
  ChangeSetEntry,
  ChangeSetSummary,
  FieldConfig,
} from "@/api/schemas";
import { ChangeBadge, StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/feedback";
import { ChangeEntryCard } from "./ChangeEntryCard";
import { ChangeSetFieldSummary } from "./ChangeSetFieldSummary";
import { ChangeSetActions } from "./ChangeSetActions";

export function ChangeSetDetailPane(props: {
  detail?: ChangeSetDetailPaged;
  fieldLabels: Record<string, string>;
  fieldTypes: Record<string, FieldConfig["type"]>;
  exportLoading: boolean;
  canEdit: boolean;
  currentUserId?: number;
  entryActionLoading: boolean;
  entriesPageLoading: boolean;
  actionProps: Omit<Parameters<typeof ChangeSetActions>[0], "detail">;
  onlyCurrentBatchActive?: boolean;
  onBack: () => void;
  onExport: (id: number) => void;
  onToggleCurrentBatch: (id: number) => void;
  onEntriesPage: (page: number) => void;
  onLocateEntry: (entry: ChangeSetEntry, fieldKey?: string) => void;
  onDeleteEntry: (changeSetId: number, entryId: number) => void;
}) {
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const filteredEntries = useMemo(
    () => {
      const entries = props.detail?.entries_page.results ?? [];
      return selectedFieldKey
        ? entries.filter((entry) => entry.changed_fields.includes(selectedFieldKey))
        : entries;
    },
    [props.detail?.entries_page.results, selectedFieldKey]
  );

  if (!props.detail) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <EmptyState title="选择一个变更批次" description="从批次列表进入明细，减少同时展开的信息量。" minH="min-h-full" />
      </div>
    );
  }

  function handleSelectField(fieldKey: string | null) {
    setSelectedFieldKey(fieldKey);
  }

  const entriesPage = props.detail.entries_page;
  const totalPages = Math.max(entriesPage.total_pages, 1);
  const selectedFieldLabel = selectedFieldKey
    ? props.fieldLabels[selectedFieldKey] ?? selectedFieldKey
    : "";

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="grid gap-3">
        <div className="border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{props.detail.summary}</h3>
                <StatusBadge variant={props.detail.status} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {props.detail.created_by_username} · {props.detail.entry_count} 条明细 · #
                {props.detail.id}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={props.onBack}
                className="h-8 border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                批次
              </button>
              <button
                type="button"
                onClick={() => props.onToggleCurrentBatch(props.detail!.id)}
                className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                aria-pressed={props.onlyCurrentBatchActive}
              >
                <Rows3 className="size-3.5" aria-hidden />
                {props.onlyCurrentBatchActive ? "取消仅看" : "仅看本批"}
              </button>
              <button
                type="button"
                disabled={props.exportLoading}
                onClick={() => props.onExport(props.detail!.id)}
                className="inline-flex h-8 items-center gap-2 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
              >
                <Download className="size-4" aria-hidden />
                Excel
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ChangeBadge kind="new" count={props.detail.action_counts.create} mutedWhenZero />
            <ChangeBadge
              kind="modified"
              count={props.detail.action_counts.update}
              mutedWhenZero
            />
            <ChangeBadge
              kind="terminated"
              count={props.detail.action_counts.terminate}
              mutedWhenZero
            />
          </div>
        </div>
        <ChangeSetActions
          key={detailActionKey(props.detail)}
          detail={props.detail}
          {...props.actionProps}
        />
        <ChangeSetFieldSummary
          aggregates={props.detail.field_aggregates}
          fieldLabels={props.fieldLabels}
          selectedFieldKey={selectedFieldKey}
          onSelectField={handleSelectField}
        />
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="min-w-0">
              <span>
                明细 第 {entriesPage.page}/{totalPages} 页 · 当前页 {filteredEntries.length}/
                {entriesPage.results.length} · 全批次 {entriesPage.count}
              </span>
              {selectedFieldKey && <span> · 字段 {selectedFieldLabel}</span>}
              {props.entriesPageLoading && <span> · 刷新中</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={entriesPage.page <= 1 || props.entriesPageLoading}
                onClick={() => props.onEntriesPage(entriesPage.page - 1)}
                className="inline-flex h-7 items-center gap-1 border border-border px-2 hover:border-foreground hover:text-foreground disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" aria-hidden />
                上页
              </button>
              <button
                type="button"
                disabled={entriesPage.page >= totalPages || props.entriesPageLoading}
                onClick={() => props.onEntriesPage(entriesPage.page + 1)}
                className="inline-flex h-7 items-center gap-1 border border-border px-2 hover:border-foreground hover:text-foreground disabled:opacity-40"
              >
                下页
                <ChevronRight className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
          {filteredEntries.length === 0 ? (
            <EmptyState
              title={selectedFieldKey ? "当前页没有该字段明细" : "批次没有明细"}
              description={
                selectedFieldKey
                  ? "字段聚合仍代表全批次，可切换明细页或清除字段聚焦。"
                  : "该批次暂未包含字段变更。"
              }
              minH="min-h-36"
            />
          ) : (
            filteredEntries.map((entry) => (
              <ChangeEntryCard
                key={entry.id}
                entry={entry}
                fieldLabels={props.fieldLabels}
                fieldTypes={props.fieldTypes}
                fieldFilter={selectedFieldKey}
                canRemove={
                  props.canEdit &&
                  props.detail?.status === "draft" &&
                  props.detail.created_by_id === props.currentUserId
                }
                removeLoading={props.entryActionLoading}
                onLocateEntry={(entry) => props.onLocateEntry(entry)}
                onLocateField={(entry, fieldKey) => props.onLocateEntry(entry, fieldKey)}
                onRemove={(entryId) => props.onDeleteEntry(props.detail!.id, entryId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function detailActionKey(detail: ChangeSetSummary) {
  return `${detail.id}:${detail.status}:${detail.summary}:${detail.approver_id ?? ""}`;
}
