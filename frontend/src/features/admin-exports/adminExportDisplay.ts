import type {
  AdminExportEventSource,
  AdminExportRisk,
} from "@/api/adminExports";
import type { ExportFormat, ExportJobStatus } from "@/api/stats";

export function formatAdminExportNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : new Intl.NumberFormat("zh-CN").format(value);
}

export function formatAdminExportDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAdminExportFileSize(value: number | null | undefined) {
  if (value === null || value === undefined || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function adminExportFormatLabel(format: ExportFormat | string | null | undefined) {
  if (!format) return "-";
  return String(format).toUpperCase();
}

export function adminExportStatusMeta(status: ExportJobStatus) {
  const meta: Record<
    ExportJobStatus,
    { label: string; className: string }
  > = {
    queued: {
      label: "排队中",
      className: "border-border text-muted-foreground",
    },
    running: {
      label: "执行中",
      className: "border-[var(--color-status-info)] text-[var(--color-status-info)]",
    },
    completed: {
      label: "已完成",
      className: "border-[var(--color-status-new)] text-[var(--color-status-new)]",
    },
    failed: {
      label: "失败",
      className: "border-[var(--color-status-error)] text-[var(--color-status-error)]",
    },
    expired: {
      label: "已过期",
      className: "border-[var(--color-status-modified)] text-[var(--color-status-modified)]",
    },
    canceled: {
      label: "已取消",
      className: "border-border border-dashed text-muted-foreground",
    },
  };
  return meta[status];
}

export function adminExportRiskLabel(risk: AdminExportRisk) {
  if (risk === "large_export") return "大批量";
  if (risk === "sensitive_fields") return "敏感字段";
  return risk;
}

export function adminExportSourceLabel(source: AdminExportEventSource) {
  if (source === "export_job") return "任务导出";
  if (source === "sync_export") return "同步导出";
  if (source === "unknown") return "未知来源";
  return source;
}

export function adminExportYesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value ? "是" : "否";
}
