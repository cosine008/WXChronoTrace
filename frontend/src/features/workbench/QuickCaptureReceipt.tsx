import type { WorkbenchNoteItem } from "@/api/workbench";
import { WorkbenchKindMarker, WorkbenchStatusTag } from "@/features/workbench/WorkbenchObjectMarkers";
import {
  formatWorkbenchDateTime,
  getSafeNoteListDetail,
  NOTE_STAGE_LABELS,
  NOTE_STATUS_LABELS,
} from "@/features/workbench/noteMeta";

export function QuickCaptureReceipt({ item }: { item: WorkbenchNoteItem }) {
  const detail = getSafeNoteListDetail(item);

  return (
    <div className="grid min-w-0 gap-2 border border-[var(--color-status-new)]/70 bg-[var(--color-status-new)]/5 p-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <WorkbenchKindMarker type="note" detail={`#${item.id}`} />
          <WorkbenchStatusTag code="STAGE" label={NOTE_STAGE_LABELS[detail.stage]} tone="info" />
          <WorkbenchStatusTag code="STATE" label={NOTE_STATUS_LABELS[detail.status]} tone="success" />
        </div>
        <WorkbenchStatusTag code="OK" label="已保存" tone="success" />
      </div>
      <div className="grid min-w-0 gap-1 border-l-2 border-[var(--color-status-new)]/70 pl-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{item.summary || "未填写摘要"}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          更新于 {formatWorkbenchDateTime(item.updated_at)}
        </p>
      </div>
    </div>
  );
}
