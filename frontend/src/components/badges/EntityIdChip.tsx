import { cn } from "@/lib/utils";

interface Props {
  code: string;
  onCopy?: () => void;
  className?: string;
  copyable?: boolean;
}

/** business_code / entity_id 展示,等宽+可复制。对照 SRS 7.4.2 */
export function EntityIdChip({ code, onCopy, className, copyable = true }: Props) {
  const handleClick = async () => {
    await navigator.clipboard?.writeText(code);
    onCopy?.();
  };
  const chipClassName = cn(
    "inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs transition-colors",
    copyable && "hover:border-foreground cursor-pointer",
    className
  );

  if (!copyable) {
    return <span className={chipClassName}>{code}</span>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="点击复制"
      className={chipClassName}
    >
      {code}
    </button>
  );
}
