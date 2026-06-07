import { useEffect } from "react";

import { ConfirmNotificationDialog } from "./ConfirmNotificationDialog";
import { ErrorNotificationDialog } from "./ErrorNotificationDialog";
import { InfoNotificationBanner } from "./InfoNotificationBanner";
import { SuccessNotificationToast } from "./SuccessNotificationToast";
import type {
  ConfirmRequest,
  ErrorNotification,
  InfoNotification,
  ToastNotification,
} from "./notificationTypes";

interface Props {
  confirmRequest?: ConfirmRequest;
  error: ErrorNotification | null;
  info: InfoNotification | null;
  toasts: ToastNotification[];
  onResolveConfirm: (request: ConfirmRequest, confirmed: boolean) => void;
  onDismiss: (id: string) => void;
}

export function NotificationHost({
  confirmRequest,
  error,
  info,
  toasts,
  onResolveConfirm,
  onDismiss,
}: Props) {
  const activeDialog = confirmRequest ? "confirm" : error ? "error" : null;

  useEffect(() => {
    if (!activeDialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activeDialog]);

  return (
    <>
      {info && (
        <div className="fixed left-1/2 top-4 z-40 w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2">
          <InfoNotificationBanner notification={info} onDismiss={onDismiss} />
        </div>
      )}
      {toasts.length > 0 && (
        <div className="fixed right-4 top-4 z-50 grid w-[calc(100vw-2rem)] max-w-[360px] gap-2 sm:w-[360px]">
          {toasts.map((toast) => (
            <SuccessNotificationToast key={toast.id} toast={toast} onDismiss={onDismiss} />
          ))}
        </div>
      )}
      {activeDialog && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/80 px-4 py-6">
          {confirmRequest ? (
            <ConfirmNotificationDialog request={confirmRequest} onResolve={onResolveConfirm} />
          ) : error ? (
            <ErrorNotificationDialog error={error} onDismiss={onDismiss} />
          ) : null}
        </div>
      )}
    </>
  );
}
