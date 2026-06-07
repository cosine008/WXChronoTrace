import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, RefreshCw, X } from "lucide-react";

import { trapDialogFocus } from "./focusUtils";
import { NotificationButton, NotificationShell } from "./NotificationShell";
import type { ErrorNotification } from "./notificationTypes";

interface Props {
  error: ErrorNotification;
  onDismiss: (id: string) => void;
}

export function ErrorNotificationDialog({ error, onDismiss }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const copyText = useMemo(() => buildCopyText(error), [error]);
  const canCopy = Boolean(copyText);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const dismiss = () => onDismiss(error.id);

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") dismiss();
        trapDialogFocus(event, dialogRef.current);
      }}
      className="relative w-full max-w-2xl outline-none"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 z-10 grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="关闭"
      >
        <X className="size-4" aria-hidden />
      </button>
      <NotificationShell
        tone="error"
        icon={<AlertTriangle className="size-4" aria-hidden />}
        title={error.title}
        titleId={titleId}
        descriptionId={descriptionId}
        description={error.message}
        className="pr-8"
        actions={
          <>
            {error.retryAction && (
              <NotificationButton
                label={error.retryAction.label}
                icon={error.retryAction.icon ?? <RefreshCw className="size-4" aria-hidden />}
                onClick={() => {
                  error.retryAction?.onClick();
                  dismiss();
                }}
                variant="primary"
              />
            )}
            {canCopy && (
              <NotificationButton
                label={copied ? "已复制" : "复制详情"}
                icon={<Copy className="size-4" aria-hidden />}
                onClick={() => {
                  void navigator.clipboard.writeText(copyText).then(() => setCopied(true));
                }}
                variant="secondary"
              />
            )}
            <NotificationButton label="关闭" onClick={dismiss} variant="secondary" />
          </>
        }
      >
        {(error.code || error.requestId) && (
          <dl className="grid gap-2 rounded-sm border border-border bg-background p-3 text-xs sm:grid-cols-2">
            {error.code && (
              <div>
                <dt className="text-muted-foreground">错误码</dt>
                <dd className="mt-1 font-mono text-foreground">{error.code}</dd>
              </div>
            )}
            {error.requestId && (
              <div>
                <dt className="text-muted-foreground">请求 ID</dt>
                <dd className="mt-1 font-mono text-foreground">{error.requestId}</dd>
              </div>
            )}
          </dl>
        )}
        {error.detail && (
          <details className="rounded-sm border border-border bg-background p-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              技术详情
            </summary>
            <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-muted-foreground">
              {error.detail}
            </pre>
          </details>
        )}
      </NotificationShell>
    </div>
  );
}

function buildCopyText(error: ErrorNotification) {
  return (
    error.copyText ||
    [
      `title: ${error.title}`,
      `message: ${error.message}`,
      error.code ? `code: ${error.code}` : "",
      error.requestId ? `request_id: ${error.requestId}` : "",
      error.detail ? `detail:\n${error.detail}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}
