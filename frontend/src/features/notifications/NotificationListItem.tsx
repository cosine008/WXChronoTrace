import { Archive, ArrowUpRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  formatNotificationActor,
  formatNotificationTime,
  getNotificationSeverityMeta,
  getNotificationTypeMeta,
  isUnreadNotification,
} from "./notificationDisplay";
import type { NotificationItem } from "./notificationTypes";

interface NotificationListItemProps {
  notification: NotificationItem;
  opening?: boolean;
  archiving?: boolean;
  onOpen: (notification: NotificationItem) => void;
  onArchive: (notification: NotificationItem) => void;
}

export function NotificationListItem({
  notification,
  opening = false,
  archiving = false,
  onOpen,
  onArchive,
}: NotificationListItemProps) {
  const unread = isUnreadNotification(notification);
  const typeMeta = getNotificationTypeMeta(notification.type);
  const severityMeta = getNotificationSeverityMeta(notification.severity);
  const TypeIcon = typeMeta.icon;

  return (
    <article
      className={cn(
        "grid gap-3 border border-border border-l-2 bg-card p-3",
        unread ? severityMeta.unreadClassName : "border-l-border",
        !unread && "opacity-80"
      )}
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center border bg-background",
            severityMeta.iconClassName
          )}
        >
          <TypeIcon className="size-4" aria-hidden />
        </span>

        <button
          type="button"
          disabled={opening || archiving}
          onClick={() => onOpen(notification)}
          className="min-w-0 text-left outline-none disabled:cursor-wait"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
              {notification.title}
            </span>
            {unread && (
              <span className="inline-flex h-5 items-center border border-[var(--color-status-info)] px-1.5 text-[11px] text-[var(--color-status-info)]">
                未读
              </span>
            )}
            <span
              className={cn(
                "inline-flex h-5 items-center border px-1.5 text-[11px]",
                severityMeta.badgeClassName
              )}
            >
              {severityMeta.label}
            </span>
          </span>
          {notification.body && (
            <span className="mt-1 block max-h-10 overflow-hidden break-words text-xs leading-5 text-muted-foreground">
              {notification.body}
            </span>
          )}
          <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>{typeMeta.label}</span>
            <span>/</span>
            <span className="truncate">{formatNotificationActor(notification)}</span>
            <span>/</span>
            <time dateTime={notification.created_at}>
              {formatNotificationTime(notification.created_at)}
            </time>
            {notification.target_url && (
              <>
                <span>/</span>
                <span className="inline-flex items-center gap-1">
                  打开
                  <ArrowUpRight className="size-3" aria-hidden />
                </span>
              </>
            )}
          </span>
        </button>

        <button
          type="button"
          disabled={opening || archiving}
          onClick={() => onArchive(notification)}
          aria-label="归档通知"
          title="归档通知"
          className="grid size-8 shrink-0 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-wait disabled:opacity-40"
        >
          {archiving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Archive className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </article>
  );
}
