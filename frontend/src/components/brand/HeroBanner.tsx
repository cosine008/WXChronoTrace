import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { DotMatrix } from "./DotMatrix";

interface Props {
  /** 主标题，例如"我的表"。 */
  title: string;
  /** 英文/简短副标题，例如 "DataSchema workspace"。 */
  subtitle?: string;
  /** 左上角的极小标签（默认 "WORKSPACE / 工作台"）。 */
  eyebrow?: string;
  /** 顶部右侧元数据，例如版本号或时间戳。 */
  meta?: ReactNode;
  /** 右侧主操作（按钮）。 */
  action?: ReactNode;
  className?: string;
}

/** 强风格页面顶部的标题区。点阵装饰 + 极小标签 + 主标题三段式，禁止用作营销 hero。
 *  设计原则：单色 / 排版驱动 / 点阵装饰；不使用渐变和装饰图。SRS 4.1 / 6.1 / 7。 */
export function HeroBanner({
  title,
  subtitle,
  eyebrow = "WORKSPACE / 工作台",
  meta,
  action,
  className,
}: Props) {
  return (
    <section
      className={cn(
        "flex min-w-0 max-w-full flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <DotMatrix length={6} intensity={0.45} className="shrink-0 text-xs" />
          <span className="min-w-0 break-words font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {eyebrow}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words font-display text-3xl font-semibold tracking-tight md:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="break-words font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 md:flex-col md:items-end md:gap-2">
        {meta && (
          <div className="min-w-0 break-words font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {meta}
          </div>
        )}
        {action}
      </div>
    </section>
  );
}
