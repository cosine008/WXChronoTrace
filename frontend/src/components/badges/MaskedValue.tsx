import { cn } from "@/lib/utils";

type Kind = "empty" | "no-permission" | "masked";

const CONFIG: Record<Kind, { display: string; title: string }> = {
  empty: { display: "—", title: "未录入" },
  "no-permission": { display: "—", title: "无权查看" },
  masked: { display: "***", title: "已脱敏" },
};

interface Props {
  kind: Kind;
  className?: string;
}

/** 无权限 / 脱敏 / 空值的统一展示。对照 SRS 11.10.1 */
export function MaskedValue({ kind, className }: Props) {
  const cfg = CONFIG[kind];
  return (
    <span
      title={cfg.title}
      className={cn(
        "inline-block font-mono text-muted-foreground select-none",
        kind === "masked" && "tracking-wider",
        className
      )}
    >
      {cfg.display}
    </span>
  );
}
