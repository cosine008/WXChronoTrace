import { MessageSquare } from "lucide-react";

import type { CommentSummaryCount } from "@/api/comments";
import { cn } from "@/lib/utils";

interface CommentBadgeProps {
  summary?: CommentSummaryCount;
  active?: boolean;
  subtle?: boolean;
  title: string;
  ariaLabel: string;
  className?: string;
  onClick: () => void;
}

export function CommentBadge(props: CommentBadgeProps) {
  const totalCount = props.summary?.total_count ?? 0;
  const openCount = props.summary?.open_count ?? 0;
  const unreadCount = props.summary?.unread_count ?? 0;
  const hasComments = totalCount > 0;
  const hasOpen = openCount > 0;
  const hasUnread = unreadCount > 0;

  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.ariaLabel}
      data-has-comments={hasComments ? "true" : "false"}
      data-has-unread={hasUnread ? "true" : "false"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      className={cn(
        "relative inline-grid h-7 min-w-7 shrink-0 place-items-center border bg-background px-1 text-[11px] font-semibold leading-none",
        "text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground",
        !hasComments && props.subtle && !props.active && "opacity-0 group-hover/cell:opacity-100",
        !hasComments && "border-border",
        hasComments && !hasOpen && "border-border text-muted-foreground",
        hasOpen && "border-foreground text-foreground",
        hasUnread && "border-[var(--color-status-info)] text-[var(--color-status-info)]",
        props.active && "opacity-100",
        props.className
      )}
    >
      {hasOpen ? (
        <span className="min-w-4 tabular-nums">{openCount > 99 ? "99+" : openCount}</span>
      ) : (
        <MessageSquare className="size-3.5" aria-hidden />
      )}
      {hasUnread && (
        <span className="absolute -right-1 -top-1 size-2 border border-background bg-[var(--color-status-info)]" />
      )}
    </button>
  );
}
