import type {
  NoteStage,
  NoteStatus,
  WorkbenchLinkTargetSchema,
  WorkbenchNoteDetail,
  WorkbenchNoteListDetail,
  WorkbenchNoteListItem,
  WorkbenchNoteItem,
  WorkbenchMissingDetail,
} from "@/api/workbench";

export const NOTE_STAGE_LABELS: Record<NoteStage, string> = {
  pre_schema: "建表前",
  field_design: "字段设计",
  excel_import: "Excel 导入",
  validation: "校验修正",
  approval: "审批沟通",
  stats_export: "统计导出",
  other: "其他",
};

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  normal: "一般",
  pending_confirm: "待确认",
  confirmed: "已确认",
};

type WorkbenchNoteLike = {
  detail: WorkbenchNoteDetail | WorkbenchNoteListDetail | WorkbenchMissingDetail;
};

export function getSafeNoteListDetail(item: WorkbenchNoteLike): WorkbenchNoteListDetail {
  if (hasStageStatus(item.detail)) {
    return {
      stage: item.detail.stage,
      status: item.detail.status,
    };
  }
  return {
    stage: "other",
    status: "normal",
  };
}

export function getSafeNoteDetail(item: WorkbenchNoteLike): WorkbenchNoteDetail {
  if (isNoteDetail(item.detail)) return item.detail;
  const listDetail = getSafeNoteListDetail(item);
  return {
    markdown_content: "",
    stage: listDetail.stage,
    status: listDetail.status,
  };
}

export function hasFullNoteDetail(
  item: WorkbenchNoteListItem | WorkbenchNoteItem | null | undefined
): item is WorkbenchNoteItem {
  return Boolean(item && isNoteDetail(item.detail));
}

export function formatLinkedSchemaLabel(schema: WorkbenchLinkTargetSchema) {
  if (!schema.accessible) return `schema #${schema.id}`;
  return schema.name?.trim() || `schema #${schema.id}`;
}

export function formatWorkbenchDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function hasStageStatus(
  detail: WorkbenchNoteLike["detail"]
): detail is WorkbenchNoteDetail | WorkbenchNoteListDetail {
  return (
    "stage" in detail &&
    typeof detail.stage === "string" &&
    "status" in detail &&
    typeof detail.status === "string"
  );
}

function isNoteDetail(detail: WorkbenchNoteLike["detail"]): detail is WorkbenchNoteDetail {
  return (
    "markdown_content" in detail &&
    typeof detail.markdown_content === "string" &&
    hasStageStatus(detail)
  );
}
