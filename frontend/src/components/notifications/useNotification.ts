import { createContext, useContext } from "react";

import type { NotificationContextValue } from "./notificationTypes";

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotification() {
  const value = useContext(NotificationContext);
  if (!value) {
    throw new Error("useNotification must be used inside NotificationProvider");
  }
  return value;
}
