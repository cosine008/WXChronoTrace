import { Info, X } from "lucide-react";

import { NotificationButton, NotificationShell } from "./NotificationShell";
import type { InfoNotification } from "./notificationTypes";

interface Props {
  notification: InfoNotification;
  onDismiss?: (id: string) => void;
  className?: string;
}

export function InfoNotificationBanner({ notification, onDismiss, className }: Props) {
  const dismissible = !notification.sticky && onDismiss;

  return (
    <div role="status" className={className}>
      <NotificationShell
        tone="info"
        icon={<Info className="size-4" aria-hidden />}
        title={notification.title}
        description={notification.message}
        className={dismissible ? "pr-7" : undefined}
      >
        {dismissible && (
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
        {notification.action && (
          <div className="flex justify-end">
            <NotificationButton {...notification.action} variant={notification.action.variant ?? "secondary"} />
          </div>
        )}
      </NotificationShell>
    </div>
  );
}
