import { CheckCircle2, RotateCcw } from "lucide-react";

import type { CommentThread } from "@/api/comments";
import type { Collaborator } from "@/api/schemas";
import { cn } from "@/lib/utils";
import { CommentComposer } from "./CommentComposer";

interface CommentThreadListProps {
  threads: CommentThread[];
  collaborators: Collaborator[];
  currentUserId?: number;
  canMutateStatuses?: boolean;
  currentCellValue?: unknown;
  replyingThreadId?: number | null;
  statusThreadId?: number | null;
  onReply: (
    thread: CommentThread,
    payload: { body: string; mentionUserIds: number[] }
  ) => Promise<void> | void;
  onResolve: (thread: CommentThread) => void;
  onReopen: (thread: CommentThread) => void;
}

export function CommentThreadList(props: CommentThreadListProps) {
  const threads = [...props.threads].sort(compareThreads);
  if (threads.length === 0) {
    return (
      <div className="border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
        暂无评论
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {threads.map((thread) => {
        const resolved = thread.status === "resolved";
        const canMutate =
          props.canMutateStatuses || thread.created_by_id === props.currentUserId;
        return (
          <article
            key={thread.id}
            className={cn(
              "border border-border bg-background",
              resolved && "bg-muted/20 text-muted-foreground"
            )}
          >
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{thread.created_by_username}</span>
                  <span className={cn("border px-1.5 py-0.5 text-[11px]", statusClass(thread))}>
                    {resolved ? "resolved" : "open"}
                  </span>
                  {thread.unread && (
                    <span className="border border-[var(--color-status-info)] px-1.5 py-0.5 text-[11px] text-[var(--color-status-info)]">
                      unread
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  #{thread.id} · {formatDateTime(thread.last_activity_at)}
                </div>
              </div>
              {canMutate && (
                <button
                  type="button"
                  disabled={props.statusThreadId === thread.id}
                  className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-60"
                  onClick={() =>
                    thread.status === "resolved"
                      ? props.onReopen(thread)
                      : props.onResolve(thread)
                  }
                >
                  {thread.status === "resolved" ? (
                    <RotateCcw className="size-3.5" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-3.5" aria-hidden />
                  )}
                  {thread.status === "resolved" ? "reopen" : "resolve"}
                </button>
              )}
            </header>
            <div className="grid gap-3 px-3 py-3">
              {thread.anchor_type === "cell" && (
                <ThreadContextSnapshot thread={thread} currentValue={props.currentCellValue} />
              )}
              <div className="grid gap-2">
                {thread.comments.map((comment) => (
                  <div key={comment.id} className="border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {comment.created_by_username}
                      </span>
                      <span>{formatDateTime(comment.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
                    {comment.mentions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {comment.mentions.map((mention) => (
                          <span
                            key={`${comment.id}:${mention.user_id}`}
                            className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            @{mention.username}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <CommentComposer
                collaborators={props.collaborators}
                submitting={props.replyingThreadId === thread.id}
                submitLabel="回复"
                placeholder="输入回复"
                onSubmit={(payload) => props.onReply(thread, payload)}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ThreadContextSnapshot(props: { thread: CommentThread; currentValue: unknown }) {
  const createdValue = props.thread.context.value_snapshot;
  const currentValue = props.currentValue;
  const changed = !sameValue(createdValue, currentValue);
  return (
    <div className="grid gap-1 border border-border bg-muted/20 px-2 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span>创建时值</span>
        <span className="font-mono text-foreground">{formatValue(createdValue)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>当前值</span>
        <span className="font-mono text-foreground">{formatValue(currentValue)}</span>
        {changed && (
          <span className="border border-[var(--color-status-warning)] px-1.5 py-0.5 text-[var(--color-status-warning)]">
            当前值与创建时值不同
          </span>
        )}
      </div>
      <div>
        上下文日期 {props.thread.context.created_at_context_date ?? "-"} · 有效期{" "}
        {props.thread.context.valid_from ?? "-"} 至 {props.thread.context.valid_to ?? "至今"}
      </div>
    </div>
  );
}

function compareThreads(left: CommentThread, right: CommentThread) {
  if (left.status !== right.status) return left.status === "open" ? -1 : 1;
  return new Date(right.last_activity_at).getTime() - new Date(left.last_activity_at).getTime();
}

function statusClass(thread: CommentThread) {
  if (thread.status === "resolved") return "border-border text-muted-foreground";
  return "border-foreground text-foreground";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sameValue(left: unknown, right: unknown) {
  return formatValue(left) === formatValue(right);
}
