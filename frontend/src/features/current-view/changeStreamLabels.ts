import type { ChangeAction, ChangeSetStatus } from "@/api/schemas";

export function changeSetStatusLabel(status: ChangeSetStatus | "") {
  if (status === "draft") return "草稿";
  if (status === "submitted") return "已提交";
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已驳回";
  if (status === "applied") return "已生效";
  if (status === "reverted") return "已撤销";
  return "全部状态";
}

export function changeActionLabel(action: ChangeAction) {
  if (action === "create") return "新增";
  if (action === "update") return "修改";
  return "终止";
}

export function signedCount(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}
