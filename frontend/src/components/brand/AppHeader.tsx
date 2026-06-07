import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";

interface Props {
  /** 返回上级链接。提供时显示左侧"返回"按钮（默认指向 "/" 仪表盘）。 */
  back?: { to: string; label?: string };
  /** 是否显示品牌标。配合 back 时通常关闭。 */
  showBrand?: boolean;
  /** Header 中部内容（面包屑或当前位置）。 */
  center?: ReactNode;
  /** 右侧操作槽。 */
  right?: ReactNode;
  className?: string;
}

/** 强风格页面统一的顶栏：左侧品牌或返回，中部位置标识，右侧操作。 */
export function AppHeader({ back, showBrand = !back, center, right, className }: Props) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-6",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {back && (
          <Link
            to={back.to}
            className="inline-flex h-9 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {back.label ?? "返回"}
          </Link>
        )}
        {showBrand && (
          <Link
            to="/"
            aria-label="返回首页"
            title="返回首页"
            className="inline-flex shrink-0 text-foreground no-underline transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <BrandMark size="sm" />
          </Link>
        )}
        {center && <div className="min-w-0">{center}</div>}
      </div>
      <div className="flex items-center gap-3 text-sm">{right}</div>
    </header>
  );
}
