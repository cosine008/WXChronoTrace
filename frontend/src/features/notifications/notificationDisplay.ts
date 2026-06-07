import {
  AlertTriangle,
  AtSign,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Info,
  MessageCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type {
  NotificationItem,
  NotificationSeverity,
  NotificationType,
} from "./notificationTypes";

interface NotificationTypeMeta {
  label: string;
  icon: LucideIcon;
}

interface NotificationSeverityMeta {
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  badgeClassName: string;
  unreadClassName: string;
}

const TYPE_META: Record<NotificationType, NotificationTypeMeta> = {
  comment_mention: { label: "提及", icon: AtSign },
  comment_reply: { label: "评论", icon: MessageCircle },
  approval_assigned: { label: "待审批", icon: ClipboardCheck },
  approval_updated: { label: "审批更新", icon: ClipboardCheck },
  export_finished: { label: "导出完成", icon: Download },
  export_failed: { label: "导出失败", icon: XCircle },
  system_notice: { label: "系统通知", icon: Bell },
};

const SEVERITY_META: Record<NotificationSeverity, NotificationSeverityMeta> = {
  info: {
    label: "信息",
    icon: Info,
    iconClassName: "border-[var(--color-status-info)]/70 text-[var(--color-status-info)]",
    badgeClassName: "border-[var(--color-status-info)]/70 text-[var(--color-status-info)]",
    unreadClassName: "border-l-[var(--color-status-info)]",
  },
  success: {
    label: "成功",
    icon: CheckCircle2,
    iconClassName: "border-[var(--color-status-new)]/70 text-[var(--color-status-new)]",
    badgeClassName: "border-[var(--color-status-new)]/70 text-[var(--color-status-new)]",
    unreadClassName: "border-l-[var(--color-status-new)]",
  },
  warning: {
    label: "提醒",
    icon: AlertTriangle,
    iconClassName: "border-[var(--color-status-modified)]/80 text-[var(--color-status-modified)]",
    badgeClassName: "border-[var(--color-status-modified)]/80 text-[var(--color-status-modified)]",
    unreadClassName: "border-l-[var(--color-status-modified)]",
  },
  error: {
    label: "错误",
    icon: XCircle,
    iconClassName: "border-[var(--color-status-error)]/70 text-[var(--color-status-error)]",
    badgeClassName: "border-[var(--color-status-error)]/70 text-[var(--color-status-error)]",
    unreadClassName: "border-l-[var(--color-status-error)]",
  },
};

export function getNotificationTypeMeta(type: NotificationType): NotificationTypeMeta {
  return TYPE_META[type] ?? TYPE_META.system_notice;
}

export function getNotificationSeverityMeta(
  severity: NotificationSeverity
): NotificationSeverityMeta {
  return SEVERITY_META[severity] ?? SEVERITY_META.info;
}

export function isUnreadNotification(notification: NotificationItem): boolean {
  return notification.read_at === null;
}

export function formatNotificationTime(value: string): string {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return value;

  const elapsed = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return "刚刚";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} 分钟前`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} 小时前`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)} 天前`;

  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNotificationActor(notification: NotificationItem): string {
  return notification.actor?.display_name || notification.actor?.username || "系统";
}
