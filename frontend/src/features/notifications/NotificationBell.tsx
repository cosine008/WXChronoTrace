import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { fetchNotificationSummary, notificationKeys } from "@/api/notifications";
import { useAuthStore } from "@/stores/auth";

import { NotificationDrawer } from "./NotificationDrawer";

export function NotificationBell() {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const summaryQuery = useQuery({
    queryKey: notificationKeys.summary(),
    queryFn: fetchNotificationSummary,
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const unreadCount = summaryQuery.data?.unread_count ?? 0;
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `通知，${unreadCount} 条未读` : "通知"}
        title="通知"
        className="relative grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 border border-background bg-[var(--color-status-error)] px-1 text-center font-mono text-[10px] leading-4 text-white">
            {badge}
          </span>
        )}
      </button>
      <NotificationDrawer open={open && Boolean(user)} onClose={() => setOpen(false)} />
    </>
  );
}
