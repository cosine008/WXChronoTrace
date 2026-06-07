import { cn } from "@/lib/utils";

type Status = "new" | "modified" | "terminated" | "error";

const CONFIG: Record<Status, string> = {
  new: "bg-[var(--color-status-new)]",
  modified: "bg-[var(--color-status-modified)]",
  terminated: "bg-[var(--color-status-terminated)]",
  error: "bg-[var(--color-status-error)]",
};

interface Props {
  status: Status;
  className?: string;
}

/** 表格行左侧状态细线(3px)。对照 SRS 11.10.1 */
export function RowStatusStripe({ status, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-0 top-0 bottom-0 w-[3px]",
        CONFIG[status],
        className
      )}
    />
  );
}
