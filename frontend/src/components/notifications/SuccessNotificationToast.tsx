import { useCallback, useEffect, useRef } from "react";
import { CheckCircle2, X } from "lucide-react";

import { NotificationButton, NotificationShell } from "./NotificationShell";
import type { ToastNotification } from "./notificationTypes";

interface Props {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
}

export function SuccessNotificationToast({ toast, onDismiss }: Props) {
  const duration = toast.durationMs ?? 3000;
  const remainingRef = useRef(duration);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (timeout: number) => {
      clearTimer();
      startedAtRef.current = Date.now();
      timerRef.current = window.setTimeout(() => onDismiss(toast.id), timeout);
    },
    [clearTimer, onDismiss, toast.id]
  );

  useEffect(() => {
    remainingRef.current = duration;
    startTimer(duration);
    return clearTimer;
  }, [clearTimer, duration, startTimer]);

  const pauseTimer = () => {
    clearTimer();
    remainingRef.current = Math.max(500, remainingRef.current - (Date.now() - startedAtRef.current));
  };

  const resumeTimer = () => startTimer(remainingRef.current);

  return (
    <div
      role="status"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      className="w-full max-w-[360px]"
    >
      <NotificationShell
        tone="success"
        icon={<CheckCircle2 className="size-4" aria-hidden />}
        title={toast.title}
        description={toast.message}
        className="pr-7"
      >
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="关闭"
        >
          <X className="size-4" aria-hidden />
        </button>
        {toast.action && (
          <div className="flex justify-end">
            <NotificationButton
              {...toast.action}
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              variant={toast.action.variant ?? "secondary"}
            />
          </div>
        )}
        <div className="h-px overflow-hidden bg-border">
          <div className="h-px w-full bg-[var(--color-status-new)] opacity-70" />
        </div>
      </NotificationShell>
    </div>
  );
}
