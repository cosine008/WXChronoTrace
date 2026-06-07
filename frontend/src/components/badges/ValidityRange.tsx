import { cn } from "@/lib/utils";

interface Props {
  from: string;
  to?: string | null;
  className?: string;
}

/** valid_from / valid_to 展示。对照 SRS 7.4.2 */
export function ValidityRange({ from, to, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs tabular",
        className
      )}
    >
      <span className="text-foreground">{from}</span>
      <span className="text-muted-foreground">→</span>
      <span
        className={cn(to ? "text-foreground" : "text-muted-foreground italic")}
      >
        {to ?? "至今"}
      </span>
    </span>
  );
}
