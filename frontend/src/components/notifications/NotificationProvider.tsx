import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { NotificationHost } from "./NotificationHost";
import { NotificationContext } from "./useNotification";
import type {
  ConfirmOptions,
  ConfirmRequest,
  ErrorNotification,
  ErrorOptions,
  InfoNotification,
  InfoOptions,
  NotificationContextValue,
  NotificationKind,
  SuccessOptions,
  ToastNotification,
} from "./notificationTypes";

interface Props {
  children: ReactNode;
}

type LastFingerprint = {
  value: string;
  at: number;
} | null;

export function NotificationProvider({ children }: Props) {
  const [confirmQueue, setConfirmQueue] = useState<ConfirmRequest[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [error, setError] = useState<ErrorNotification | null>(null);
  const [info, setInfo] = useState<InfoNotification | null>(null);
  const lastFingerprintRef = useRef<LastFingerprint>(null);

  const shouldSuppress = useCallback((kind: NotificationKind, title: string, message?: string) => {
    const now = Date.now();
    const value = fingerprint(kind, title, message);
    const last = lastFingerprintRef.current;
    if (last && last.value === value && now - last.at < 1000) return true;
    lastFingerprintRef.current = { value, at: now };
    return false;
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    const id = makeId("confirm");
    return new Promise<boolean>((resolve) => {
      setConfirmQueue((current) => [
        ...current,
        {
          ...options,
          id,
          kind: "confirm",
          resolve,
        },
      ]);
    });
  }, []);

  const success = useCallback(
    (options: SuccessOptions) => {
      if (shouldSuppress("success", options.title, options.message)) return "";
      const id = makeId("success");
      const toast: ToastNotification = {
        ...options,
        id,
        kind: "success",
        createdAt: Date.now(),
      };
      setToasts((current) => [toast, ...current].slice(0, 3));
      return id;
    },
    [shouldSuppress]
  );

  const notifyError = useCallback(
    (options: ErrorOptions) => {
      if (shouldSuppress("error", options.title, options.message)) return "";
      const id = makeId("error");
      setError({
        ...options,
        id,
        kind: "error",
      });
      return id;
    },
    [shouldSuppress]
  );

  const notifyInfo = useCallback(
    (options: InfoOptions) => {
      if (shouldSuppress("info", options.title, options.message)) return "";
      const id = makeId("info");
      setInfo({
        ...options,
        id,
        kind: "info",
      });
      return id;
    },
    [shouldSuppress]
  );

  const dismiss = useCallback((id: string) => {
    setConfirmQueue((current) => {
      current.find((request) => request.id === id)?.resolve(false);
      return current.filter((request) => request.id !== id);
    });
    setToasts((current) => current.filter((toast) => toast.id !== id));
    setError((current) => (current?.id === id ? null : current));
    setInfo((current) => (current?.id === id ? null : current));
  }, []);

  const dismissAll = useCallback((kind?: NotificationKind) => {
    if (!kind || kind === "confirm") {
      setConfirmQueue((current) => {
        current.forEach((request) => request.resolve(false));
        return [];
      });
    }
    if (!kind || kind === "success") setToasts([]);
    if (!kind || kind === "error") setError(null);
    if (!kind || kind === "info") setInfo(null);
  }, []);

  const resolveConfirm = useCallback((request: ConfirmRequest, confirmed: boolean) => {
    request.resolve(confirmed);
    setConfirmQueue((current) => current.filter((item) => item.id !== request.id));
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      confirm,
      success,
      error: notifyError,
      info: notifyInfo,
      dismiss,
      dismissAll,
    }),
    [confirm, dismiss, dismissAll, notifyError, notifyInfo, success]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationHost
        confirmRequest={confirmQueue[0]}
        error={error}
        info={info}
        toasts={toasts}
        onResolveConfirm={resolveConfirm}
        onDismiss={dismiss}
      />
    </NotificationContext.Provider>
  );
}

function makeId(kind: NotificationKind) {
  return `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function fingerprint(kind: NotificationKind, title: string, message?: string) {
  return `${kind}:${title}:${message ?? ""}`;
}
