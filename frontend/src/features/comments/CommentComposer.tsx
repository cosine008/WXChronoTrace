import { useMemo, useState, type KeyboardEvent } from "react";
import { Loader2, Send } from "lucide-react";

import type { Collaborator } from "@/api/schemas";
import { cn } from "@/lib/utils";

interface CommentComposerProps {
  collaborators: Collaborator[];
  placeholder?: string;
  submitLabel?: string;
  submitting?: boolean;
  className?: string;
  onSubmit: (payload: { body: string; mentionUserIds: number[] }) => Promise<void> | void;
}

export function CommentComposer(props: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [mentionUserIds, setMentionUserIds] = useState<number[]>([]);
  const trimmedBody = body.trim();
  const canSubmit = trimmedBody.length > 0 && !props.submitting;
  const collaboratorOptions = useMemo(
    () => props.collaborators.filter((item) => item.is_employed !== false),
    [props.collaborators]
  );

  async function submit() {
    if (!canSubmit) return;
    await props.onSubmit({ body: trimmedBody, mentionUserIds });
    setBody("");
    setMentionUserIds([]);
  }

  return (
    <div className={cn("grid gap-2", props.className)}>
      <textarea
        value={body}
        placeholder={props.placeholder ?? "输入评论"}
        disabled={props.submitting}
        rows={3}
        className="min-h-24 w-full resize-y border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground disabled:opacity-60"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => void handleKeyDown(event, submit)}
      />
      {collaboratorOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {collaboratorOptions.map((collaborator) => {
            const checked = mentionUserIds.includes(collaborator.user_id);
            return (
              <label
                key={collaborator.user_id}
                className={cn(
                  "inline-flex h-7 cursor-pointer items-center gap-1 border px-2 text-xs",
                  checked
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={props.submitting}
                  onChange={() => toggleMention(collaborator.user_id)}
                />
                @{collaborator.username}
              </label>
            );
          })}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canSubmit}
          className="inline-flex h-8 items-center gap-1.5 border border-foreground bg-foreground px-3 text-sm font-medium text-background disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
          onClick={() => void submit()}
        >
          {props.submitting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="size-3.5" aria-hidden />
          )}
          {props.submitLabel ?? "发送"}
        </button>
      </div>
    </div>
  );

  function toggleMention(userId: number) {
    setMentionUserIds((current) =>
      current.includes(userId)
        ? current.filter((item) => item !== userId)
        : [...current, userId]
    );
  }
}

async function handleKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  submit: () => Promise<void>
) {
  if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  await submit();
}
