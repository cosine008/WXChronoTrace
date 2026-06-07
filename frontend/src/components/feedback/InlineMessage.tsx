import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { extractApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "error";

interface Props {
  tone?: Tone;
  /** 直接传字符串。 */
  message?: string;
  /** 传入 error 时自动抽消息（覆盖 message）。 */
  error?: unknown;
  className?: string;
}

const TONE_ICON = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
} as const;

const TONE_COLOR = {
  info: "text-muted-foreground",
  success: "text-[var(--color-status-new)]",
  error: "text-[var(--color-status-error)]",
} as const;

/** mutation 反馈用的内联消息。占位高度固定，保持表单节奏稳定。 */
export function InlineMessage({ tone = "info", message, error, className }: Props) {
  const text = error !== undefined ? extractApiError(error).message : message;
  const Icon = TONE_ICON[tone];
  if (!text) {
    return <p className={cn("min-h-5", className)} aria-hidden />;
  }
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "inline-flex min-h-5 items-center gap-1.5 text-xs",
        TONE_COLOR[tone],
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
