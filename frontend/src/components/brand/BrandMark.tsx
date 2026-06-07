import { cn } from "@/lib/utils";

interface Props {
  size?: "sm" | "md" | "lg";
  /** 是否带副标题（中文：时溯）。 */
  withTagline?: boolean;
  align?: "start" | "center";
  className?: string;
}

const SIZE = {
  sm: "text-base",
  md: "text-2xl",
  lg: "text-[40px]",
} as const;

/** 品牌标。强风格页面顶部统一气质。 */
export function BrandMark({ size = "md", withTagline = false, align = "start", className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 leading-none",
        align === "center" ? "items-center text-center" : "items-start",
        className
      )}
    >
      <span className={cn("font-display font-bold tracking-tight", SIZE[size])}>
        CHRONOTRACE
      </span>
      {withTagline && (
        <span className="text-sm tracking-wide text-muted-foreground">
          时溯 · 数据版本管理平台
        </span>
      )}
    </div>
  );
}
