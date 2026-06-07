import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { FileSpreadsheet, PanelRightOpen, RefreshCw, Tags } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

import {
  getCommentSummary,
} from "@/api/comments";
import {
  approveChangeSet,
  deleteChangeSet,
  deleteChangeSetEntry,
  editRecordCell,
  getCurrentRecords,
  getDraftOverlay,
  getSchemaChangesetPage,
  listCollaborators,
  listSchemaChangesets,
  locateCurrentRecord,
  rejectChangeSet,
  revertChangeSet,
  submitChangeSet,
  type ChangeSetEntry,
  type ChangeSetListParams,
  type CurrentViewFilter,
  type CurrentViewRecord,
  type DraftOverlayCell,
  type FieldConfig,
} from "@/api/schemas";
import { DataMetric, MetricGrid, PermissionTag, TimePointIndicator } from "@/components/badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import {
  InfoNotificationBanner,
  useNotification,
  type ConfirmOptions,
} from "@/components/notifications";
import { SchemaLabelBatchPanel } from "@/features/labels/SchemaLabelBatchPanel";
import { CommentThreadDrawer } from "@/features/comments/CommentThreadDrawer";
import type { CommentAnchor } from "@/features/comments/commentAnchors";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { visibleUserFields } from "@/lib/schemaFields";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { BulkChangeSetPanel, TogglePanelButton } from "./BulkChangeSetPanel";
import {
  ChangeStreamPanel,
  type ChangeInspectorTab,
  type ChangeStreamFilters,
} from "./ChangeStreamPanel";
import { ActionButton, LinkButton, PaginationBar, Toolbar } from "./CurrentViewChrome";
import { SchemaWorkbenchDrawer } from "@/features/workbench/SchemaWorkbenchDrawer";
import { CurrentViewDrawer } from "./CurrentViewDrawer";
import {
  CurrentGrid,
  type GridLocateResult,
  type GridLocateTarget,
  type PasteCellChange,
} from "./CurrentGrid";
import { EntityTimelineDrawer } from "./EntityTimelineDrawer";
import { FilePreviewDrawer } from "./FilePreviewDrawer";
import { ImportWizard } from "./ImportWizard";
import { MarkdownPreviewDrawer } from "./MarkdownPreviewDrawer";
import { NewRecordButton, SingleRecordCreatePanel } from "./SingleRecordCreatePanel";
import { SchemaStatsPanel } from "./StatsExportPanel";
import { TimelineScrubber } from "./TimelineScrubber";
import { type GridDensity } from "./currentGridDensity";
import { copyRows } from "./currentViewClipboard";
import { buildCurrentViewExportPath } from "./currentViewExportRoute";
import { appendReturnTo, buildFlowBoardPath } from "../flow-board/flowBoardQuery";
import { defaultFlowDimensionForFields } from "../flow-board/flowBoardTransforms";
import {
  buildDraftCellsFromOverlay,
  draftRowsFromOverlay,
  draftCellKey,
  mergeDraftCells,
  type DraftCellMap,
  type DraftCellOverlay,
} from "./currentViewDrafts";
import type { MarkdownPreviewTarget } from "./markdownPreview";
import type { FilePreviewTarget } from "./filePreview";
import {
  loadCurrentViewPreferences,
  sanitizeColumnWidths,
  sanitizeHiddenFields,
  saveCurrentViewPreferences,
} from "./currentViewPreferences";
import {
  fromApiOrdering,
  recordDisplayCode,
  timePointKind,
  toApiOrdering,
  todayInputValue,
} from "./currentViewUtils";

const DETAIL_ENTRY_PAGE_SIZE = 80;

export function CurrentViewPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const schemaId = Number(id);
  const initialAt = normalizeAtQueryValue(searchParams.get("at"));
  const initialRetro = parseBooleanQueryValue(searchParams.get("retro"));
  const initialSearch = searchParams.get("search") || "";
  const initialFilters = parseFiltersQueryValue(searchParams.get("filters"));
  const orderingParam = searchParams.get("ordering");
  const initialOrdering = orderingParam || "business_code";
  const initialChangeSetId = Number(searchParams.get("change_set"));
  const initialPage = parsePositiveIntQueryValue(searchParams.get("page")) ?? 1;
  const initialPageSize = parsePositiveIntQueryValue(searchParams.get("page_size"));
  const commentRouteTarget = parseCommentRouteTarget(searchParams);
  const commentRouteTargetKey = commentRouteTargetToKey(commentRouteTarget);
  const contentKey = [
    schemaId,
    initialAt,
    initialRetro,
    initialSearch,
    initialOrdering,
    initialChangeSetId,
    JSON.stringify(initialFilters),
    initialPage,
    initialPageSize ?? "default-page-size",
    commentRouteTargetKey,
  ].join(":");
  return (
    <CurrentViewPageContent
      key={contentKey}
      schemaId={schemaId}
      initialAt={initialAt}
      initialRetro={initialRetro}
      initialSearch={initialSearch}
      initialFilters={initialFilters}
      initialSorting={orderingParam ? fromApiOrdering(initialOrdering) : []}
      initialChangeSetId={initialChangeSetId}
      initialPage={initialPage}
      initialPageSize={initialPageSize}
      commentRouteTarget={commentRouteTarget}
    />
  );
}

function CurrentViewPageContent({
  schemaId,
  initialAt,
  initialRetro,
  initialSearch,
  initialFilters,
  initialSorting,
  initialChangeSetId,
  initialPage,
  initialPageSize,
  commentRouteTarget,
}: {
  schemaId: number;
  initialAt: string;
  initialRetro: boolean;
  initialSearch: string;
  initialFilters: CurrentViewFilter[];
  initialSorting: SortingState;
  initialChangeSetId: number;
  initialPage: number;
  initialPageSize?: number;
  commentRouteTarget: CommentRouteTarget | null;
}) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const currentUser = useAuthStore((state) => state.user);
  const initialPreferences = useMemo(
    () => loadCurrentViewPreferences(schemaId),
    [schemaId]
  );
  const [at, setAt] = useState(initialAt);
  const [retro, setRetro] = useState(initialRetro);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState<CurrentViewFilter[]>(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize ?? initialPreferences.pageSize);
  const [changesetPage, setChangesetPage] = useState(1);
  const [gridDensity, setGridDensity] = useState<GridDensity>(initialPreferences.density);
  const [changeInspectorCollapsed, setChangeInspectorCollapsed] = useState(
    initialPreferences.inspectorCollapsed
  );
  const [changeStreamFilters, setChangeStreamFilters] = useState<ChangeStreamFilters>({
    status: "",
    createdBy: "all",
    createdFrom: "",
    createdTo: "",
  });
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>(
    initialPreferences.hiddenFields
  );
  const [columnWidths, setColumnWidths] = useState(initialPreferences.columnWidths);
  const [localDraftCells, setLocalDraftCells] = useState<DraftCellMap>({});
  const [selectedEntityIds, setSelectedEntityIds] = useState<number[]>([]);
  const [activeEditor, setActiveEditor] = useState<ActiveEditor>(null);
  const [schemaWorkbenchOpen, setSchemaWorkbenchOpen] = useState(false);
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  const openedCommentRouteKeyRef = useRef<string | null>(null);
  const pendingCommentLocateKeyRef = useRef<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [inspectedEntityId, setInspectedEntityId] = useState<number | null>(null);
  const [drawerEntityId, setDrawerEntityId] = useState<number | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownPreviewTarget | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreviewTarget | null>(null);
  const [batchScope, setBatchScope] = useState<BatchScope>(null);
  const [locateTarget, setLocateTarget] = useState<GridLocateTarget | null>(null);
  const [inspectorTab, setInspectorTab] = useState<ChangeInspectorTab>(
    Number.isFinite(initialChangeSetId) && initialChangeSetId > 0 ? "detail" : "batches"
  );
  const [selectedChangeSetId, setSelectedChangeSetId] = useState<number | undefined>(() =>
    Number.isFinite(initialChangeSetId) && initialChangeSetId > 0 ? initialChangeSetId : undefined
  );
  const [detailEntriesPage, setDetailEntriesPage] = useState(1);
  const ordering = toApiOrdering(sorting);
  const batchScopeChangeSetId = batchScope?.changeSetId;
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  const recordsQuery = useQuery({
    queryKey: [
      "schema-records",
      schemaId,
      at,
      retro,
      search,
      ordering,
      filtersKey,
      page,
      pageSize,
      batchScopeChangeSetId,
    ],
    queryFn: () =>
      getCurrentRecords(schemaId, {
        at,
        retro,
        search,
        ordering,
        filters,
        page,
        page_size: pageSize,
        change_set: batchScopeChangeSetId,
      }),
    enabled: Number.isFinite(schemaId),
  });
  const changesetsQuery = useQuery({
    queryKey: ["schema-changesets", schemaId, changesetPage, changeStreamFilters],
    queryFn: () => listSchemaChangesets(schemaId, changesetListParams()),
    enabled: Number.isFinite(schemaId),
  });
  const timelineChangesetsQuery = useQuery({
    queryKey: ["schema-changesets", schemaId, "timeline"],
    queryFn: () => listSchemaChangesets(schemaId, { page: 1, page_size: 100 }),
    enabled: Number.isFinite(schemaId),
  });
  const draftOverlayQuery = useQuery({
    queryKey: ["schema-draft-overlay", schemaId, at, currentUser?.id],
    queryFn: () => getDraftOverlay(schemaId, at),
    enabled: Number.isFinite(schemaId) && currentUser?.id !== undefined,
  });
  const detailQuery = useQuery({
    queryKey: [
      "schema-changeset",
      schemaId,
      selectedChangeSetId,
      { entries_page: detailEntriesPage, entries_page_size: DETAIL_ENTRY_PAGE_SIZE },
    ],
    queryFn: () =>
      getSchemaChangesetPage(schemaId, selectedChangeSetId!, {
        entries_page: detailEntriesPage,
        entries_page_size: DETAIL_ENTRY_PAGE_SIZE,
      }),
    enabled: Number.isFinite(schemaId) && selectedChangeSetId !== undefined,
  });
  const collaboratorsQuery = useQuery({
    queryKey: ["schema-collaborators", schemaId],
    queryFn: () => listCollaborators(schemaId),
    enabled: Number.isFinite(schemaId),
  });
  const changesets = useMemo(
    () => changesetsQuery.data?.results ?? [],
    [changesetsQuery.data]
  );
  const timelineChangesets = timelineChangesetsQuery.data?.results ?? [];
  const editMutation = useMutation({
    mutationFn: (vars: {
      record: CurrentViewRecord;
      field: FieldConfig;
      value: unknown;
      at: string;
    }) =>
      editRecordCell(schemaId, vars.record.entity_id, {
        field_key: vars.field.key,
        value: vars.value,
        at: vars.at,
      }),
    onMutate: (vars) => {
      const key = draftCellKey(vars.at, vars.record.entity_id, vars.field.key);
      setLocalDraftCells((current) => ({
        ...current,
        [key]: { value: vars.value, status: "saving" },
      }));
      return { key };
    },
    onSuccess: async (detail, vars, context) => {
      const key = context?.key ?? draftCellKey(vars.at, vars.record.entity_id, vars.field.key);
      setLocalDraftCells((current) => ({
        ...current,
        [key]: {
          value: detail.entry.data_after?.[vars.field.key] ?? vars.value,
          status: "draft",
          changeSetId: detail.id,
          entryId: detail.entry.id,
        },
      }));
      selectChangeSet(detail.id);
      setInspectorTab("detail");
      invalidateStatsQueries();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema-draft-overlay", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changesets", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changeset", schemaId, detail.id] }),
      ]);
    },
    onError: (err, vars, context) => {
      const apiError = extractApiError(err);
      const key = context?.key ?? draftCellKey(vars.at, vars.record.entity_id, vars.field.key);
      setLocalDraftCells((current) => ({
        ...current,
        [key]: {
          value: vars.value,
          status: "failed",
          message: apiError.message,
        },
      }));
      notify.error({
        title: "单元格保存失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const changeActionMutation = useMutation({
    mutationFn: (vars: ChangeActionRequest) => runChangeAction(vars),
    onSuccess: async (detail, vars) => {
      selectChangeSet(detail.id);
      setInspectorTab("detail");
      notify.success({
        title: changeActionSuccessTitle(vars.type, detail.status),
        message: `批次 #${detail.id} · ${detail.summary}`,
      });
      invalidateStatsQueries();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema-records"] }),
        queryClient.invalidateQueries({ queryKey: ["schema-draft-overlay", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changesets", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changeset", schemaId, detail.id] }),
      ]);
      if (detail.status === "applied" || detail.status === "reverted") {
        setLocalDraftCells({});
      }
    },
    onError: (err, vars) => {
      const apiError = extractApiError(err);
      notify.error({
        title: changeActionErrorTitle(vars.type),
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const deleteEntryMutation = useMutation({
    mutationFn: (vars: { changeSetId: number; entryId: number }) =>
      deleteChangeSetEntry(vars.changeSetId, vars.entryId),
    onSuccess: async (_, vars) => {
      removeLocalDraftCells(
        (cell) => cell.changeSetId === vars.changeSetId && cell.entryId === vars.entryId
      );
      notify.success({
        title: "草稿明细已移除",
        message: `批次 #${vars.changeSetId} 的明细 #${vars.entryId} 已删除。`,
      });
      invalidateStatsQueries();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema-records"] }),
        queryClient.invalidateQueries({ queryKey: ["schema-draft-overlay", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changesets", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changeset", schemaId, vars.changeSetId] }),
      ]);
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "移除草稿明细失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const discardDraftMutation = useMutation({
    mutationFn: (changeSetId: number) => deleteChangeSet(changeSetId),
    onSuccess: async (_, changeSetId) => {
      removeLocalDraftCells((cell) => cell.changeSetId === changeSetId);
      if (selectedChangeSetId === changeSetId) selectChangeSet(undefined);
      notify.success({
        title: "草稿已放弃",
        message: `批次 #${changeSetId} 已删除，已生效数据未受影响。`,
      });
      invalidateStatsQueries();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema-records"] }),
        queryClient.invalidateQueries({ queryKey: ["schema-draft-overlay", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changesets", schemaId] }),
        queryClient.invalidateQueries({ queryKey: ["schema-changeset", schemaId, changeSetId] }),
      ]);
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "放弃草稿失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const locateMutation = useMutation({
    mutationFn: (vars: LocateMutationVars) =>
      locateCurrentRecord(schemaId, {
        entity_id: vars.target.entityId,
        at: vars.query.at,
        retro: vars.query.retro,
        search: vars.query.search,
        filters: vars.query.filters,
        ordering: vars.query.ordering,
        page_size: vars.query.pageSize,
        change_set: vars.query.changeSetId,
      }),
    onSuccess: (location, vars) => {
      if (!location.supported) {
        notify.error({
          title: "无法自动跨页定位",
          message: locateUnsupportedMessage(location.reason),
        });
        return;
      }
      if (!location.found || !location.page) {
        handleLocateNotFound(vars.target, vars.query);
        return;
      }
      if (location.page !== vars.query.page) {
        setSelectedEntityIds([]);
        setPage(location.page);
        notify.info({
          title: "已跳转到目标页",
          message: `目标记录在第 ${location.page} 页，第 ${location.position ?? "-"} 条。`,
        });
        return;
      }
      setLocateTarget({ ...vars.target, requestId: Date.now() });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "定位失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const view = recordsQuery.data;
  const schema = view?.schema;
  const scopedDraftCells = useMemo(
    () => scopedDraftOverlayCells(draftOverlayQuery.data?.cells ?? [], batchScopeChangeSetId),
    [batchScopeChangeSetId, draftOverlayQuery.data?.cells]
  );
  const scopedDraftCreateRows = useMemo(
    () => scopedDraftOverlayRows(draftOverlayQuery.data?.create_rows ?? [], batchScopeChangeSetId),
    [batchScopeChangeSetId, draftOverlayQuery.data?.create_rows]
  );
  const serverDraftCells = useMemo(
    () => buildDraftCellsFromOverlay(scopedDraftCells),
    [scopedDraftCells]
  );
  const draftCells = useMemo(
    () => mergeDraftCells(serverDraftCells, localDraftCells),
    [localDraftCells, serverDraftCells]
  );
  const gridRecords = useMemo(
    () =>
      view
        ? [
            ...view.results,
            ...draftRowsFromOverlay(scopedDraftCreateRows, view.results),
          ]
        : [],
    [scopedDraftCreateRows, view]
  );
  const currentPageEntityIds = useMemo(
    () => uniqueEntityIds(gridRecords.map((record) => record.entity_id)),
    [gridRecords]
  );
  const commentSummaryQuery = useQuery({
    queryKey: ["comment-summary", schemaId, currentPageEntityIds.join(",")],
    queryFn: () => getCommentSummary(schemaId, currentPageEntityIds),
    enabled: Number.isFinite(schemaId) && currentPageEntityIds.length > 0,
  });
  const currentPageEntityIdSet = useMemo(
    () => new Set(currentPageEntityIds),
    [currentPageEntityIds]
  );
  const effectiveSelectedEntityIds = useMemo(
    () => selectedEntityIds.filter((entityId) => currentPageEntityIdSet.has(entityId)),
    [currentPageEntityIdSet, selectedEntityIds]
  );
  const userFields = useMemo(() => visibleUserFields(view?.fields_config ?? []), [view?.fields_config]);
  const visibleFields = useMemo(
    () => userFields.filter((field) => !hiddenFields[field.key]),
    [hiddenFields, userFields]
  );
  const fieldLabels = useMemo(
    () =>
      Object.fromEntries(userFields.map((field) => [field.key, field.label])),
    [userFields]
  );
  const fieldTypes = useMemo(
    () =>
      Object.fromEntries(userFields.map((field) => [field.key, field.type])),
    [userFields]
  );
  const canEdit = Boolean(schema?.role && ["admin", "owner", "editor"].includes(schema.role));
  const timeKind = timePointKind(at);
  const today = todayInputValue();
  const flowRightAt = at > today ? at : today;
  const flowBoardDimension = useMemo(
    () => (schema ? defaultFlowDimensionForFields(userFields, schema.role) : null),
    [schema, userFields]
  );
  const commentRouteTargetKey = commentRouteTargetToKey(commentRouteTarget);

  useEffect(() => {
    if (
      !commentRouteTarget ||
      !commentRouteTargetKey ||
      openedCommentRouteKeyRef.current === commentRouteTargetKey
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const fieldKey =
        commentRouteTarget.anchorType === "cell" ? commentRouteTarget.fieldKey : undefined;
      if (fieldKey) {
        setHiddenFields((current) =>
          current[fieldKey] ? { ...current, [fieldKey]: false } : current
        );
      }

      const record = gridRecords.find((item) => item.entity_id === commentRouteTarget.entityId);
      if (!record) {
        if (pendingCommentLocateKeyRef.current !== commentRouteTargetKey) {
          pendingCommentLocateKeyRef.current = commentRouteTargetKey;
          setLocateTarget({
            entityId: commentRouteTarget.entityId,
            fieldKey,
            requestId: Date.now(),
          });
        }
        return;
      }

      const anchor = buildCommentRouteAnchor({
        target: commentRouteTarget,
        schemaId,
        record,
        fields: userFields,
        contextDate: at,
      });
      if (!anchor) return;
      openedCommentRouteKeyRef.current = commentRouteTargetKey;
      setLocateTarget({
        entityId: commentRouteTarget.entityId,
        fieldKey,
        requestId: Date.now(),
      });
      setCommentAnchor(anchor);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [at, commentRouteTarget, commentRouteTargetKey, gridRecords, schemaId, userFields]);
  const filtersQuery = filters.length > 0 ? `&filters=${encodeURIComponent(filtersKey)}` : "";
  const snapshotDiffTo = schema
    ? `/schemas/${schema.id}/diff-studio?mode=snapshot&left_at=${encodeURIComponent(at)}&right_at=${encodeURIComponent(today)}&retro=${retro}&search=${encodeURIComponent(search)}&ordering=${encodeURIComponent(ordering)}${filtersQuery}&page=1`
    : "";
  const currentViewTo = schema
    ? `/schemas/${schema.id}/records?at=${encodeURIComponent(at)}&retro=${retro}&search=${encodeURIComponent(search)}&ordering=${encodeURIComponent(ordering)}${filtersQuery}`
    : "";
  const exportRouteState = schema
    ? {
        schemaId: schema.id,
        at,
        retro,
        search,
        ordering,
        filters,
        changeSetId: batchScopeChangeSetId,
        page,
        pageSize,
        currentPageEntityIds,
        selectedEntityIds: effectiveSelectedEntityIds,
        visibleFieldKeys: visibleFields.map((field) => field.key),
      }
    : null;
  const exportCsvTo = exportRouteState
    ? buildCurrentViewExportPath({ ...exportRouteState, format: "csv" })
    : "";
  const exportExcelTo = exportRouteState
    ? buildCurrentViewExportPath({ ...exportRouteState, format: "xlsx" })
    : "";
  const flowBoardTo = schema
    ? appendReturnTo(
        buildFlowBoardPath(schema.id, {
          left_at: at,
          right_at: flowRightAt,
          dimension: flowBoardDimension,
          retro,
          search,
          ordering,
        }),
        currentViewTo
      )
    : "";
  const visibleDraftCount = useMemo(
    () => Object.keys(draftCells).filter((key) => key.startsWith(`${at}:`)).length,
    [at, draftCells]
  );
  const batchScopeSummary =
    batchScopeChangeSetId === detailQuery.data?.id
      ? detailQuery.data?.summary
      : changesets.find((item) => item.id === batchScopeChangeSetId)?.summary;
  const approverChoices = useMemo(() => {
    if (!schema) return [] as Array<{ id: number; username: string }>;
    const editors = (collaboratorsQuery.data ?? []).filter(
      (item) => item.role === "editor" && item.is_employed
    );
    return [
      { id: schema.owner.id, username: `${schema.owner.username} · owner` },
      ...editors.map((item) => ({ id: item.user_id, username: `${item.username} · editor` })),
    ];
  }, [schema, collaboratorsQuery.data]);
  const persistedHiddenFields = useMemo(
    () => (view ? sanitizeHiddenFields(hiddenFields, userFields) : hiddenFields),
    [hiddenFields, userFields, view]
  );
  const persistedColumnWidths = useMemo(
    () => (view ? sanitizeColumnWidths(columnWidths, userFields) : columnWidths),
    [columnWidths, userFields, view]
  );

  useEffect(() => {
    saveCurrentViewPreferences(schemaId, {
      version: 1,
      density: gridDensity,
      inspectorCollapsed: changeInspectorCollapsed,
      hiddenFields: persistedHiddenFields,
      columnWidths: persistedColumnWidths,
      pageSize,
    });
  }, [
    changeInspectorCollapsed,
    gridDensity,
    pageSize,
    persistedColumnWidths,
    persistedHiddenFields,
    schemaId,
  ]);

  const activateBatchScope = useCallback(
    (changeSetId: number) => {
      setBatchScope((current) =>
        current?.changeSetId === changeSetId
          ? current
          : { changeSetId, returnPage: current?.returnPage ?? page }
      );
      setSelectedEntityIds([]);
      setPage(1);
    },
    [page]
  );

  const clearBatchScope = useCallback(() => {
    setSelectedEntityIds([]);
    setPage(batchScope?.returnPage ?? 1);
    setBatchScope(null);
  }, [batchScope]);

  const handleToggleBatchScope = useCallback(
    (changeSetId: number) => {
      if (batchScopeChangeSetId === changeSetId) {
        clearBatchScope();
        return;
      }
      activateBatchScope(changeSetId);
    },
    [activateBatchScope, batchScopeChangeSetId, clearBatchScope]
  );

  const handleInspectEntity = useCallback((entityId: number) => {
    setInspectedEntityId(entityId);
    setInspectorTab("entity");
    setChangeInspectorCollapsed(false);
  }, []);

  const handleLocateEntry = useCallback(
    (entry: ChangeSetEntry, fieldKey?: string) => {
      if (fieldKey) {
        setHiddenFields((current) =>
          current[fieldKey] ? { ...current, [fieldKey]: false } : current
        );
      }
      setLocateTarget({
        entityId: entry.entity_id,
        fieldKey,
        changeSetId: detailQuery.data?.id ?? selectedChangeSetId,
        requestId: Date.now(),
      });
    },
    [detailQuery.data?.id, selectedChangeSetId]
  );

  const handleGridLocateResult = useCallback(
    (result: GridLocateResult) => {
      if (result.found) return;
      if (locateMutation.isPending) return;
      locateMutation.mutate({
        target: result.target,
        query: {
          at,
          retro,
          search,
          filters,
          ordering,
          page,
          pageSize,
          changeSetId: batchScopeChangeSetId,
        },
      });
    },
    [
      at,
      batchScopeChangeSetId,
      filters,
      locateMutation,
      ordering,
      page,
      pageSize,
      retro,
      search,
    ]
  );

  function handleLocateNotFound(target: GridLocateTarget, query: LocateQuerySnapshot) {
    if (target.changeSetId && query.changeSetId !== target.changeSetId) {
      activateBatchScope(target.changeSetId);
      notify.info({
        title: "已切换到仅看本批",
        message: "当前快照没有该实体，主表已收敛到该批次影响范围后继续定位。",
      });
      return;
    }
    notify.error({
      title: "无法定位记录",
      message: "当前查询结果中没有找到该实体。可以调整时点或清除筛选条件后重试。",
    });
  }

  const handleApplyColumnPreset = useCallback(
    (visibleKeys: string[]) => {
      const visible = new Set(visibleKeys);
      setHiddenFields(
        Object.fromEntries(
          (view?.fields_config ?? [])
            .filter((field) => !visible.has(field.key))
            .map((field) => [field.key, true])
        )
      );
    },
    [view?.fields_config]
  );

  const handleFiltersChange = useCallback((nextFilters: CurrentViewFilter[]) => {
    setSelectedEntityIds([]);
    setFilters(nextFilters);
    setPage(1);
  }, []);

  function changesetListParams() {
    return changesetListParamsFromFilters(changesetPage, changeStreamFilters, currentUser?.id);
  }

  async function handleChangeAction(vars: ChangeActionRequest) {
    if (vars.type === "reject" && !vars.payload.reason.trim()) {
      notify.error({
        title: "驳回原因缺失",
        message: "请先填写驳回原因，再驳回该变更批次。",
      });
      return;
    }

    const detail = detailQuery.data?.id === vars.changeSetId ? detailQuery.data : undefined;
    const confirmed = await notify.confirm(changeActionConfirmOptions(vars, detail?.summary));
    if (confirmed) changeActionMutation.mutate(vars);
  }

  async function handleDeleteEntry(changeSetId: number, entryId: number) {
    const confirmed = await notify.confirm({
      title: "确认移除草稿明细",
      description: "移除后，该明细不会进入后续提交或发布，已生效数据不变。",
      impactSummary: [`批次 #${changeSetId}`, `明细 #${entryId}`],
      confirmLabel: "确认移除",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) deleteEntryMutation.mutate({ changeSetId, entryId });
  }

  async function handleDiscardDraft(changeSetId: number) {
    const confirmed = await notify.confirm({
      title: "确认放弃整个草稿",
      description: "放弃后，该草稿变更批次和其中所有明细都会被删除，已生效数据不变。",
      impactSummary: [`批次 #${changeSetId}`, "删除草稿明细", "不会改动已生效记录"],
      confirmLabel: "确认放弃",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) discardDraftMutation.mutate(changeSetId);
  }

  async function handlePasteCells(changes: PasteCellChange[]) {
    const confirmed = await notify.confirm({
      title: "确认批量粘贴到草稿",
      description: "确认后会按单元格逐项暂存到当前草稿，发布前仍可在变更流中复核或移除。",
      impactSummary: pasteImpactSummary(changes),
      confirmLabel: "确认暂存",
      cancelLabel: "取消",
    });
    if (!confirmed) return;
    changes.forEach((change) => {
      editMutation.mutate({
        record: change.record,
        field: change.field,
        value: change.value,
        at,
      });
    });
  }

  async function handleEditorToggle(nextEditor: Exclude<ActiveEditor, null>) {
    if (activeEditor === nextEditor) {
      await requestEditorClose();
      return;
    }
    if (editorDirty) {
      const confirmed = await notify.confirm({
        title: "切换编辑面板？",
        description: "切换后，当前面板中尚未暂存的输入会被清空，已写入草稿的内容不受影响。",
        impactSummary: [editorTitle(activeEditor), `切换到：${editorTitle(nextEditor)}`],
        confirmLabel: "放弃并切换",
        cancelLabel: "继续编辑",
        tone: "destructive",
      });
      if (!confirmed) return;
    }
    setActiveEditor(nextEditor);
    setEditorDirty(false);
  }

  async function requestEditorClose() {
    if (!activeEditor) return;
    if (editorDirty) {
      const confirmed = await notify.confirm({
        title: "关闭编辑面板？",
        description: "关闭后，当前面板中尚未暂存的输入会被清空，已写入草稿的内容不受影响。",
        impactSummary: [editorTitle(activeEditor), "未暂存输入将被清空"],
        confirmLabel: "放弃并关闭",
        cancelLabel: "继续编辑",
        tone: "destructive",
      });
      if (!confirmed) return;
    }
    setActiveEditor(null);
    setEditorDirty(false);
  }

  function removeLocalDraftCells(predicate: (cell: DraftCellOverlay) => boolean) {
    setLocalDraftCells((current) =>
      Object.fromEntries(Object.entries(current).filter(([, cell]) => !predicate(cell)))
    );
  }

  function selectChangeSet(changeSetId: number | undefined) {
    setSelectedChangeSetId(changeSetId);
    setDetailEntriesPage(1);
  }

  function invalidateStatsQueries() {
    queryClient.invalidateQueries({ queryKey: ["schema-stats-summary", schemaId] });
    queryClient.invalidateQueries({ queryKey: ["schema-stats-distribution", schemaId] });
    queryClient.invalidateQueries({ queryKey: ["schema-stats-trend", schemaId] });
    queryClient.invalidateQueries({ queryKey: ["schema-stats-flow", schemaId] });
  }

  if (recordsQuery.isLoading) return <LoadingState fullScreen label="加载视图中" />;
  if (recordsQuery.isError)
    return (
      <ErrorState
        fullScreen
        title="数据视图加载失败"
        error={recordsQuery.error}
        onRetry={() => recordsQuery.refetch()}
      />
    );
  if (!view || !schema) return <EmptyState fullScreen title="表不存在或无权限" />;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid w-full min-w-0 max-w-[1600px] gap-5 overflow-hidden px-4 py-6 sm:px-6">
        <section className="nd-interactive-surface flex flex-col gap-4 border border-border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-3xl font-semibold tracking-tight">
                {schema.name}
              </h1>
              {schema.role && <PermissionTag role={schema.role} />}
              <PermissionTag visibility={schema.visibility} />
              <TimePointIndicator kind={timeKind} date={at} size="md" />
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{schema.schema_code}</span>
              <span>结构版本 v{view.schema_version}</span>
              <span>{visibleFields.length}/{userFields.length} 字段</span>
              <span>负责人 {schema.owner.username}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton to={`/schemas/${schema.id}/settings`} label="表设置" />
            <LinkButton to={flowBoardTo} label="Flow Board" />
            <LinkButton to={snapshotDiffTo} label="Snapshot Diff" />
            <ActionButton
              icon={PanelRightOpen}
              label="工作台"
              active={schemaWorkbenchOpen}
              onClick={() => setSchemaWorkbenchOpen((current) => !current)}
              aria-haspopup="dialog"
              aria-expanded={schemaWorkbenchOpen}
              data-testid="open-schema-workbench"
            />
            {canEdit && (
              <>
                <NewRecordButton
                  open={activeEditor === "create"}
                  onClick={() => void handleEditorToggle("create")}
                />
                <TogglePanelButton
                  open={activeEditor === "bulk"}
                  onClick={() => void handleEditorToggle("bulk")}
                />
                <button
                  type="button"
                  data-testid="open-import-editor"
                  onClick={() => void handleEditorToggle("import")}
                  aria-haspopup="dialog"
                  aria-expanded={activeEditor === "import"}
                  className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  <FileSpreadsheet className="size-4" aria-hidden />
                  {activeEditor === "import" ? "关闭导入" : "导入 Excel"}
                </button>
                {!retro && timeKind === "now" && (
                  <button
                    type="button"
                    data-testid="open-label-batch-editor"
                    onClick={() => void handleEditorToggle("labels")}
                    aria-haspopup="dialog"
                    aria-expanded={activeEditor === "labels"}
                    className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
                  >
                    <Tags className="size-4" aria-hidden />
                    {activeEditor === "labels" ? "关闭贴标" : "批量贴标"}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => recordsQuery.refetch()}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              <RefreshCw className={cn("size-4", recordsQuery.isFetching && "animate-spin")} />
              刷新
            </button>
          </div>
        </section>

        <section className="grid min-w-0 gap-3">
          <div className="font-display text-sm font-semibold">视图状态</div>
          <MetricGrid>
            <DataMetric
              label="筛选结果"
              value={String(view.count)}
              hint={search.trim() || filters.length > 0 ? "含当前筛选" : "当前快照"}
              tone="info"
              emphasis
            />
            <DataMetric label="本页行数" value={String(gridRecords.length)} hint="含草稿行" />
            <DataMetric
              label="批次总数"
              value={String(changesetsQuery.data?.count ?? 0)}
              tone="info"
            />
            <DataMetric
              label="草稿单元格"
              value={String(visibleDraftCount)}
              hint="当前日期"
              tone="warning"
            />
          </MetricGrid>
        </section>
        <SchemaStatsPanel
          schemaId={schema.id}
          schemaCode={schema.schema_code}
          schemaRole={schema.role}
          schemaVersion={view.schema_version}
          userId={currentUser?.id}
          at={at}
          retro={retro}
          search={search}
          ordering={ordering}
          changeSetId={batchScopeChangeSetId}
          filters={filters}
          fields={userFields}
          visibleFields={visibleFields}
          currentPageEntityIds={currentPageEntityIds}
          selectedEntityIds={effectiveSelectedEntityIds}
          exportCsvTo={exportCsvTo}
          exportExcelTo={exportExcelTo}
          exportCenterTo={exportExcelTo}
        />

        {timeKind === "future" && (
          <InfoNotificationBanner
            notification={{
              id: "current-view-future",
              kind: "info",
              title: "未来预期视图",
              message: "这里只展示已经登记的未来生效变更，当前快照保持只读。",
              sticky: true,
            }}
          />
        )}
        {retro && (
          <InfoNotificationBanner
            notification={{
              id: "current-view-retro",
              kind: "info",
              title: "回溯视图",
              message: "当前处于历史时点回溯模式，单元格编辑会被锁定。",
              sticky: true,
            }}
          />
        )}
        {draftOverlayQuery.isError && (
          <InfoNotificationBanner
            notification={{
              id: "current-view-draft-overlay-error",
              kind: "info",
              title: "草稿标记加载失败",
              message: "主表已显示当前快照，但草稿单元格和草稿新增行暂未叠加。",
              action: {
                label: "重试",
                onClick: () => void draftOverlayQuery.refetch(),
              },
              sticky: true,
            }}
          />
        )}
        <TimelineScrubber
          at={at}
          changesets={timelineChangesets}
          onChange={(value) => {
            if (value === at) return;
            setSelectedEntityIds([]);
            setAt(value);
          }}
        />

        <section
          className={cn(
            "grid min-w-0 max-w-full gap-3 overflow-hidden xl:items-start",
            changeInspectorCollapsed
              ? "xl:grid-cols-[minmax(0,1fr)_56px]"
              : "xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]"
          )}
        >
          <div className="min-w-0 max-w-full overflow-hidden border border-border bg-background">
            <Toolbar
              retro={retro}
              searchInput={searchInput}
              pageSize={pageSize}
              density={gridDensity}
              fields={userFields}
              filters={filters}
              schemaRole={schema.role}
              identityFieldKey={schema.identity_field_key}
              hiddenFields={hiddenFields}
              batchScope={
                batchScopeChangeSetId
                  ? { id: batchScopeChangeSetId, summary: batchScopeSummary }
                  : undefined
              }
              onRetroChange={(value) => {
                setSelectedEntityIds([]);
                setRetro(value);
                setPage(1);
              }}
              onSearchInputChange={setSearchInput}
              onSearchSubmit={() => {
                setSelectedEntityIds([]);
                setSearch(searchInput.trim());
                setPage(1);
              }}
              onPageSizeChange={(value) => {
                setSelectedEntityIds([]);
                setPageSize(value);
                setPage(1);
              }}
              onDensityChange={setGridDensity}
              onFiltersChange={handleFiltersChange}
              onToggleField={(key) =>
                setHiddenFields((current) => ({ ...current, [key]: !current[key] }))
              }
              onApplyColumnPreset={handleApplyColumnPreset}
              onResetFields={() => setHiddenFields({})}
              onClearBatchScope={clearBatchScope}
              onCopyRows={() => copyRows(gridRecords, visibleFields)}
            />
            {effectiveSelectedEntityIds.length > 0 && (
              <div
                data-testid="current-grid-selection-summary"
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2 text-xs"
              >
                <span className="font-medium text-foreground">
                  已选 {effectiveSelectedEntityIds.length.toLocaleString()} 行
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedEntityIds([])}
                  className="text-muted-foreground hover:text-foreground"
                >
                  清空选择
                </button>
              </div>
            )}
            <CurrentGrid
              key={at}
              schemaId={schema.id}
              records={gridRecords}
              fields={visibleFields}
              sorting={sorting}
              onSortingChange={(next) => {
                setSelectedEntityIds([]);
                setSorting(next);
                setPage(1);
              }}
              currentSchemaVersion={view.schema_version}
              at={at}
              editable={canEdit && !retro && timeKind === "now"}
              density={gridDensity}
              columnWidths={persistedColumnWidths}
              draftCells={draftCells}
              commentSummary={commentSummaryQuery.data}
              locateTarget={locateTarget}
              selectedEntityIds={effectiveSelectedEntityIds}
              onColumnWidthChange={(columnId, width) =>
                setColumnWidths((current) => ({ ...current, [columnId]: width }))
              }
              onSelectedEntityIdsChange={(ids) => setSelectedEntityIds(uniqueEntityIds(ids))}
              onCellEdit={(record, field, value) => editMutation.mutate({ record, field, value, at })}
              onPasteCells={(changes) => void handlePasteCells(changes)}
              onOpenEntity={handleInspectEntity}
              onOpenComments={setCommentAnchor}
              onOpenMarkdownPreview={setMarkdownPreview}
              onOpenFilePreview={setFilePreview}
              onLocateResult={handleGridLocateResult}
            />
            <PaginationBar
              page={page}
              totalPages={Math.max(view.total_pages, 1)}
              count={view.count}
              onPage={(nextPage) => {
                setSelectedEntityIds([]);
                setPage(nextPage);
              }}
            />
          </div>
          <ChangeStreamPanel
            schemaId={schema.id}
            changesets={changesets}
            detail={detailQuery.data}
            loading={changesetsQuery.isFetching || detailQuery.isFetching}
            detailEntriesLoading={detailQuery.isFetching}
            page={changesetsQuery.data?.page ?? changesetPage}
            totalPages={Math.max(changesetsQuery.data?.total_pages ?? 1, 1)}
            totalCount={changesetsQuery.data?.count ?? 0}
            filters={changeStreamFilters}
            activeTab={inspectorTab}
            selectedId={selectedChangeSetId}
            selectedEntityId={inspectedEntityId}
            fieldLabels={fieldLabels}
            fieldTypes={fieldTypes}
            collapsed={changeInspectorCollapsed}
            currentUserId={currentUser?.id}
            canEdit={canEdit}
            approverChoices={approverChoices}
            actionLoading={changeActionMutation.isPending}
            onlyCurrentBatchActive={batchScopeChangeSetId === detailQuery.data?.id}
            onSelect={selectChangeSet}
            onTabChange={setInspectorTab}
            onPage={setChangesetPage}
            onDetailEntriesPage={setDetailEntriesPage}
            onFiltersChange={(patch) => {
              setChangeStreamFilters((current) => ({ ...current, ...patch }));
              setChangesetPage(1);
            }}
            onToggleCurrentBatch={handleToggleBatchScope}
            onLocateEntry={handleLocateEntry}
            onOpenEntityDrawer={setDrawerEntityId}
            onSubmit={(changeSetId, payload) =>
              void handleChangeAction({ type: "submit", changeSetId, payload })
            }
            onApprove={(changeSetId) =>
              void handleChangeAction({ type: "approve", changeSetId })
            }
            onReject={(changeSetId, payload) =>
              void handleChangeAction({ type: "reject", changeSetId, payload })
            }
            onRevert={(changeSetId) =>
              void handleChangeAction({ type: "revert", changeSetId })
            }
            entryActionLoading={deleteEntryMutation.isPending || discardDraftMutation.isPending}
            onCollapsedChange={setChangeInspectorCollapsed}
            onDeleteEntry={(changeSetId, entryId) => void handleDeleteEntry(changeSetId, entryId)}
            onDiscardDraft={(changeSetId) => void handleDiscardDraft(changeSetId)}
          />
        </section>
      </main>
      <CurrentViewDrawer
        open={canEdit && activeEditor !== null}
        title={editorTitle(activeEditor)}
        description={editorDescription(activeEditor)}
        meta={editorDirty ? "未暂存" : "草稿编辑"}
        testId="current-edit-drawer"
        closeTestId="current-edit-drawer-close"
        onRequestClose={() => void requestEditorClose()}
      >
        {activeEditor === "create" && (
          <SingleRecordCreatePanel
            schemaId={schema.id}
            at={at}
            fields={userFields}
            records={gridRecords}
            identityFieldKey={schema.identity_field_key}
            identityMode={schema.identity_mode}
            identityFieldKeys={schema.identity_field_keys}
            onDirtyChange={setEditorDirty}
            onCreated={(id) => {
              selectChangeSet(id);
              setInspectorTab("detail");
              queryClient.invalidateQueries({ queryKey: ["schema-records"] });
              queryClient.invalidateQueries({ queryKey: ["schema-draft-overlay", schemaId] });
              queryClient.invalidateQueries({ queryKey: ["schema-changesets", schemaId] });
              queryClient.invalidateQueries({ queryKey: ["schema-changeset", schemaId, id] });
              invalidateStatsQueries();
            }}
          />
        )}
        {activeEditor === "bulk" && (
          <BulkChangeSetPanel
            schemaId={schema.id}
            at={at}
            fields={userFields}
            records={view.results}
            identityFieldKey={schema.identity_field_key}
            identityMode={schema.identity_mode}
            identityFieldKeys={schema.identity_field_keys}
            onDirtyChange={setEditorDirty}
            onDraftReady={(id) => {
              selectChangeSet(id);
              setInspectorTab("detail");
              queryClient.invalidateQueries({ queryKey: ["schema-records"] });
              queryClient.invalidateQueries({ queryKey: ["schema-draft-overlay", schemaId] });
              queryClient.invalidateQueries({ queryKey: ["schema-changesets", schemaId] });
              queryClient.invalidateQueries({ queryKey: ["schema-changeset", schemaId, id] });
              invalidateStatsQueries();
            }}
          />
        )}
        {activeEditor === "import" && (
          <ImportWizard
            schemaId={schema.id}
            schemaCode={schema.schema_code}
            at={at}
            fields={userFields}
            onDirtyChange={setEditorDirty}
            onImported={(id) => {
              selectChangeSet(id);
              setInspectorTab("detail");
              queryClient.invalidateQueries({ queryKey: ["schema-records"] });
              queryClient.invalidateQueries({ queryKey: ["schema-draft-overlay", schemaId] });
              queryClient.invalidateQueries({ queryKey: ["schema-changesets", schemaId] });
              queryClient.invalidateQueries({ queryKey: ["schema-changeset", schemaId, id] });
              invalidateStatsQueries();
            }}
          />
        )}
        {activeEditor === "labels" && (
          <SchemaLabelBatchPanel
            schema={schema}
            records={view.results}
          />
        )}
      </CurrentViewDrawer>
      <SchemaWorkbenchDrawer
        schemaId={schema.id}
        schemaCode={schema.schema_code}
        schemaName={schema.name}
        open={schemaWorkbenchOpen}
        onClose={() => setSchemaWorkbenchOpen(false)}
      />
      <CommentThreadDrawer
        open={commentAnchor !== null}
        anchor={commentAnchor}
        collaborators={collaboratorsQuery.data ?? []}
        canMutateStatuses={canEdit}
        onClose={() => setCommentAnchor(null)}
      />
      <MarkdownPreviewDrawer target={markdownPreview} onClose={() => setMarkdownPreview(null)} />
      <FilePreviewDrawer target={filePreview} onClose={() => setFilePreview(null)} />
      <EntityTimelineDrawer entityId={drawerEntityId} onClose={() => setDrawerEntityId(null)} />
    </div>
  );
}

type ActiveEditor = "create" | "bulk" | "import" | "labels" | null;
type BatchScope = { changeSetId: number; returnPage: number } | null;
type LocateQuerySnapshot = {
  at: string;
  retro: boolean;
  search: string;
  filters: CurrentViewFilter[];
  ordering: string;
  page: number;
  pageSize: number;
  changeSetId?: number;
};
type LocateMutationVars = {
  target: GridLocateTarget;
  query: LocateQuerySnapshot;
};

type CommentRouteTarget =
  | {
      threadId: number;
      anchorType: "row";
      entityId: number;
    }
  | {
      threadId: number;
      anchorType: "cell";
      entityId: number;
      fieldKey: string;
    };

type ChangeActionRequest =
  | { type: "submit"; changeSetId: number; payload: { summary: string; approver_id?: number } }
  | { type: "approve"; changeSetId: number }
  | { type: "reject"; changeSetId: number; payload: { reason: string } }
  | { type: "revert"; changeSetId: number };

const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TRUE_QUERY_VALUES = new Set(["1", "true", "yes", "on"]);

function normalizeAtQueryValue(value: string | null) {
  if (!value || !YYYY_MM_DD_PATTERN.test(value)) return todayInputValue();
  const [year, month, day] = value.split("-").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return todayInputValue();
  }
  return value;
}

function parseBooleanQueryValue(value: string | null) {
  return value !== null && TRUE_QUERY_VALUES.has(value.trim().toLowerCase());
}

function parsePositiveIntQueryValue(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseCommentRouteTarget(searchParams: URLSearchParams): CommentRouteTarget | null {
  const threadId = parsePositiveIntQueryValue(searchParams.get("comment_thread"));
  const entityId = parsePositiveIntQueryValue(searchParams.get("entity_id"));
  const anchorType = searchParams.get("comment_anchor");
  if (!threadId || !entityId) return null;
  if (anchorType === "row") return { threadId, anchorType, entityId };
  if (anchorType !== "cell") return null;
  const fieldKey = (searchParams.get("field_key") ?? "").trim();
  return fieldKey ? { threadId, anchorType, entityId, fieldKey } : null;
}

function commentRouteTargetToKey(target: CommentRouteTarget | null) {
  if (!target) return "";
  const fieldKey = target.anchorType === "cell" ? target.fieldKey : "";
  return [target.threadId, target.anchorType, target.entityId, fieldKey].join(":");
}

function buildCommentRouteAnchor(input: {
  target: CommentRouteTarget;
  schemaId: number;
  record: CurrentViewRecord;
  fields: FieldConfig[];
  contextDate: string;
}): CommentAnchor | null {
  const target = input.target;
  const displayCode = recordDisplayCode(input.record);
  if (target.anchorType === "row") {
    return {
      anchorType: "row",
      schemaId: input.schemaId,
      entityId: target.entityId,
      displayCode,
    };
  }
  const field = input.fields.find((item) => item.key === target.fieldKey);
  if (!field) return null;
  return {
    anchorType: "cell",
    schemaId: input.schemaId,
    entityId: target.entityId,
    displayCode,
    fieldKey: field.key,
    fieldLabel: field.label,
    recordId: input.record.record_id,
    contextDate: input.contextDate,
    value: input.record.data_payload[field.key],
  };
}

function parseFiltersQueryValue(value: string | null): CurrentViewFilter[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCurrentViewFilter);
  } catch {
    return [];
  }
}

function isCurrentViewFilter(value: unknown): value is CurrentViewFilter {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.field === "string" && typeof record.operator === "string";
}

function runChangeAction(vars: ChangeActionRequest) {
  if (vars.type === "submit") return submitChangeSet(vars.changeSetId, vars.payload);
  if (vars.type === "approve") return approveChangeSet(vars.changeSetId);
  if (vars.type === "reject") return rejectChangeSet(vars.changeSetId, vars.payload);
  return revertChangeSet(vars.changeSetId);
}

function changeActionConfirmOptions(
  vars: ChangeActionRequest,
  detailSummary?: string
): ConfirmOptions {
  const impactSummary = [`批次 #${vars.changeSetId}`];
  const summary = vars.type === "submit" ? vars.payload.summary : detailSummary;
  if (summary) impactSummary.push(`摘要：${summary}`);

  if (vars.type === "submit") {
    return {
      title: "确认提交变更批次",
      description: "提交后，该批次会进入审批流程或按规则直接生效。",
      impactSummary,
      confirmLabel: "确认提交",
      cancelLabel: "取消",
    };
  }
  if (vars.type === "approve") {
    return {
      title: "确认通过审批",
      description: "通过后，该批次会按当前审批规则继续流转或生效。",
      impactSummary,
      confirmLabel: "确认通过",
      cancelLabel: "取消",
    };
  }
  if (vars.type === "reject") {
    return {
      title: "确认驳回变更批次",
      description: "驳回后，该批次会退回给提交人继续调整。",
      impactSummary: [...impactSummary, `驳回原因：${vars.payload.reason.trim()}`],
      confirmLabel: "确认驳回",
      cancelLabel: "取消",
      tone: "destructive",
    };
  }
  return {
    title: "确认回滚已生效批次",
    description: "回滚会撤销该批次已应用的变更，并保留审计记录。",
    impactSummary,
    confirmLabel: "确认回滚",
    cancelLabel: "取消",
    tone: "destructive",
  };
}

function changeActionSuccessTitle(type: ChangeActionRequest["type"], status: string) {
  if (type === "submit") return status === "applied" ? "变更已生效" : "变更已提交";
  if (type === "approve") return status === "applied" ? "审批已通过并生效" : "审批已通过";
  if (type === "reject") return "变更已驳回";
  return "变更已回滚";
}

function changeActionErrorTitle(type: ChangeActionRequest["type"]) {
  if (type === "submit") return "提交变更失败";
  if (type === "approve") return "审批变更失败";
  if (type === "reject") return "驳回变更失败";
  return "回滚变更失败";
}

function locateUnsupportedMessage(reason?: string) {
  if (reason === "search_scope_not_supported") {
    return "当前搜索结果暂不支持自动跨页定位，请清除搜索后重试。";
  }
  if (reason === "change_set_scope_not_supported") {
    return "仅看本批范围暂不支持自动跨页定位，可清除仅看本批后重试。";
  }
  if (reason === "filters_scope_not_supported") {
    return "结构化筛选结果暂不支持自动跨页定位，请清除字段筛选后重试。";
  }
  if (reason === "ordering_not_supported") {
    return "当前排序暂不支持自动跨页定位，请改用实体编号或元字段排序。";
  }
  return "当前查询条件暂不支持自动跨页定位。";
}

function changesetListParamsFromFilters(
  page: number,
  filters: ChangeStreamFilters,
  currentUserId?: number
): ChangeSetListParams {
  return {
    page,
    page_size: 20,
    status: filters.status,
    created_by: filters.createdBy === "mine" ? currentUserId : undefined,
    created_from: filters.createdFrom,
    created_to: filters.createdTo,
  };
}

function scopedDraftOverlayCells(
  cells: DraftOverlayCell[],
  batchScopeChangeSetId: number | undefined
) {
  if (!batchScopeChangeSetId) return cells;
  return cells.filter((cell) => cell.change_set_id === batchScopeChangeSetId);
}

function scopedDraftOverlayRows(
  rows: CurrentViewRecord[],
  batchScopeChangeSetId: number | undefined
) {
  if (!batchScopeChangeSetId) return rows;
  return rows.filter((row) => row.change_set_id === batchScopeChangeSetId);
}

function pasteImpactSummary(changes: PasteCellChange[]) {
  const records = new Set(changes.map((change) => recordDisplayCode(change.record)));
  const fields = new Set(changes.map((change) => change.field.label));
  const first = changes[0];
  return [
    `单元格：${changes.length}`,
    `记录：${records.size} 条`,
    `字段：${fields.size} 个`,
    first
      ? `示例：${recordDisplayCode(first.record)} / ${first.field.label} = ${String(first.value ?? "")}`
      : "无可写入单元格",
  ];
}

function uniqueEntityIds(values: number[]) {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function editorTitle(editor: ActiveEditor) {
  if (editor === "create") return "新增记录";
  if (editor === "bulk") return "批量登记";
  if (editor === "import") return "导入 Excel";
  if (editor === "labels") return "批量贴标";
  return "记录编辑";
}

function editorDescription(editor: ActiveEditor) {
  if (editor === "create") return "适合单条录入；确认后写入草稿，不会立刻改变已生效数据。";
  if (editor === "bulk") return "新增、修改和终止会先展示复核信息，确认后写入草稿变更批次。";
  if (editor === "import") return "下载模板、上传预览，确认后生成草稿变更批次。";
  if (editor === "labels") return "选择当前页实体，生成物理标签并下载 A4 SVG。";
  return "选择一个编辑动作后，表单会在这里打开。";
}
