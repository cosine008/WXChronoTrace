import { forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { NotificationAction } from "./notificationTypes";

type ShellTone = "neutral" | "success" | "error" | "info" | "destructive";

const TONE_BAR: Record<ShellTone, string> = {
  neutral: "bg-foreground",
  success: "bg-[var(--color-status-new)]",
  error: "bg-[var(--color-status-error)]",
  info: "bg-[var(--color-status-info)]",
  destructive: "bg-[var(--color-status-error)]",
};

const TONE_ICON: Record<ShellTone, string> = {
  neutral: "text-foreground",
  success: "text-[var(--color-status-new)]",
  error: "text-[var(--color-status-error)]",
  info: "text-[var(--color-status-info)]",
  destructive: "text-[var(--color-status-error)]",
};

export function NotificationShell(props: {
  tone: ShellTone;
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  titleId?: string;
  descriptionId?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-card shadow-sm",
        "transition duration-150 ease-out",
        props.className
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BAR[props.tone])} />
      <div className={cn("grid gap-3 p-4 pl-5", props.bodyClassName)}>
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background",
              TONE_ICON[props.tone]
            )}
          >
            {props.icon}
          </span>
          <div className="min-w-0">
            <h2 id={props.titleId} className="text-sm font-semibold text-foreground">
              {props.title}
            </h2>
            {props.description && (
              <div
                id={props.descriptionId}
                className="mt-1 text-sm leading-6 text-muted-foreground"
              >
                {props.description}
              </div>
            )}
          </div>
        </div>
        {props.children}
        {props.actions && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            {props.actions}
          </div>
        )}
      </div>
    </section>
  );
}

export const NotificationButton = forwardRef<
  HTMLButtonElement,
  NotificationAction & { disabled?: boolean; autoFocus?: boolean }
>(function NotificationButton(props, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm disabled:opacity-50",
        props.variant === "primary" && "bg-foreground text-background",
        props.variant === "danger" && "bg-[var(--color-status-error)] text-white",
        (!props.variant || props.variant === "secondary") &&
          "border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
      )}
    >
      {props.icon}
      {props.label}
    </button>
  );
});
