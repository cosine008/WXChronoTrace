import { useEffect, useId, useRef } from "react";
import { CircleHelp, ShieldAlert, X } from "lucide-react";

import { trapDialogFocus } from "./focusUtils";
import { NotificationButton, NotificationShell } from "./NotificationShell";
import type { ConfirmRequest } from "./notificationTypes";

interface Props {
  request: ConfirmRequest;
  onResolve: (request: ConfirmRequest, confirmed: boolean) => void;
}

export function ConfirmNotificationDialog({ request, onResolve }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const destructive = request.tone === "destructive";

  useEffect(() => {
    const target = destructive ? cancelRef.current : confirmRef.current;
    target?.focus();
  }, [destructive]);

  const resolve = (confirmed: boolean) => onResolve(request, confirmed);

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={request.description ? descriptionId : undefined}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") resolve(false);
        trapDialogFocus(event, dialogRef.current);
      }}
      className="relative w-full max-w-xl outline-none"
    >
      <button
        type="button"
        onClick={() => resolve(false)}
        className="absolute right-3 top-3 z-10 grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="关闭"
      >
        <X className="size-4" aria-hidden />
      </button>
      <NotificationShell
        tone={destructive ? "destructive" : "neutral"}
        icon={
          destructive ? (
            <ShieldAlert className="size-4" aria-hidden />
          ) : (
            <CircleHelp className="size-4" aria-hidden />
          )
        }
        title={request.title}
        titleId={titleId}
        descriptionId={descriptionId}
        description={request.description}
        className="pr-8"
        actions={
          <>
            <NotificationButton
              ref={cancelRef}
              label={request.cancelLabel ?? "取消"}
              onClick={() => resolve(false)}
              variant="secondary"
            />
            <NotificationButton
              ref={confirmRef}
              label={request.confirmLabel ?? "确认"}
              onClick={() => resolve(true)}
              variant={destructive ? "danger" : "primary"}
            />
          </>
        }
      >
        {request.impactSummary && request.impactSummary.length > 0 && (
          <ul className="grid gap-2 rounded-sm border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            {request.impactSummary.slice(0, 4).map((item) => (
              <li key={item} className="grid grid-cols-[auto_1fr] gap-2">
                <span className="font-mono text-[var(--color-status-info)]">::</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </NotificationShell>
    </div>
  );
}
