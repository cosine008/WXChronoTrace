import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { trapDialogFocus } from "@/components/notifications/focusUtils";
import { cn } from "@/lib/utils";

const FORM_FOCUS_SELECTOR =
  "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

interface Props {
  open: boolean;
  title: string;
  description?: ReactNode;
  meta?: string;
  actions?: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
  testId?: string;
  closeTestId?: string;
  onRequestClose: () => void;
}

export function CurrentViewDrawer({
  open,
  title,
  description,
  meta,
  actions,
  children,
  size = "lg",
  testId = "current-view-drawer",
  closeTestId = "current-view-drawer-close",
  onRequestClose,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      const firstField = bodyRef.current?.querySelector<HTMLElement>(FORM_FOCUS_SELECTOR);
      (firstField ?? dialogRef.current)?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="nd-drawer-overlay fixed inset-0 z-[45] bg-background/75">
      <div
        className="flex h-full justify-end"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onRequestClose();
        }}
      >
        <div
          ref={dialogRef}
          data-testid={testId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") onRequestClose();
            trapDialogFocus(event, dialogRef.current);
          }}
          className={cn(
            "nd-drawer-panel flex h-full w-full max-w-full flex-col border-l border-border bg-background shadow-2xl outline-none",
            size === "md" ? "sm:max-w-xl" : "sm:max-w-[680px]"
          )}
        >
          <div className="grid shrink-0 gap-3 border-b border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1 text-xs text-muted-foreground">
                  {description}
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              {actions}
              {meta && <span className="font-mono text-xs text-muted-foreground">{meta}</span>}
              <button
                type="button"
                data-testid={closeTestId}
                onClick={onRequestClose}
                className="nd-transition-state grid size-8 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                aria-label={`关闭${title}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
