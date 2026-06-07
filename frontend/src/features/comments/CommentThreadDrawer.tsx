import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addComment,
  createCommentThread,
  listCommentThreads,
  markCommentThreadRead,
  reopenCommentThread,
  resolveCommentThread,
  type CommentThread,
} from "@/api/comments";
import type { Collaborator } from "@/api/schemas";
import { CurrentViewDrawer } from "@/features/current-view/CurrentViewDrawer";
import { useAuthStore } from "@/stores/auth";
import { CommentComposer } from "./CommentComposer";
import { CommentThreadList } from "./CommentThreadList";
import type { CommentAnchor } from "./commentAnchors";

interface CommentThreadDrawerProps {
  anchor: CommentAnchor | null;
  open: boolean;
  collaborators: Collaborator[];
  canMutateStatuses?: boolean;
  onClose: () => void;
}

const EMPTY_THREADS: CommentThread[] = [];

export function CommentThreadDrawer(props: CommentThreadDrawerProps) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const queryKey = useMemo(() => commentThreadQueryKey(props.anchor), [props.anchor]);
  const currentCellValue = props.anchor?.anchorType === "cell" ? props.anchor.value : undefined;
  const threadsQuery = useQuery({
    queryKey,
    queryFn: () => listCommentThreads(listParams(props.anchor)),
    enabled: props.open && props.anchor !== null,
  });
  const createMutation = useMutation({
    mutationFn: (payload: { body: string; mentionUserIds: number[] }) =>
      createCommentThread(createPayload(props.anchor, payload)),
    onSuccess: async () => {
      await invalidateCommentQueries(queryClient, props.anchor);
    },
  });
  const replyMutation = useMutation({
    mutationFn: (vars: {
      thread: CommentThread;
      payload: { body: string; mentionUserIds: number[] };
    }) => addComment(vars.thread.id, vars.payload),
    onSuccess: async () => {
      await invalidateCommentQueries(queryClient, props.anchor);
    },
  });
  const statusMutation = useMutation({
    mutationFn: (thread: CommentThread) =>
      thread.status === "resolved"
        ? reopenCommentThread(thread.id)
        : resolveCommentThread(thread.id),
    onSuccess: async () => {
      await invalidateCommentQueries(queryClient, props.anchor);
    },
  });
  const readMutation = useMutation({
    mutationFn: (threadId: number) => markCommentThreadRead(threadId),
    onSuccess: async () => {
      await invalidateCommentQueries(queryClient, props.anchor);
    },
  });
  const threads = threadsQuery.data ?? EMPTY_THREADS;
  const unreadThreadIds = useMemo(
    () => threads.filter((thread) => thread.unread).map((thread) => thread.id),
    [threads]
  );

  useEffect(() => {
    if (!props.open || unreadThreadIds.length === 0 || readMutation.isPending) return;
    readMutation.mutate(unreadThreadIds[0]);
  }, [props.open, readMutation, unreadThreadIds]);

  return (
    <CurrentViewDrawer
      open={props.open && props.anchor !== null}
      title="评论"
      description={props.anchor ? anchorDescription(props.anchor) : undefined}
      meta={threadsQuery.isFetching ? "loading" : `${threads.length} threads`}
      size="md"
      testId="comment-thread-drawer"
      closeTestId="comment-thread-drawer-close"
      onRequestClose={props.onClose}
    >
      {props.anchor && (
        <div className="grid gap-4">
          <section className="grid gap-2">
            <div className="text-sm font-semibold">新建线程</div>
            <CommentComposer
              collaborators={props.collaborators}
              submitting={createMutation.isPending}
              submitLabel="创建"
              placeholder="输入评论"
              onSubmit={async (payload) => {
                await createMutation.mutateAsync(payload);
              }}
            />
          </section>
          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">线程</h3>
              {threadsQuery.isError && (
                <button
                  type="button"
                  className="border border-border px-2 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                  onClick={() => void threadsQuery.refetch()}
                >
                  重试
                </button>
              )}
            </div>
            <CommentThreadList
              threads={threads}
              collaborators={props.collaborators}
              currentUserId={currentUser?.id}
              canMutateStatuses={props.canMutateStatuses}
              currentCellValue={currentCellValue}
              replyingThreadId={
                replyMutation.isPending ? (replyMutation.variables?.thread.id ?? null) : null
              }
              statusThreadId={statusMutation.isPending ? (statusMutation.variables?.id ?? null) : null}
              onReply={async (thread, payload) => {
                await replyMutation.mutateAsync({ thread, payload });
              }}
              onResolve={(thread) => statusMutation.mutate(thread)}
              onReopen={(thread) => statusMutation.mutate(thread)}
            />
          </section>
        </div>
      )}
    </CurrentViewDrawer>
  );
}

function commentThreadQueryKey(anchor: CommentAnchor | null) {
  return [
    "comment-threads",
    anchor?.schemaId,
    anchor?.anchorType,
    anchor?.entityId,
    anchor?.anchorType === "cell" ? anchor.fieldKey : "",
  ];
}

function listParams(anchor: CommentAnchor | null) {
  if (!anchor) throw new Error("comment anchor is required");
  return {
    schemaId: anchor.schemaId,
    anchorType: anchor.anchorType,
    entityId: anchor.entityId,
    fieldKey: anchor.anchorType === "cell" ? anchor.fieldKey : undefined,
  };
}

function createPayload(
  anchor: CommentAnchor | null,
  payload: { body: string; mentionUserIds: number[] }
) {
  if (!anchor) throw new Error("comment anchor is required");
  return {
    schemaId: anchor.schemaId,
    anchorType: anchor.anchorType,
    entityId: anchor.entityId,
    fieldKey: anchor.anchorType === "cell" ? anchor.fieldKey : "",
    contextDate: anchor.anchorType === "cell" ? anchor.contextDate : undefined,
    recordId: anchor.anchorType === "cell" ? anchor.recordId : undefined,
    body: payload.body,
    mentionUserIds: payload.mentionUserIds,
  };
}

async function invalidateCommentQueries(queryClient: ReturnType<typeof useQueryClient>, anchor: CommentAnchor | null) {
  if (!anchor) return;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["comment-threads"] }),
    queryClient.invalidateQueries({ queryKey: ["comment-summary", anchor.schemaId] }),
  ]);
}

function anchorDescription(anchor: CommentAnchor) {
  if (anchor.anchorType === "row") {
    return `${anchor.displayCode} · row`;
  }
  return `${anchor.displayCode} · ${anchor.fieldLabel}`;
}
