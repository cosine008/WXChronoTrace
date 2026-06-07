import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";

import {
  fetchNotificationPreferences,
  notificationKeys,
  updateNotificationPreference,
} from "@/api/notifications";

import type {
  NotificationPreferencesResponse,
  NotificationType,
} from "./notificationTypes";

const TYPE_LABELS: Record<NotificationType, string> = {
  comment_mention: "评论提及",
  comment_reply: "评论回复",
  approval_assigned: "审批待办",
  approval_updated: "审批更新",
  export_finished: "导出完成",
  export_failed: "导出失败",
  system_notice: "系统通知",
};

export function NotificationPreferencesPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: fetchNotificationPreferences,
  });
  const mutation = useMutation({
    mutationFn: (input: { type: NotificationType; in_app_enabled: boolean }) =>
      updateNotificationPreference(input.type, { in_app_enabled: input.in_app_enabled }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.preferences() });
      const previous = queryClient.getQueryData<NotificationPreferencesResponse>(
        notificationKeys.preferences()
      );
      queryClient.setQueryData<NotificationPreferencesResponse>(
        notificationKeys.preferences(),
        (current) => applyPreferenceUpdate(current, input)
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.preferences(), context.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
    },
  });

  return (
    <section
      aria-labelledby="notification-preferences-title"
      className="mt-4 border-t border-border pt-4"
    >
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <h3
          id="notification-preferences-title"
          className="text-xs font-semibold text-foreground"
        >
          通知偏好
        </h3>
        {mutation.isPending && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>
      {query.isError ? (
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          重新加载
        </button>
      ) : (
        <div className="grid gap-2">
          {(query.data?.results ?? []).map((item) => (
            <label
              key={item.type}
              className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border px-3 py-2 text-xs"
            >
              <span className="min-w-0 text-muted-foreground">
                {TYPE_LABELS[item.type] ?? item.type}
              </span>
              <input
                type="checkbox"
                checked={item.in_app_enabled}
                disabled={query.isLoading || mutation.isPending}
                onChange={(event) =>
                  mutation.mutate({
                    type: item.type,
                    in_app_enabled: event.currentTarget.checked,
                  })
                }
                className="size-4 accent-foreground"
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function applyPreferenceUpdate(
  current: NotificationPreferencesResponse | undefined,
  input: { type: NotificationType; in_app_enabled: boolean }
) {
  if (!current) return current;
  return {
    ...current,
    results: current.results.map((item) =>
      item.type === input.type ? { ...item, in_app_enabled: input.in_app_enabled } : item
    ),
  };
}
