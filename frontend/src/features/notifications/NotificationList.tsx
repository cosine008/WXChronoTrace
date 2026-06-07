import { Bell } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";

import { NotificationListItem } from "./NotificationListItem";
import type { NotificationItem } from "./notificationTypes";

interface NotificationListProps {
  notifications: NotificationItem[];
  loading?: boolean;
  error?: unknown;
  openingId?: number | null;
  archivingId?: number | null;
  emptyTitle?: string;
  emptyDescription?: string;
  onOpen: (notification: NotificationItem) => void;
  onArchive: (notification: NotificationItem) => void;
  onRetry: () => void;
}

export function NotificationList({
  notifications,
  loading = false,
  error,
  openingId,
  archivingId,
  emptyTitle = "暂无通知",
  emptyDescription = "新的评论、导出和审批事件会显示在这里。",
  onOpen,
  onArchive,
  onRetry,
}: NotificationListProps) {
  if (loading) {
    return <LoadingState label="加载通知" minH="min-h-64" />;
  }

  if (error) {
    return (
      <ErrorState
        title="通知加载失败"
        error={error}
        onRetry={onRetry}
        minH="min-h-64"
      />
    );
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={<Bell className="size-5" aria-hidden />}
        minH="min-h-64"
      />
    );
  }

  return (
    <div className="grid gap-2">
      {notifications.map((notification) => (
        <NotificationListItem
          key={notification.id}
          notification={notification}
          opening={openingId === notification.id}
          archiving={archivingId === notification.id}
          onOpen={onOpen}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}
