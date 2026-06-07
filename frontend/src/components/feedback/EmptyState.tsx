import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  /** 主文案，必填。 */
  title: string;
  /** 次级说明文案，可选。 */
  description?: string;
  /** 左侧/顶部图标。 */
  icon?: ReactNode;
  /** 右侧操作（如"新建"按钮）。 */
  action?: ReactNode;
  /** 占整屏；用于路由级"无内容"。 */
  fullScreen?: boolean;
  /** 容器最小高度，默认 12rem。 */
  minH?: string;
  /** 局部面板内可用 start，避免被高侧栏拉成大面积居中空白。 */
  align?: "center" | "start";
  className?: string;
}

/** 统一的空状态占位。SRS 11.10.3。 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  fullScreen,
  minH = "min-h-48",
  align = "center",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "grid gap-2 px-6 py-8",
        align === "center"
          ? "place-items-center text-center"
          : "content-start justify-items-start text-left",
        fullScreen ? "min-h-screen" : minH,
        className
      )}
    >
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <p className="text-sm text-foreground">{title}</p>
      {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
