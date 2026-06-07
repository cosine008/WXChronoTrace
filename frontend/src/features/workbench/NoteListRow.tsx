import {
  ArrowUpRight,
  TableProperties,
} from "lucide-react";

import type { WorkbenchLinkTargetSchema, WorkbenchNoteListItem } from "@/api/workbench";
import {
  NOTE_STAGE_LABELS,
  NOTE_STATUS_LABELS,
  formatLinkedSchemaLabel,
  formatWorkbenchDateTime,
  getSafeNoteListDetail,
} from "@/features/workbench/noteMeta";
import {
  WorkbenchMetaLine,
  WorkbenchRow,
  WorkbenchRowActionButton,
  WorkbenchRowActions,
  WorkbenchRowContent,
  WorkbenchTagList,
} from "@/features/workbench/WorkbenchLayout";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
  WorkbenchStatusTag,
} from "@/features/workbench/WorkbenchObjectMarkers";

export function NoteListRow(props: {
  item: WorkbenchNoteListItem;
  onOpen: (item: WorkbenchNoteListItem) => void;
}) {
  const detail = getSafeNoteListDetail(props.item);
  const schemaLinks = props.item.links
    .map((link) => link.target_schema)
    .filter((schema): schema is WorkbenchLinkTargetSchema => schema !== null);

  return (
    <WorkbenchRow>
      <WorkbenchRowContent>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type="note" />
            <WorkbenchStatusTag code="STAGE" label={NOTE_STAGE_LABELS[detail.stage]} tone="info" />
            <WorkbenchStatusTag
              code="STATE"
              label={NOTE_STATUS_LABELS[detail.status]}
              tone={noteStatusTone(detail.status)}
            />
          </div>
          <WorkbenchSignalRail
            pinned={props.item.is_pinned}
            sensitive={props.item.is_sensitive}
          />
        </div>

        <div className="grid min-w-0 grid-cols-[8px_minmax(0,1fr)] overflow-hidden border border-border bg-background">
          <div className="border-r border-border bg-muted/40" aria-hidden />
          <div className="grid min-w-0 gap-1 px-3 py-2">
            <div className="truncate text-sm font-semibold text-foreground">{props.item.title}</div>
            <p className="text-sm text-muted-foreground">
              {props.item.is_sensitive
                ? "敏感笔记，正文仅在详情抽屉中展示。"
                : safeSummary(props.item.summary)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <WorkbenchTagList tags={props.item.tags} />
        </div>

        <div className="flex flex-wrap gap-2">
          {schemaLinks.length > 0 ? (
            schemaLinks.slice(0, 3).map((schema) => (
              <span
                key={schema.id}
                className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs text-muted-foreground"
              >
                <TableProperties className="size-3.5" aria-hidden />
                {formatLinkedSchemaLabel(schema)}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <TableProperties className="size-3.5" aria-hidden />
              未关联 Schema
            </span>
          )}
        </div>

        <WorkbenchMetaLine>
          <span>更新于 {formatWorkbenchDateTime(props.item.updated_at)}</span>
          {schemaLinks.length > 0 && <span>关联 Schema {schemaLinks.length} 个</span>}
        </WorkbenchMetaLine>
      </WorkbenchRowContent>

      <WorkbenchRowActions className="sm:w-[132px]">
        <WorkbenchRowActionButton
          label="查看详情"
          icon={<ArrowUpRight className="size-4" aria-hidden />}
          onClick={() => props.onOpen(props.item)}
        />
      </WorkbenchRowActions>
    </WorkbenchRow>
  );
}

function noteStatusTone(status: ReturnType<typeof getSafeNoteListDetail>["status"]) {
  if (status === "confirmed") return "success";
  if (status === "pending_confirm") return "warning";
  return "neutral";
}

function safeSummary(summary: string) {
  return summary.trim() || "未填写摘要";
}
