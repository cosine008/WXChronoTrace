import type {
  NotificationActor,
  NotificationItem,
  NotificationListResponse,
  NotificationListStatus,
  NotificationPreference,
  NotificationPreferencesResponse,
  NotificationSeverity,
  NotificationSummary,
  NotificationType,
} from "@/api/notifications";

export type {
  NotificationActor,
  NotificationItem,
  NotificationListResponse,
  NotificationListStatus,
  NotificationPreference,
  NotificationPreferencesResponse,
  NotificationSeverity,
  NotificationSummary,
  NotificationType,
};

export type NotificationDrawerFilter = Extract<NotificationListStatus, "all" | "unread">;
