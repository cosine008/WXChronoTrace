import { AlertTriangle, RotateCcw } from "lucide-react";

import { extractApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  /** 错误对象（axios/Error/未知）；将通过 extractApiError 抽消息。 */
  error?: unknown;
  /** 显式标题，覆盖默认 "操作失败"。 */
  title?: string;
  /** 显式 message，覆盖从 error 抽取的内容。 */
  message?: string;
  /** 提供 onRetry 时显示重试按钮。 */
  onRetry?: () => void;
  /** 占整屏；用于路由级错误。 */
  fullScreen?: boolean;
  /** 容器最小高度，默认 12rem。 */
  minH?: string;
  className?: string;
}

/** 统一的错误占位。视觉上必须有图标 + 文案，避免只靠颜色（SRS 11.10.1）。 */
export function ErrorState({
  error,
  title = "操作失败",
  message,
  onRetry,
  fullScreen,
  minH = "min-h-48",
  className,
}: Props) {
  const text = message ?? (error !== undefined ? extractApiError(error).message : "请稍后再试");
  return (
    <div
      role="alert"
      className={cn(
        "grid place-items-center gap-2 px-6 py-8 text-center",
        fullScreen ? "min-h-screen" : minH,
        className
      )}
    >
      <AlertTriangle className="size-5 text-[var(--color-status-error)]" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{text}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex h-9 items-center gap-2 border border-border px-3 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <RotateCcw className="size-4" aria-hidden />
          重试
        </button>
      )}
    </div>
  );
}
