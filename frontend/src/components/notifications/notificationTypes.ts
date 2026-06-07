import type { ReactNode } from "react";

export type NotificationKind = "confirm" | "success" | "error" | "info";
export type NotificationTone = "neutral" | "destructive";

export type NotificationAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  icon?: ReactNode;
};

export type ConfirmOptions = {
  title: string;
  description?: string;
  impactSummary?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: NotificationTone;
};

export type SuccessOptions = {
  title: string;
  message?: string;
  action?: NotificationAction;
  durationMs?: number;
};

export type ErrorOptions = {
  title: string;
  message: string;
  detail?: string;
  code?: string;
  requestId?: string;
  retryAction?: NotificationAction;
  copyText?: string;
};

export type InfoOptions = {
  title: string;
  message: string;
  action?: NotificationAction;
  sticky?: boolean;
};

export type ToastNotification = SuccessOptions & {
  id: string;
  createdAt: number;
  kind: "success";
};

export type ErrorNotification = ErrorOptions & {
  id: string;
  kind: "error";
};

export type InfoNotification = InfoOptions & {
  id: string;
  kind: "info";
};

export type ConfirmRequest = ConfirmOptions & {
  id: string;
  kind: "confirm";
  resolve: (confirmed: boolean) => void;
};

export type NotificationContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  success: (options: SuccessOptions) => string;
  error: (options: ErrorOptions) => string;
  info: (options: InfoOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: (kind?: NotificationKind) => void;
};
