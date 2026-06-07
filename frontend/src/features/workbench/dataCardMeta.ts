import type {
  DataCardCategory,
  DataCardStatus,
  WorkbenchDataCardDetail,
  WorkbenchDataCardItem,
} from "@/api/workbench";

export const DATA_CARD_CATEGORY_LABELS: Record<DataCardCategory, string> = {
  organization: "机构",
  people: "人员",
  social_security: "社保",
  finance: "财务",
  policy: "政策",
  import_template: "导入模板",
  common_text: "常用文本",
  other: "其他",
};

export const DATA_CARD_STATUS_LABELS: Record<DataCardStatus, string> = {
  draft: "草稿",
  pending_confirm: "待确认",
  confirmed: "已确认",
  expired: "已失效",
};

export function getDataCardDetail(item: Pick<WorkbenchDataCardItem, "detail">) {
  return isDataCardDetail(item.detail) ? item.detail : null;
}

export function dataCardStatusTone(status: DataCardStatus) {
  if (status === "confirmed") return "success";
  if (status === "pending_confirm") return "warning";
  if (status === "expired") return "danger";
  return "neutral";
}

function isDataCardDetail(detail: WorkbenchDataCardItem["detail"]): detail is WorkbenchDataCardDetail {
  return "fields" in detail && Array.isArray(detail.fields);
}
