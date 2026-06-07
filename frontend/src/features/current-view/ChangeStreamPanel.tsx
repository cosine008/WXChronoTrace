import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { downloadChangeSetExport } from "@/api/stats";
import {
  compareSchemaChangesets,
  type ChangeSetDetailPaged,
  type ChangeSetStatus,
  type ChangeSetSummary,
  type FieldConfig,
} from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { saveBlob } from "@/lib/download";
import { ChangeSetBatchListPanel } from "./ChangeSetBatchListPanel";
import { ChangeSetDetailPane } from "./ChangeStreamDetailPane";
import { ChangeSetComparePanel } from "./ChangeSetComparePanel";
import { EntityInspectorPane } from "./EntityInspectorPane";
import {
  ChangeInspectorHeader,
  CollapsedChangeInspector,
  InspectorTabs,
} from "./ChangeStreamPanelParts";

export interface ChangeStreamFilters {
  status: ChangeSetStatus | "";
  createdBy: "all" | "mine";
  createdFrom: string;
  createdTo: string;
}

export type ChangeInspectorTab = "batches" | "detail" | "entity" | "compare";

interface Props {
  schemaId: number;
  changesets: ChangeSetSummary[];
  detail?: ChangeSetDetailPaged;
  loading: boolean;
  detailEntriesLoading: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  filters: ChangeStreamFilters;
  activeTab: ChangeInspectorTab;
  selectedId?: number;
  selectedEntityId: number | null;
  fieldLabels: Record<string, string>;
  fieldTypes: Record<string, FieldConfig["type"]>;
  collapsed: boolean;
  currentUserId?: number;
  canEdit: boolean;
  approverChoices: Array<{ id: number; username: string }>;
  actionLoading: boolean;
  entryActionLoading: boolean;
  onlyCurrentBatchActive: boolean;
  onSelect: (id: number) => void;
  onTabChange: (tab: ChangeInspectorTab) => void;
  onPage: (page: number) => void;
  onDetailEntriesPage: (page: number) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onFiltersChange: (patch: Partial<ChangeStreamFilters>) => void;
  onToggleCurrentBatch: (id: number) => void;
  onLocateEntry: Parameters<typeof ChangeSetDetailPane>[0]["onLocateEntry"];
  onOpenEntityDrawer: (entityId: number) => void;
  onSubmit: (id: number, payload: { summary: string; approver_id?: number }) => void;
  onApprove: (id: number) => void;
  onReject: (id: number, payload: { reason: string }) => void;
  onRevert: (id: number) => void;
  onDeleteEntry: (changeSetId: number, entryId: number) => void;
  onDiscardDraft: (changeSetId: number) => void;
}

export function ChangeStreamPanel({
  schemaId,
  changesets,
  detail,
  loading,
  detailEntriesLoading,
  page,
  totalPages,
  totalCount,
  filters,
  activeTab,
  selectedId,
  selectedEntityId,
  fieldLabels,
  fieldTypes,
  collapsed,
  currentUserId,
  canEdit,
  approverChoices,
  actionLoading,
  entryActionLoading,
  onlyCurrentBatchActive,
  onSelect,
  onTabChange,
  onPage,
  onDetailEntriesPage,
  onCollapsedChange,
  onFiltersChange,
  onToggleCurrentBatch,
  onLocateEntry,
  onOpenEntityDrawer,
  onSubmit,
  onApprove,
  onReject,
  onRevert,
  onDeleteEntry,
  onDiscardDraft,
}: Props) {
  const notify = useNotification();
  const filtersActive = hasActiveFilters(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<number | undefined>();
  const [compareRightId, setCompareRightId] = useState<number | undefined>();
  const exportMutation = useMutation({
    mutationFn: (changeSetId: number) => downloadChangeSetExport(changeSetId),
    onSuccess: (blob, changeSetId) => {
      saveBlob(blob, `changeset_${changeSetId}.xlsx`);
      notify.success({
        title: "导出已生成",
        message: `批次 #${changeSetId} 的 Excel 文件已下载。`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "导出失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const compareQuery = useQuery({
    queryKey: ["schema-changeset-compare", schemaId, compareLeftId, compareRightId],
    queryFn: () => compareSchemaChangesets(schemaId, compareLeftId!, compareRightId!),
    enabled:
      Number.isFinite(schemaId) &&
      compareLeftId !== undefined &&
      compareRightId !== undefined,
  });

  if (collapsed) {
    return (
      <CollapsedChangeInspector
        totalCount={totalCount}
        loading={loading}
        onExpand={() => onCollapsedChange(false)}
      />
    );
  }

  return (
    <aside className="max-xl:sticky max-xl:bottom-0 max-xl:z-20 max-xl:max-h-[78vh] max-xl:shadow-2xl flex min-h-0 min-w-0 flex-col overflow-hidden border border-border bg-background xl:sticky xl:top-4 xl:max-h-[calc(100vh-160px)]">
      <ChangeInspectorHeader
        totalCount={totalCount}
        selectedId={selectedId}
        loading={loading}
        onCollapse={() => onCollapsedChange(true)}
      />
      <InspectorTabs
        active={activeTab}
        onChange={onTabChange}
        hasDetail={Boolean(detail)}
        hasEntity={selectedEntityId !== null}
      />
      {activeTab === "batches" ? (
        <ChangeSetBatchListPanel
          changesets={changesets}
          filters={filters}
          filtersActive={filtersActive}
          filtersOpen={filtersOpen}
          selectedId={selectedId}
          compareLeftId={compareLeftId}
          compareRightId={compareRightId}
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          currentUserId={currentUserId}
          onToggleFilters={() => setFiltersOpen((value) => !value)}
          onClearFilters={() =>
            onFiltersChange({ status: "", createdBy: "all", createdFrom: "", createdTo: "" })
          }
          onFiltersChange={onFiltersChange}
          onSelect={(id) => {
            onSelect(id);
            onTabChange("detail");
          }}
          onCompareLeft={(id) => selectCompareSlot("left", id)}
          onCompareRight={(id) => selectCompareSlot("right", id)}
          onPage={onPage}
        />
      ) : activeTab === "detail" ? (
        <div
          id="change-inspector-panel-detail"
          role="tabpanel"
          aria-labelledby="change-inspector-tab-detail"
          className="nd-panel-enter flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <ChangeSetDetailPane
            key={detail?.id ?? "empty-detail"}
            detail={detail}
            fieldLabels={fieldLabels}
            fieldTypes={fieldTypes}
            exportLoading={exportMutation.isPending}
            canEdit={canEdit}
            currentUserId={currentUserId}
            entryActionLoading={entryActionLoading}
            entriesPageLoading={detailEntriesLoading}
            actionProps={actionProps()}
            onlyCurrentBatchActive={onlyCurrentBatchActive}
            onBack={() => onTabChange("batches")}
            onExport={(id) => exportMutation.mutate(id)}
            onToggleCurrentBatch={onToggleCurrentBatch}
            onEntriesPage={onDetailEntriesPage}
            onLocateEntry={onLocateEntry}
            onDeleteEntry={onDeleteEntry}
          />
        </div>
      ) : activeTab === "compare" ? (
        <div
          id="change-inspector-panel-compare"
          role="tabpanel"
          aria-labelledby="change-inspector-tab-compare"
          className="nd-panel-enter flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <ChangeSetComparePanel
            schemaId={schemaId}
            leftId={compareLeftId}
            rightId={compareRightId}
            comparison={compareQuery.data}
            loading={compareQuery.isFetching}
            error={compareQuery.error}
            onBack={() => onTabChange("batches")}
            onClear={() => {
              setCompareLeftId(undefined);
              setCompareRightId(undefined);
            }}
            onOpenDetail={(id) => {
              onSelect(id);
              onTabChange("detail");
            }}
          />
        </div>
      ) : (
        <div
          id="change-inspector-panel-entity"
          role="tabpanel"
          aria-labelledby="change-inspector-tab-entity"
          className="nd-panel-enter flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <EntityInspectorPane
            entityId={selectedEntityId}
            fieldLabels={fieldLabels}
            onOpenDrawer={onOpenEntityDrawer}
          />
        </div>
      )}
    </aside>
  );

  function actionProps() {
    return {
      schemaId,
      currentUserId,
      canEdit,
      approverChoices,
      loading: actionLoading,
      entryActionLoading,
      onSubmit,
      onApprove,
      onReject,
      onRevert,
      onDiscardDraft,
    };
  }

  function selectCompareSlot(slot: "left" | "right", id: number) {
    if (slot === "left") {
      const turningOff = compareLeftId === id;
      setCompareLeftId((current) => (current === id ? undefined : id));
      if (compareRightId === id) setCompareRightId(undefined);
      if (!turningOff && compareRightId && compareRightId !== id) onTabChange("compare");
      return;
    }
    const turningOff = compareRightId === id;
    setCompareRightId((current) => (current === id ? undefined : id));
    if (compareLeftId === id) setCompareLeftId(undefined);
    if (!turningOff && compareLeftId && compareLeftId !== id) onTabChange("compare");
  }
}

function hasActiveFilters(filters: ChangeStreamFilters) {
  return Boolean(
    filters.status ||
      filters.createdBy !== "all" ||
      filters.createdFrom ||
      filters.createdTo
  );
}
