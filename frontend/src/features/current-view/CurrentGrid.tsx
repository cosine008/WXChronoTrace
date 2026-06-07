import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
  type UIEvent,
} from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type { CommentSummaryResponse } from "@/api/comments";
import type { CurrentViewRecord, FieldConfig } from "@/api/schemas";
import { EntityIdChip, RowStatusStripe, ValidityRange } from "@/components/badges";
import { CommentBadge } from "@/features/comments/CommentBadge";
import type { CommentAnchor } from "@/features/comments/commentAnchors";
import { cn } from "@/lib/utils";
import { type DraftCellMap, draftCellKey } from "./currentViewDrafts";
import {
  FIELD_PREFIX,
  coerceEditValue,
  recordDisplayCode,
  stringifyCell,
} from "./currentViewUtils";
import { EditableCell } from "./CurrentGridCell";
import {
  GRID_COLUMN_MAX_WIDTH,
  GRID_COLUMN_MIN_WIDTH,
  GRID_META_COLUMNS,
  buildGridColumnSizing,
  clampGridColumnWidth,
  fieldColumnId,
  gridColumnWidthById,
  type GridColumnSizing,
  type GridColumnWidthMap,
} from "./currentGridColumns";
import {
  type GridDensity,
  gridDensityCellPadding,
  gridDensityRowHeight,
  gridDensityViewportHeight,
} from "./currentGridDensity";
import type { MarkdownPreviewTarget } from "./markdownPreview";
import type { FilePreviewTarget } from "./filePreview";

type CellRef = { rowIndex: number; fieldIndex: number } | null;
type ResizeDrag = { columnId: string; pointerId: number; startX: number; startWidth: number };
type LocateRun = { requestId: number; fieldKey: string; records: CurrentViewRecord[] };

export interface GridLocateTarget {
  entityId: number;
  fieldKey?: string;
  changeSetId?: number;
  requestId: number;
}

export interface GridLocateResult {
  target: GridLocateTarget;
  found: boolean;
  fieldVisible: boolean;
}

export interface PasteCellChange {
  record: CurrentViewRecord;
  field: FieldConfig;
  value: unknown;
  raw: string;
}

interface Props {
  schemaId: number;
  records: CurrentViewRecord[];
  fields: FieldConfig[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  currentSchemaVersion: number;
  at: string;
  editable: boolean;
  density: GridDensity;
  columnWidths: GridColumnWidthMap;
  draftCells: DraftCellMap;
  commentSummary?: CommentSummaryResponse;
  locateTarget?: GridLocateTarget | null;
  selectedEntityIds: number[];
  onColumnWidthChange: (columnId: string, width: number) => void;
  onSelectedEntityIdsChange: (entityIds: number[]) => void;
  onCellEdit: (record: CurrentViewRecord, field: FieldConfig, value: unknown) => void;
  onPasteCells: (changes: PasteCellChange[]) => void;
  onOpenEntity: (entityId: number) => void;
  onOpenComments?: (anchor: CommentAnchor) => void;
  onOpenMarkdownPreview?: (target: MarkdownPreviewTarget) => void;
  onOpenFilePreview?: (target: FilePreviewTarget) => void;
  onLocateResult?: (result: GridLocateResult) => void;
}

export function CurrentGrid(props: Props) {
  const {
    schemaId,
    records,
    fields,
    sorting,
    onSortingChange,
    currentSchemaVersion,
    at,
    editable,
    density,
    columnWidths,
    draftCells,
    commentSummary,
    locateTarget,
    selectedEntityIds,
    onColumnWidthChange,
    onSelectedEntityIdsChange,
    onCellEdit,
    onOpenEntity,
    onOpenComments,
    onOpenMarkdownPreview,
    onOpenFilePreview,
    onLocateResult,
  } = props;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastLocateRunRef = useRef<LocateRun | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const pendingScrollTopRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<CellRef>(null);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const selectedEntityIdSet = useMemo(
    () => new Set(selectedEntityIds),
    [selectedEntityIds]
  );
  const pageEntityIds = useMemo(
    () => uniqueEntityIds(records.map((record) => record.entity_id)),
    [records]
  );
  const selectedPageCount = useMemo(
    () => pageEntityIds.filter((entityId) => selectedEntityIdSet.has(entityId)).length,
    [pageEntityIds, selectedEntityIdSet]
  );
  const allPageRowsSelected = pageEntityIds.length > 0 && selectedPageCount === pageEntityIds.length;
  const somePageRowsSelected = selectedPageCount > 0 && !allPageRowsSelected;
  const togglePageRows = useCallback(() => {
    if (allPageRowsSelected) {
      const pageIds = new Set(pageEntityIds);
      onSelectedEntityIdsChange(selectedEntityIds.filter((entityId) => !pageIds.has(entityId)));
      return;
    }
    onSelectedEntityIdsChange(uniqueEntityIds([...selectedEntityIds, ...pageEntityIds]));
  }, [allPageRowsSelected, onSelectedEntityIdsChange, pageEntityIds, selectedEntityIds]);
  const toggleEntityRow = useCallback(
    (entityId: number) => {
      if (selectedEntityIdSet.has(entityId)) {
        onSelectedEntityIdsChange(selectedEntityIds.filter((id) => id !== entityId));
        return;
      }
      onSelectedEntityIdsChange([...selectedEntityIds, entityId]);
    },
    [onSelectedEntityIdsChange, selectedEntityIdSet, selectedEntityIds]
  );
  const columns = useMemo(
    () =>
      buildColumns(fields, currentSchemaVersion, {
        schemaId,
        at,
        draftCells,
        commentSummary,
        editable,
        density,
        editing,
        selected,
        selectedEntityIdSet,
        allPageRowsSelected,
        somePageRowsSelected,
        setEditing,
        setSelected,
        onTogglePageRows: togglePageRows,
        onToggleEntityRow: toggleEntityRow,
        onCellEdit,
        onOpenEntity,
        onOpenComments,
        onOpenMarkdownPreview,
        onOpenFilePreview,
      }),
    [
      at,
      currentSchemaVersion,
      density,
      draftCells,
      editable,
      editing,
      fields,
      schemaId,
      commentSummary,
      onCellEdit,
      onOpenEntity,
      onOpenComments,
      onOpenFilePreview,
      onOpenMarkdownPreview,
      selected,
      selectedEntityIdSet,
      allPageRowsSelected,
      somePageRowsSelected,
      toggleEntityRow,
      togglePageRows,
    ]
  );
  // TanStack Table exposes non-memoizable handlers; this component keeps table state local.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: records,
    columns,
    state: { sorting },
    manualSorting: true,
    onSortingChange: (updater) =>
      onSortingChange(typeof updater === "function" ? updater(sorting) : updater),
    getCoreRowModel: getCoreRowModel(),
  });
  const rows = table.getRowModel().rows;
  const rowHeight = gridDensityRowHeight(density);
  const viewportHeight = gridDensityViewportHeight(density);
  const totalHeight = rows.length * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const end = Math.min(rows.length, start + Math.ceil(viewportHeight / rowHeight) + 12);
  const visibleRows = useMemo(() => rows.slice(start, end), [end, rows, start]);
  const locatedEntityId = locateTarget?.entityId;
  const locatedFieldId = locateTarget?.fieldKey
    ? `${FIELD_PREFIX}${locateTarget.fieldKey}`
    : null;
  const gridColumns = useMemo(
    () => buildGridColumnSizing(fields, columnWidths),
    [columnWidths, fields]
  );
  const widthsById = useMemo(() => gridColumnWidthById(gridColumns), [gridColumns]);
  const tableWidth = useMemo(
    () => gridColumns.reduce((total, column) => total + column.width, 0),
    [gridColumns]
  );
  const selectionColumnWidth = widthsById[GRID_META_COLUMNS.selection] ?? 44;
  const entityColumnWidth = widthsById[GRID_META_COLUMNS.entity] ?? 144;

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollTop((current) =>
        current === pendingScrollTopRef.current ? current : pendingScrollTopRef.current
      );
    });
  }, []);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const target = locateTarget;
    if (!target) return;
    const fieldKey = target.fieldKey ?? "";
    const lastRun = lastLocateRunRef.current;
    if (
      lastRun?.requestId === target.requestId &&
      lastRun.fieldKey === fieldKey &&
      lastRun.records === records
    ) {
      return;
    }
    lastLocateRunRef.current = { requestId: target.requestId, fieldKey, records };

    const rowIndex = records.findIndex((record) => record.entity_id === target.entityId);
    if (rowIndex < 0) {
      onLocateResult?.({ target, found: false, fieldVisible: false });
      return;
    }

    const fieldIndex = target.fieldKey
      ? fields.findIndex((field) => field.key === target.fieldKey)
      : -1;
    const nextScrollTop = Math.max(0, rowIndex * rowHeight - rowHeight * 2);
    setScrollTop(nextScrollTop);
    scrollerRef.current?.scrollTo({ top: nextScrollTop, behavior: "smooth" });
    if (fieldIndex >= 0) setSelected({ rowIndex, fieldIndex });
    onLocateResult?.({
      target,
      found: true,
      fieldVisible: !target.fieldKey || fieldIndex >= 0,
    });
  }, [fields, locateTarget, onLocateResult, records, rowHeight]);

  return (
    <div
      ref={scrollerRef}
      className="relative w-full max-w-full overflow-auto overscroll-x-contain"
      style={{ maxHeight: viewportHeight }}
      data-virtualized="true"
      data-rendered-rows={visibleRows.length}
      data-total-rows={rows.length}
      onScroll={handleScroll}
      onPaste={(event) => handlePaste(event, selected, props)}
    >
      <table
        className="border-collapse text-left text-sm"
        style={{ minWidth: tableWidth, tableLayout: "fixed", width: tableWidth }}
        aria-rowcount={rows.length}
      >
        <colgroup>
          {gridColumns.map((column) => (
            <col key={column.id} style={{ width: column.width, minWidth: column.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-[3] bg-muted text-sm font-semibold text-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const columnWidth = widthsById[header.column.id] ?? header.getSize();
                return (
                  <th
                    key={header.id}
                    className={headerClass(header.column.id)}
                    style={columnStyle(
                      header.column.id,
                      columnWidth,
                      selectionColumnWidth,
                      entityColumnWidth
                    )}
                  >
                    {header.isPlaceholder ? null : (
                      header.column.id === GRID_META_COLUMNS.selection ? (
                        <div className="grid h-full place-items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            aria-label={`按 ${String(header.column.columnDef.header)} 排序`}
                            className="inline-flex w-full min-w-0 items-center gap-1 pr-2 text-left hover:text-foreground"
                          >
                            <span className="min-w-0 truncate">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            <SortMark state={header.column.getIsSorted()} />
                          </button>
                          <ColumnResizeHandle
                            columnId={header.column.id}
                            label={String(header.column.columnDef.header)}
                            width={columnWidth}
                            active={resizingColumnId === header.column.id}
                            onStart={startColumnResize}
                            onMove={moveColumnResize}
                            onEnd={endColumnResize}
                            onStep={onColumnWidthChange}
                          />
                        </>
                      )
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody style={{ height: rows.length > 0 ? totalHeight : undefined }}>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={table.getAllColumns().length} className="h-44 px-3 text-center text-sm text-muted-foreground">
                当前时间点无记录
              </td>
            </tr>
          ) : (
            <>
              {start > 0 && <SpacerRow height={start * rowHeight} count={table.getAllColumns().length} />}
              {visibleRows.map((row) => (
                <tr
                  key={row.original.entity_id}
                  className={cn(
                    "nd-table-row relative focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-status-info)]",
                    selectedEntityIdSet.has(row.original.entity_id) && "bg-muted/35",
                    row.original.entity_id === locatedEntityId && "nd-located-row"
                  )}
                  aria-selected={selectedEntityIdSet.has(row.original.entity_id)}
                  style={{ height: rowHeight }}
                  onClick={(event) => {
                    if (event.defaultPrevented) return;
                    if (event.target instanceof Element && event.target.closest("button,input,textarea,select")) {
                      return;
                    }
                    onOpenEntity(row.original.entity_id);
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isFirstCell = cell.column.id === "business_code";
                    const isLocatedCell =
                      row.original.entity_id === locatedEntityId && cell.column.id === locatedFieldId;
                    return (
                      <td
                        key={`${row.original.entity_id}:${cell.column.id}`}
                        className={cellClass(cell.column.id, density, isLocatedCell)}
                        style={columnStyle(
                          cell.column.id,
                          widthsById[cell.column.id] ?? cell.column.getSize(),
                          selectionColumnWidth,
                          entityColumnWidth
                        )}
                      >
                        {isFirstCell && row.original.row_status !== "unchanged" && (
                          <RowStatusStripe status={row.original.row_status} />
                        )}
                        <div onClick={() => selectCell(cell.column.id, row.index, fields, setSelected)}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {end < rows.length && <SpacerRow height={(rows.length - end) * rowHeight} count={table.getAllColumns().length} />}
            </>
          )}
        </tbody>
      </table>
    </div>
  );

  function startColumnResize(
    event: PointerEvent<HTMLButtonElement>,
    column: GridColumnSizing
  ) {
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = {
      columnId: column.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: column.width,
    };
    setResizingColumnId(column.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveColumnResize(event: PointerEvent<HTMLButtonElement>) {
    const drag = resizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextWidth = clampGridColumnWidth(drag.startWidth + event.clientX - drag.startX);
    onColumnWidthChange(drag.columnId, nextWidth);
  }

  function endColumnResize(event: PointerEvent<HTMLButtonElement>) {
    const drag = resizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    resizeDragRef.current = null;
    setResizingColumnId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }
}

interface ColumnBuilderContext {
  schemaId: number;
  at: string;
  draftCells: DraftCellMap;
  commentSummary?: CommentSummaryResponse;
  editable: boolean;
  density: GridDensity;
  editing: string | null;
  selected: CellRef;
  selectedEntityIdSet: Set<number>;
  allPageRowsSelected: boolean;
  somePageRowsSelected: boolean;
  setEditing: Dispatch<SetStateAction<string | null>>;
  setSelected: Dispatch<SetStateAction<CellRef>>;
  onTogglePageRows: () => void;
  onToggleEntityRow: (entityId: number) => void;
  onCellEdit: (record: CurrentViewRecord, field: FieldConfig, value: unknown) => void;
  onOpenEntity: (entityId: number) => void;
  onOpenComments?: (anchor: CommentAnchor) => void;
  onOpenMarkdownPreview?: (target: MarkdownPreviewTarget) => void;
  onOpenFilePreview?: (target: FilePreviewTarget) => void;
}

function buildColumns(
  fields: FieldConfig[],
  currentSchemaVersion: number,
  owner: ColumnBuilderContext
): ColumnDef<CurrentViewRecord>[] {
  const meta: ColumnDef<CurrentViewRecord>[] = [
    {
      id: GRID_META_COLUMNS.selection,
      header: () => (
        <SelectionCheckbox
          checked={owner.allPageRowsSelected}
          indeterminate={owner.somePageRowsSelected}
          disabled={false}
          ariaLabel="选择当前页全部记录"
          onChange={owner.onTogglePageRows}
        />
      ),
      cell: ({ row }) => (
        <SelectionCheckbox
          checked={owner.selectedEntityIdSet.has(row.original.entity_id)}
          disabled={false}
          ariaLabel={`选择实体 ${recordDisplayCode(row.original)}`}
          onChange={() => owner.onToggleEntityRow(row.original.entity_id)}
        />
      ),
      enableSorting: false,
    },
    {
      id: "business_code",
      header: "实体",
      accessorFn: recordDisplayCode,
      cell: ({ row }) => {
        const displayCode = recordDisplayCode(row.original);
        const rowSummary = owner.commentSummary?.entities[String(row.original.entity_id)]?.row;
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="open-entity-timeline"
              aria-label={`查看实体 ${displayCode} 生命周期`}
              onClick={() => owner.onOpenEntity(row.original.entity_id)}
            >
              <EntityIdChip code={displayCode} copyable={false} />
            </button>
            {owner.onOpenComments && (
              <CommentBadge
                summary={rowSummary}
                title={`打开 ${displayCode} 行评论`}
                ariaLabel={`打开 ${displayCode} 行评论`}
                onClick={() =>
                  owner.onOpenComments?.({
                    anchorType: "row",
                    schemaId: owner.schemaId,
                    entityId: row.original.entity_id,
                    displayCode,
                  })
                }
              />
            )}
          </div>
        );
      },
    },
    {
      id: "valid_from",
      header: "有效期",
      accessorKey: "valid_from",
      cell: ({ row }) => <ValidityRange from={row.original.valid_from} to={row.original.valid_to} />,
    },
  ];
  const dynamic = fields.map((field, fieldIndex) => ({
    id: fieldColumnId(field.key),
    header: field.label,
    accessorFn: (record: CurrentViewRecord) => record.data_payload[field.key],
    cell: ({ row }: { row: { original: CurrentViewRecord; index: number } }) => {
      const key = draftCellKey(owner.at, row.original.entity_id, field.key);
      const draftCell = owner.draftCells[key];
      const value = draftCell?.value ?? row.original.data_payload[field.key];
      const displayCode = recordDisplayCode(row.original);
      const cellSummary =
        owner.commentSummary?.entities[String(row.original.entity_id)]?.cells[field.key];
      return (
        <EditableCell
          key={`${key}:${owner.editing === key ? "editing" : stringifyCell(value)}`}
          record={row.original}
          field={field}
          value={value}
          selected={owner.selected?.rowIndex === row.index && owner.selected.fieldIndex === fieldIndex}
          editing={owner.editing === key}
          status={draftCell?.status}
          statusMessage={draftCell?.message}
          schemaId={owner.schemaId}
          contextDate={owner.at}
          commentSummary={cellSummary}
          editable={owner.editable}
          density={owner.density}
          onSelect={() => owner.setSelected({ rowIndex: row.index, fieldIndex })}
          onPreview={() =>
            owner.onOpenMarkdownPreview?.({
              record: row.original,
              field,
              value: stringifyCell(value),
            })
          }
          onOpenFilePreview={(asset) =>
            owner.onOpenFilePreview?.({
              record: row.original,
              field,
              asset,
            })
          }
          onOpenComments={
            owner.onOpenComments
              ? () =>
                  owner.onOpenComments?.({
                    anchorType: "cell",
                    schemaId: owner.schemaId,
                    entityId: row.original.entity_id,
                    displayCode,
                    fieldKey: field.key,
                    fieldLabel: field.label,
                    recordId: row.original.record_id,
                    contextDate: owner.at,
                    value,
                  })
              : undefined
          }
          onEdit={() => owner.setEditing(key)}
          onCancel={() => owner.setEditing(null)}
          onSave={(next) => {
            owner.onCellEdit(row.original, field, next);
            owner.setEditing(null);
          }}
        />
      );
    },
  }));
  return [
    ...meta,
    ...dynamic,
    {
      id: "schema_version",
      header: "记录版本",
      accessorKey: "schema_version",
      cell: ({ row }) => (
        <span
          className={cn(
            "font-mono text-xs",
            row.original.schema_version < currentSchemaVersion && "text-muted-foreground"
          )}
        >
          v{row.original.schema_version}
        </span>
      ),
    },
  ];
}

function handlePaste(event: React.ClipboardEvent, selected: CellRef, props: Props) {
  if (!selected || !props.editable) return;
  const text = event.clipboardData.getData("text/plain");
  if (!text) return;
  event.preventDefault();
  const rows = text.replace(/\r/g, "").split("\n").filter((row) => row.length > 0);
  const changes: PasteCellChange[] = [];
  rows.forEach((line, rowOffset) => {
    line.split("\t").forEach((raw, fieldOffset) => {
      const record = props.records[selected.rowIndex + rowOffset];
      const field = props.fields[selected.fieldIndex + fieldOffset];
      if (record && field) {
        changes.push({ record, field, raw, value: coerceEditValue(field, raw) });
      }
    });
  });
  if (changes.length > 0) props.onPasteCells(changes);
}

function selectCell(
  id: string,
  rowIndex: number,
  fields: FieldConfig[],
  setSelected: Dispatch<SetStateAction<CellRef>>
) {
  if (!id.startsWith(FIELD_PREFIX)) return;
  const fieldKey = id.slice(FIELD_PREFIX.length);
  const fieldIndex = fields.findIndex((field) => field.key === fieldKey);
  if (fieldIndex < 0) return;
  setSelected((current) =>
    current?.rowIndex === rowIndex && current.fieldIndex === fieldIndex
      ? current
      : { rowIndex, fieldIndex }
  );
}

function headerClass(id: string) {
  return cn(
    "relative overflow-hidden whitespace-nowrap border-b-2 border-r border-border px-3 py-2.5 font-semibold",
    id === GRID_META_COLUMNS.selection && "sticky z-[5] bg-muted px-0",
    id === GRID_META_COLUMNS.entity && "sticky z-[4] bg-muted",
    id === GRID_META_COLUMNS.validFrom && "sticky z-[4] bg-muted"
  );
}

function cellClass(id: string, density: GridDensity, located = false) {
  return cn(
    "overflow-hidden border-b border-r border-border align-middle leading-tight",
    id === GRID_META_COLUMNS.selection ? "p-0 text-center" : gridDensityCellPadding(density),
    id === GRID_META_COLUMNS.selection && "sticky z-[3] bg-background",
    id === GRID_META_COLUMNS.entity && "sticky z-[2] bg-background",
    id === GRID_META_COLUMNS.validFrom && "sticky z-[2] bg-background",
    located && "nd-located-cell"
  );
}

function columnStyle(
  id: string,
  width: number,
  selectionColumnWidth: number,
  entityColumnWidth: number
): CSSProperties {
  const style: CSSProperties = { width, minWidth: width };
  if (id === GRID_META_COLUMNS.selection) style.left = 0;
  if (id === GRID_META_COLUMNS.entity) style.left = selectionColumnWidth;
  if (id === GRID_META_COLUMNS.validFrom) {
    style.left = selectionColumnWidth + entityColumnWidth;
  }
  return style;
}

function SpacerRow({ height, count }: { height: number; count: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={count} style={{ height }} />
    </tr>
  );
}

function SelectionCheckbox(props: {
  checked: boolean;
  indeterminate?: boolean;
  disabled: boolean;
  ariaLabel: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(props.indeterminate);
  }, [props.indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={props.checked}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      className="size-4 accent-foreground"
      onClick={(event) => event.stopPropagation()}
      onChange={props.onChange}
    />
  );
}

function SortMark({ state }: { state: false | "asc" | "desc" }) {
  if (!state) return <span className="font-mono text-[10px] text-muted-foreground">↕</span>;
  return <span className="font-mono text-[10px] text-foreground">{state === "asc" ? "↑" : "↓"}</span>;
}

function ColumnResizeHandle(props: {
  columnId: string;
  label: string;
  width: number;
  active: boolean;
  onStart: (event: PointerEvent<HTMLButtonElement>, column: GridColumnSizing) => void;
  onMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onStep: (columnId: string, width: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`调整 ${props.label} 列宽`}
      title="拖拽调整列宽"
      className={cn(
        "absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none border-0 bg-transparent p-0",
        "after:absolute after:right-[3px] after:top-1 after:h-[calc(100%-0.5rem)] after:w-px after:bg-border",
        "hover:after:bg-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground focus-visible:after:bg-foreground",
        props.active && "after:bg-foreground"
      )}
      onClick={(event) => event.preventDefault()}
      onPointerDown={(event) =>
        props.onStart(event, { id: props.columnId, width: props.width })
      }
      onPointerMove={props.onMove}
      onPointerUp={props.onEnd}
      onPointerCancel={props.onEnd}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 32 : 16;
        const delta = event.key === "ArrowRight" ? step : -step;
        props.onStep(props.columnId, clampGridColumnWidth(props.width + delta));
      }}
    >
      <span className="sr-only">
        当前 {props.label} 列宽 {props.width} 像素，可在 {GRID_COLUMN_MIN_WIDTH} 到{" "}
        {GRID_COLUMN_MAX_WIDTH} 像素之间调整
      </span>
    </button>
  );
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
