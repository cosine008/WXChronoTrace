import type { AuditLogEntry } from "@/api/audit";
import type { AuditEventKind } from "@/components/badges/AuditMarker";

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "登录",
  "auth.logout": "登出",
  "user.create": "新增用户",
  "user.update": "更新用户",
  "user.deactivate": "停用用户",
  "user.restore": "恢复用户",
  "user.reset_password": "重置密码",
  "schema.create": "建表",
  "schema.update": "更新表信息",
  "schema.update_fields": "更新字段",
  "schema.visibility_change": "可见性变更",
  "schema.archive": "归档表",
  "schema.handover": "移交 owner",
  "collaborator.add": "添加协作者",
  "collaborator.update": "更新协作者",
  "collaborator.remove": "移除协作者",
  "changeset.apply": "应用 ChangeSet",
  "changeset.revert": "回滚 ChangeSet",
  "data.export": "导出数据",
  "data.import": "导入数据",
  "audit.export": "导出审计",
  "label.create": "生成标签",
  "label.print": "打印标签",
  "label.revoke": "作废标签",
  "label.scan": "扫码查看",
};

export function classifyAuditAction(action: string): AuditEventKind {
  const normalized = action.toLowerCase();
  if (
    normalized.startsWith("auth.") ||
    normalized.includes("login") ||
    normalized.includes("logout")
  ) {
    return "auth";
  }
  if (normalized.includes("export")) return "export";
  if (normalized.startsWith("label.") || normalized.includes("label.")) return "label";
  if (
    normalized.startsWith("collaborator.") ||
    normalized.includes("permission") ||
    normalized.includes("visibility") ||
    normalized.includes("handover") ||
    normalized.includes("role")
  ) {
    return "permission";
  }
  if (normalized.startsWith("schema.")) return "schema";
  if (normalized.startsWith("data.") || normalized.startsWith("changeset.")) return "data";
  if (normalized.startsWith("user.") || normalized.startsWith("admin.")) return "admin";
  if (normalized.includes("sensitive")) return "sensitive";
  return "system";
}

export function groupByDate(items: AuditLogEntry[]) {
  const groups: Array<{ date: string; items: AuditLogEntry[] }> = [];
  for (const item of items) {
    const date = item.created_at.slice(0, 10);
    const group = groups.find((entry) => entry.date === date);
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ date, items: [item] });
    }
  }
  return groups;
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

export function targetLabel(item: AuditLogEntry) {
  const target = `${item.target_type}#${item.target_id ?? "-"}`;
  if (item.target_schema_name) return `${item.target_schema_name} · ${target}`;
  return target;
}

export function detailSummary(detail: Record<string, unknown>) {
  const entries = Object.entries(detail);
  if (entries.length === 0) return "{}";
  return entries.map(([key, value]) => `${key}=${formatDetailValue(value)}`).join(" · ");
}

function formatDetailValue(value: unknown) {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
