import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useNavigate, type NavigateFunction } from "react-router-dom";

import {
  archiveNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
} from "@/api/notifications";
import { useNotification } from "@/components/notifications";
import { CurrentViewDrawer } from "@/features/current-view/CurrentViewDrawer";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { cn } from "@/lib/utils";

import { NotificationList } from "./NotificationList";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";
import { isUnreadNotification } from "./notificationDisplay";
import type { NotificationDrawerFilter, NotificationItem } from "./notificationTypes";

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 50;
const EMPTY_NOTIFICATIONS: NotificationItem[] = [];
const FILTER_OPTIONS: Array<{ value: NotificationDrawerFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
];

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const [filter, setFilter] = useState<NotificationDrawerFilter>("all");
  const data = useNotificationDrawerData(open, filter);
  const actions = useNotificationDrawerActions(onClose);

  return (
    <CurrentViewDrawer
      open={open}
      title="通知"
      description={`${filter === "unread" ? "未读" : "全部"} / ${data.total} 条`}
      meta={data.query.isFetching ? "loading" : undefined}
      actions={
        <NotificationDrawerActions
          filter={filter}
          unreadOnPage={data.unreadOnPage}
          markAllPending={actions.markAllPending}
          onFilterChange={setFilter}
          onMarkAllRead={() => void actions.handleMarkAllRead()}
        />
      }
      size="md"
      testId="notification-drawer"
      closeTestId="notification-drawer-close"
      onRequestClose={onClose}
    >
      <div className="grid gap-4">
        <NotificationList
          notifications={data.notifications}
          loading={data.query.isLoading}
          error={data.query.isError ? data.query.error : undefined}
          openingId={actions.openingId}
          archivingId={actions.archivingId}
        emptyTitle={filter === "unread" ? "暂无未读通知" : "暂无通知"}
          emptyDescription={
          filter === "unread"
            ? "未读通知处理完成后会自动从这里移除。"
            : "评论、导出和审批事件会在产生后进入收件箱。"
          }
          onOpen={(notification) => void actions.handleOpen(notification)}
          onArchive={(notification) => void actions.handleArchive(notification)}
          onRetry={() => void data.query.refetch()}
        />
        <NotificationPreferencesPanel />
      </div>
    </CurrentViewDrawer>
  );
}

function useNotificationDrawerData(open: boolean, filter: NotificationDrawerFilter) {
  const listParams = useMemo(() => ({ status: filter, page_size: PAGE_SIZE }), [filter]);
  const query = useQuery({
    queryKey: notificationKeys.list(listParams),
    queryFn: () => listNotifications(listParams),
    enabled: open,
  });
  const notifications = query.data?.results ?? EMPTY_NOTIFICATIONS;
  return {
    query,
    notifications,
    total: query.data?.count ?? notifications.length,
    unreadOnPage: notifications.filter(isUnreadNotification).length,
  };
}

function useNotificationDrawerActions(onClose: () => void) {
  const notify = useNotification();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const markReadMutation = useMarkReadMutation(queryClient);
  const markAllMutation = useMarkAllReadMutation(queryClient, notify);
  const archiveMutation = useArchiveMutation(queryClient);

  return {
    markAllPending: markAllMutation.isPending,
    openingId: markReadMutation.isPending ? markReadMutation.variables?.id ?? null : null,
    archivingId: archiveMutation.isPending ? archiveMutation.variables?.id ?? null : null,
    handleOpen: (notification: NotificationItem) =>
      openNotification(notification, markReadMutation.mutateAsync, onClose, navigate, notify),
    handleArchive: (notification: NotificationItem) =>
      archiveDrawerNotification(notification, archiveMutation.mutateAsync, notify),
    handleMarkAllRead: () => markAllDrawerNotificationsRead(markAllMutation.mutateAsync, notify),
  };
}

function useMarkReadMutation(queryClient: QueryClient) {
  return useMutation({
    mutationFn: (notification: NotificationItem) => markNotificationRead(notification.id),
    onSuccess: async () => invalidateNotificationQueries(queryClient),
  });
}

function useMarkAllReadMutation(
  queryClient: QueryClient,
  notify: ReturnType<typeof useNotification>
) {
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async (result) => {
      if (result.updated_count > 0) {
        notify.success({
          title: "通知已全部标记为已读",
          message: `更新 ${result.updated_count} 条通知。`,
        });
      }
      await invalidateNotificationQueries(queryClient);
    },
  });
}

function useArchiveMutation(queryClient: QueryClient) {
  return useMutation({
    mutationFn: (notification: NotificationItem) => archiveNotification(notification.id),
    onSuccess: async () => invalidateNotificationQueries(queryClient),
  });
}

function NotificationDrawerActions(props: {
  filter: NotificationDrawerFilter;
  unreadOnPage: number;
  markAllPending: boolean;
  onFilterChange: (filter: NotificationDrawerFilter) => void;
  onMarkAllRead: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="inline-flex h-8 items-center border border-border p-0.5 text-xs">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => props.onFilterChange(option.value)}
            className={cn(
              "h-6 px-2 text-muted-foreground hover:text-foreground",
              props.filter === option.value && "bg-foreground text-background hover:text-background"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={
          props.markAllPending || (props.filter === "unread" && props.unreadOnPage === 0)
        }
        onClick={props.onMarkAllRead}
        className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        {props.markAllPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Check className="size-3.5" aria-hidden />
        )}
        全部已读
      </button>
    </div>
  );
}

async function openNotification(
  notification: NotificationItem,
  markRead: (notification: NotificationItem) => Promise<NotificationItem>,
  onClose: () => void,
  navigate: NavigateFunction,
  notify: ReturnType<typeof useNotification>
) {
  try {
    if (isUnreadNotification(notification)) {
      await markRead(notification);
    }
    if (notification.target_url.trim()) {
      onClose();
      navigate(notification.target_url);
    }
  } catch (error) {
    showMutationError(notify, "打开通知失败", error);
  }
}

async function archiveDrawerNotification(
  notification: NotificationItem,
  archive: (notification: NotificationItem) => Promise<NotificationItem>,
  notify: ReturnType<typeof useNotification>
) {
  try {
    await archive(notification);
  } catch (error) {
    showMutationError(notify, "归档通知失败", error);
  }
}

async function markAllDrawerNotificationsRead(
  markAllRead: () => Promise<unknown>,
  notify: ReturnType<typeof useNotification>
) {
  try {
    await markAllRead();
  } catch (error) {
    showMutationError(notify, "标记全部已读失败", error);
  }
}

async function invalidateNotificationQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

function showMutationError(
  notify: ReturnType<typeof useNotification>,
  title: string,
  error: unknown
) {
  const apiError = extractApiError(error);
  notify.error({
    title,
    message: apiError.message,
    code: apiError.code,
    detail: formatApiErrorDetail(apiError.details),
  });
}
