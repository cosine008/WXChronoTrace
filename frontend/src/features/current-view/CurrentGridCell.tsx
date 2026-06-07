import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { AlertCircle, Check, Loader2, PencilLine, X } from "lucide-react";

import type { CommentSummaryCount } from "@/api/comments";
import type { CurrentViewRecord, FieldConfig, FieldFileAsset } from "@/api/schemas";
import { MaskedValue } from "@/components/badges";
import { CommentBadge } from "@/features/comments/CommentBadge";
import type { CellCommentAnchor } from "@/features/comments/commentAnchors";
import { cn } from "@/lib/utils";
import { type DraftCellStatus } from "./currentViewDrafts";
import { stringifyCell } from "./currentViewUtils";
import { FieldValueInput } from "./FieldValueInput";
import { FieldValueDisplay } from "./FieldValueDisplay";
import { type GridDensity, gridDensityValueClamp } from "./currentGridDensity";

export function EditableCell(props: {
  record: CurrentViewRecord;
  field: FieldConfig;
  value: unknown;
  selected: boolean;
  editing: boolean;
  status?: DraftCellStatus;
  statusMessage?: string;
  schemaId: number;
  contextDate: string;
  commentSummary?: CommentSummaryCount;
  editable: boolean;
  density: GridDensity;
  onEdit: () => void;
  onSelect?: () => void;
  onPreview?: () => void;
  onOpenFilePreview?: (asset: FieldFileAsset) => void;
  onOpenComments?: (anchor: CellCommentAnchor) => void;
  onCancel: () => void;
  onSave: (value: unknown) => void;
}) {
  const [draftValue, setDraftValue] = useState<unknown>(props.value ?? "");
  const valueText = stringifyCell(props.value);
  const isMarkdown = props.field.type === "markdown";
  const hasComments = (props.commentSummary?.total_count ?? 0) > 0;
  const showEditButton = props.editable && props.selected;
  const commentButtonRight = showEditButton ? "right-8" : "right-0";

  if (props.editing) {
    return (
      <div
        className="nd-field-edit grid min-w-48 gap-1"
        onClick={(event) => event.stopPropagation()}
        onFocusCapture={(event) => placeCaretAtEnd(event.target)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <FieldValueInput
          field={props.field}
          id={`cell-edit-${props.record.entity_id}-${props.field.key}`}
          name={`cell_edit_${props.record.entity_id}_${props.field.key}`}
          autoFocus
          value={draftValue}
          onChange={setDraftValue}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const multiline = props.field.type === "longtext" || props.field.type === "markdown";
              if (!multiline || event.ctrlKey || event.metaKey) {
                event.preventDefault();
                props.onSave(draftValue);
              }
            }
            if (event.key === "Escape") props.onCancel();
          }}
          compact
          className="border-foreground"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onSave(draftValue)}
            className="inline-flex h-7 items-center gap-1 border border-border bg-foreground px-2 text-xs text-background"
          >
            <Check className="size-3.5" aria-hidden />
            保存
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={props.onCancel}
            className="inline-flex h-7 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role={isMarkdown ? "button" : undefined}
      aria-label={isMarkdown ? `预览 ${props.field.label}` : undefined}
      data-field-key={props.field.key}
      data-field-type={props.field.type}
      tabIndex={isMarkdown ? 0 : undefined}
      onClick={isMarkdown ? openMarkdownPreview : undefined}
      onKeyDown={isMarkdown ? handleMarkdownPreviewKeyDown : undefined}
      className={cn(
        "nd-transition-state group/cell relative min-h-7 w-full text-left",
        showEditButton || props.onOpenComments ? "pr-16" : "pr-8",
        props.selected && "outline outline-1 outline-foreground",
        props.record.row_status === "modified" &&
          props.record.changed_fields.includes(props.field.key) &&
          "bg-[var(--color-status-modified)]/5",
        props.status === "draft" && "border-l-2 border-[var(--color-status-info)] pl-2",
        props.status === "saving" && "border-l-2 border-foreground pl-2",
        props.status === "failed" && "border-l-2 border-[var(--color-status-error)] pl-2",
        isMarkdown ? "cursor-zoom-in" : props.editable && "cursor-cell"
      )}
      >
      <div className="grid gap-1 py-0.5">
        {props.value === "" || props.value === null || props.value === undefined ? (
          <MaskedValue kind="empty" />
        ) : (
          <div title={valueText} className="min-w-0">
            <FieldValueDisplay
              field={props.field}
              value={props.value}
              valueText={valueText}
              style={gridDensityValueClamp(props.density)}
              onOpenFilePreview={props.onOpenFilePreview}
            />
          </div>
        )}
        {props.status && <CellStatus status={props.status} message={props.statusMessage} />}
      </div>
      {props.onOpenComments && (
        <CommentBadge
          summary={props.commentSummary}
          active={props.selected || hasComments}
          subtle={!hasComments}
          title={`打开 ${props.field.label} 评论`}
          ariaLabel={`打开 ${props.field.label} 评论`}
          className={cn("absolute top-0", commentButtonRight)}
          onClick={() =>
            props.onOpenComments?.({
              anchorType: "cell",
              schemaId: props.schemaId,
              entityId: props.record.entity_id,
              displayCode: props.record.display_code || props.record.business_code,
              fieldKey: props.field.key,
              fieldLabel: props.field.label,
              recordId: props.record.record_id,
              contextDate: props.contextDate,
              value: props.value,
            })
          }
        />
      )}
      {showEditButton && (
        <button
          type="button"
          title={`编辑 ${props.field.label}`}
          aria-label={`编辑 ${props.field.label}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            props.onEdit();
          }}
          className="absolute right-0 top-0 grid size-7 place-items-center border border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <PencilLine className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );

  function openMarkdownPreview(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    props.onSelect?.();
    if (valueText.trim()) props.onPreview?.();
  }

  function handleMarkdownPreviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    props.onSelect?.();
    if (valueText.trim()) props.onPreview?.();
  }
}

function CellStatus(props: { status: DraftCellStatus; message?: string }) {
  const label =
    props.status === "saving" ? "保存中" : props.status === "failed" ? "保存失败" : "草稿";
  return (
    <span
      title={props.message}
      className={cn(
        "nd-save-state inline-flex w-fit items-center gap-1 border px-1.5 py-0.5 text-[11px]",
        props.status === "failed"
          ? "border-[var(--color-status-error)] text-[var(--color-status-error)]"
          : "border-border text-muted-foreground"
      )}
    >
      {props.status === "saving" && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {props.status === "failed" && <AlertCircle className="size-3" aria-hidden />}
      {label}
    </span>
  );
}

function placeCaretAtEnd(target: EventTarget) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target instanceof HTMLInputElement && !isTextSelectionInput(target)) return;
  requestAnimationFrame(() => {
    if (document.activeElement !== target) return;
    const end = target.value.length;
    target.setSelectionRange(end, end);
  });
}

function isTextSelectionInput(input: HTMLInputElement) {
  return ["", "text", "search", "tel", "url", "password"].includes(input.type);
}
