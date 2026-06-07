import { api } from "@/lib/api";

export type NotificationType =
  | "comment_mention"
  | "comment_reply"
  | "approval_assigned"
  | "approval_updated"
  | "export_finished"
  | "export_failed"
  | "system_notice";

export type NotificationSeverity = "info" | "success" | "warning" | "error";
export type NotificationListStatus = "all" | "unread" | "archived";

export interface NotificationActor {
  id: number;
  username: string;
  display_name: string;
}

export interface NotificationItem {
  id: number;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  target_kind: string;
  target_id: string;
  target_url: string;
  payload: Record<string, unknown>;
  actor: NotificationActor | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface NotificationListParams {
  status?: NotificationListStatus;
  type?: NotificationType;
  page?: number;
  page_size?: number;
}

export interface NotificationListResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: NotificationItem[];
}

export interface NotificationSummary {
  unread_count: number;
  latest_created_at: string | null;
}

export interface NotificationPreference {
  type: NotificationType;
  in_app_enabled: boolean;
  external_enabled: boolean;
  updated_at: string | null;
}

export interface NotificationPreferencesResponse {
  results: NotificationPreference[];
}

export interface UpdateNotificationPreferencePayload {
  in_app_enabled?: boolean;
  external_enabled?: boolean;
}

export interface MarkAllNotificationsReadPayload {
  type?: NotificationType;
}

export interface MarkAllNotificationsReadResponse {
  updated_count: number;
}

export const notificationKeys = {
  all: ["notifications"] as const,
  summary: () => [...notificationKeys.all, "summary"] as const,
  preferences: () => [...notificationKeys.all, "preferences"] as const,
  list: (params: NotificationListParams = {}) =>
    [...notificationKeys.all, "list", params] as const,
};

export async function listNotifications(
  params: NotificationListParams = {}
): Promise<NotificationListResponse> {
  const { data } = await api.get<NotificationListResponse>("/notifications", {
    params: compactParams(params),
  });
  return data;
}

export async function fetchNotificationSummary(): Promise<NotificationSummary> {
  const { data } = await api.get<NotificationSummary>("/notifications/summary");
  return data;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferencesResponse> {
  const { data } = await api.get<NotificationPreferencesResponse>("/notifications/preferences");
  return data;
}

export async function updateNotificationPreference(
  type: NotificationType,
  payload: UpdateNotificationPreferencePayload
): Promise<NotificationPreference> {
  const { data } = await api.patch<NotificationPreference>(
    `/notifications/preferences/${type}`,
    payload
  );
  return data;
}

export async function markNotificationRead(notificationId: number): Promise<NotificationItem> {
  const { data } = await api.post<NotificationItem>(`/notifications/${notificationId}/read`);
  return data;
}

export async function markAllNotificationsRead(
  payload: MarkAllNotificationsReadPayload = {}
): Promise<MarkAllNotificationsReadResponse> {
  const { data } = await api.post<MarkAllNotificationsReadResponse>(
    "/notifications/mark-read",
    compactParams(payload)
  );
  return data;
}

export async function archiveNotification(notificationId: number): Promise<NotificationItem> {
  const { data } = await api.post<NotificationItem>(`/notifications/${notificationId}/archive`);
  return data;
}

function compactParams(params: object) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
