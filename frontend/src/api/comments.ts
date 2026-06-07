import { api } from "@/lib/api";

export type CommentAnchorType = "row" | "cell";
export type CommentThreadStatus = "open" | "resolved";

export interface CommentSummaryCount {
  open_count: number;
  total_count: number;
  unread_count: number;
}

export interface EntityCommentSummary {
  row: CommentSummaryCount;
  cells: Record<string, CommentSummaryCount>;
}

export interface CommentSummaryResponse {
  schema_id: number;
  entities: Record<string, EntityCommentSummary>;
}

export interface CommentMention {
  user_id: number;
  username: string;
}

export interface CommentThreadComment {
  id: number;
  body: string;
  body_format: "plain";
  created_by_id: number;
  created_by_username: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  is_system: boolean;
  mentions: CommentMention[];
}

export interface CommentThreadContext {
  created_at_context_date: string | null;
  record_id_at_creation: number | null;
  valid_from: string | null;
  valid_to: string | null;
  value_snapshot: unknown;
}

export interface CommentThread {
  id: number;
  schema_id: number;
  anchor_type: CommentAnchorType;
  entity_id: number;
  field_key: string;
  status: CommentThreadStatus;
  created_by_id: number;
  created_by_username: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  resolved_by_id: number | null;
  resolved_by_username: string;
  resolved_at: string | null;
  comment_count: number;
  context: CommentThreadContext;
  comments: CommentThreadComment[];
  unread: boolean;
}

export interface ListCommentThreadsParams {
  schemaId: number;
  anchorType?: CommentAnchorType;
  entityId?: number;
  fieldKey?: string;
}

export interface CreateCommentThreadPayload {
  schemaId: number;
  anchorType: CommentAnchorType;
  entityId: number;
  fieldKey?: string;
  contextDate?: string;
  recordId?: number;
  body: string;
  mentionUserIds?: number[];
}

export interface AddCommentPayload {
  body: string;
  mentionUserIds?: number[];
}

interface CommentThreadListResponse {
  count: number;
  results: CommentThread[];
}

export async function getCommentSummary(
  schemaId: number,
  entityIds: number[]
): Promise<CommentSummaryResponse> {
  const { data } = await api.get<CommentSummaryResponse>("/comments/summary/", {
    params: {
      schema_id: schemaId,
      entity_ids: entityIds.join(","),
    },
  });
  return data;
}

export async function listCommentThreads(
  params: ListCommentThreadsParams
): Promise<CommentThread[]> {
  const { data } = await api.get<CommentThreadListResponse>("/comments/threads/", {
    params: compactParams({
      schema_id: params.schemaId,
      anchor_type: params.anchorType,
      entity_id: params.entityId,
      field_key: params.fieldKey,
    }),
  });
  return data.results;
}

export async function createCommentThread(
  payload: CreateCommentThreadPayload
): Promise<CommentThread> {
  const { data } = await api.post<CommentThread>("/comments/threads/", {
    schema_id: payload.schemaId,
    anchor_type: payload.anchorType,
    entity_id: payload.entityId,
    field_key: payload.fieldKey ?? "",
    context_date: payload.contextDate,
    record_id: payload.recordId,
    body: payload.body,
    mention_user_ids: payload.mentionUserIds ?? [],
  });
  return data;
}

export async function addComment(
  threadId: number,
  payload: AddCommentPayload
): Promise<CommentThread> {
  const { data } = await api.post<CommentThread>(`/comments/threads/${threadId}/comments/`, {
    body: payload.body,
    mention_user_ids: payload.mentionUserIds ?? [],
  });
  return data;
}

export async function resolveCommentThread(threadId: number): Promise<CommentThread> {
  const { data } = await api.patch<CommentThread>(`/comments/threads/${threadId}/resolve/`);
  return data;
}

export async function reopenCommentThread(threadId: number): Promise<CommentThread> {
  const { data } = await api.patch<CommentThread>(`/comments/threads/${threadId}/reopen/`);
  return data;
}

export async function markCommentThreadRead(threadId: number): Promise<CommentThread> {
  const { data } = await api.post<CommentThread>(`/comments/threads/${threadId}/read/`);
  return data;
}

function compactParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
