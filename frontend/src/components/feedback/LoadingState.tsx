import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  /** 占位文字，默认 "加载中"。 */
  label?: string;
  /** 占整屏；用于路由级 loading。 */
  fullScreen?: boolean;
  /** 容器最小高度，默认 12rem。 */
  minH?: string;
  className?: string;
}

/** 统一的加载占位。SRS 11.10.3。 */
export function LoadingState({ label = "加载中", fullScreen, minH = "min-h-48", className }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "grid place-items-center gap-2 text-sm text-muted-foreground",
        fullScreen ? "min-h-screen" : minH,
        className
      )}
    >
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
    </div>
  );
}
