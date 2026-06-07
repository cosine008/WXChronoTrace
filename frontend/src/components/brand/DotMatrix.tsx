import { cn } from "@/lib/utils";

interface Props {
  /** 字符总长度，默认 14。 */
  length?: number;
  /** 装饰强度（0-1），用于设置不透明度。默认 0.6。 */
  intensity?: number;
  className?: string;
  ariaLabel?: string;
}

/** Nothing 风装饰条：单一字符重复，作为强风格页面的"机械感"标记。SRS 4.1 / 6.1。 */
export function DotMatrix({ length = 14, intensity = 0.6, className, ariaLabel }: Props) {
  return (
    <div
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={cn(
        "font-dot select-none tracking-[0.4em] leading-none",
        className
      )}
      style={{ opacity: intensity }}
    >
      {"▮".repeat(length)}
    </div>
  );
}
