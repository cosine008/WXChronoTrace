import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function NoteDrawerActionButton(props: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "default" | "destructive";
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        "inline-flex h-8 min-w-0 items-center justify-center gap-1 whitespace-nowrap border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60",
        props.tone === "destructive"
          ? "border-[var(--color-status-error)] text-[var(--color-status-error)]"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
      ].join(" ")}
      aria-label={props.label}
    >
      {props.loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : props.icon}
      {props.label}
    </button>
  );
}
