import { AlertTriangle, ArrowRight, Ban, LockKeyhole, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";

import type { LabelScanResult } from "@/api/labels";
import { cn } from "@/lib/utils";

const STATE_COPY = {
  login_required: { title: "需要登录", message: "登录后继续查看现场视图。", icon: LockKeyhole },
  denied: { title: "无权查看", message: "当前账号没有该实体所属表的查看权限。", icon: Ban },
  revoked: { title: "标签已作废", message: "该物理标签不再指向现场视图。", icon: AlertTriangle },
  replaced: { title: "标签已替换", message: "请使用新的实体标签。", icon: RotateCcw },
  not_found: { title: "标签不存在", message: "系统没有找到对应的物理标签。", icon: AlertTriangle },
  invalid: { title: "无效标签码", message: "标签码格式不符合 ChronoTrace 规则。", icon: AlertTriangle },
} as const;

export function LabelStateView({ result, className }: { result: LabelScanResult; className?: string }) {
  if (result.outcome === "resolved") return null;
  const copy = STATE_COPY[result.outcome];
  const Icon = copy.icon;
  return (
    <section
      className={cn(
        "mx-auto grid min-h-[58vh] w-full max-w-3xl place-items-center px-6 py-16",
        className
      )}
    >
      <div className="grid w-full gap-6 border-y border-border py-8">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center border border-current">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase text-muted-foreground">{result.outcome}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">{copy.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{result.message ?? copy.message}</p>
          </div>
        </div>

        {result.outcome === "replaced" && result.replacement && (
          <Link
            to={`/scan/${result.replacement.label_code}`}
            className="inline-flex h-10 w-fit items-center gap-2 border border-border px-3 text-sm hover:border-foreground"
          >
            <ArrowRight className="size-4" aria-hidden />
            {result.replacement.label_code}
          </Link>
        )}
      </div>
    </section>
  );
}
