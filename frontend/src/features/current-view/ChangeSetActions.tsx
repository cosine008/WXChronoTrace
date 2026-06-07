import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, NotebookPen, RotateCcw, Send, X } from "lucide-react";

import { createNote, createWorkbenchLink } from "@/api/workbench";
import type { ChangeSetSummary } from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import { workbenchKeys } from "@/features/workbench/useWorkbenchQueries";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { cn } from "@/lib/utils";

export function ChangeSetActions(props: {
  detail: ChangeSetSummary;
  schemaId: number;
  currentUserId?: number;
  canEdit: boolean;
  approverChoices: Array<{ id: number; username: string }>;
  loading: boolean;
  entryActionLoading: boolean;
  onSubmit: (id: number, payload: { summary: string; approver_id?: number }) => void;
  onApprove: (id: number) => void;
  onReject: (id: number, payload: { reason: string }) => void;
  onRevert: (id: number) => void;
  onDiscardDraft: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [summary, setSummary] = useState(props.detail.summary);
  const [approverId, setApproverId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [savedNoteKey, setSavedNoteKey] = useState<string | null>(null);

  const ownsDraft = props.detail.created_by_id === props.currentUserId;
  const canSubmit = props.canEdit && ownsDraft && props.detail.status === "draft";
  const canApprove =
    props.detail.status === "submitted" && props.detail.approver_id === props.currentUserId;
  const canRevert = props.canEdit && props.detail.status === "applied";
  const reason = unavailableReason(props.detail, props.canEdit, ownsDraft, canApprove);
  const currentNoteKey = buildChangeSetNoteKey(props.detail, summary, rejectReason);
  const saveNoteMutation = useMutation({
    mutationFn: async () => {
      const savedKey = buildChangeSetNoteKey(props.detail, summary, rejectReason);
      const note = await createNote({
        title: `审批记录 · ${currentSummaryValue(summary, props.detail.summary)}`,
        summary: buildChangeSetNoteSummary(props.detail),
        tags: [],
        markdown_content: buildChangeSetNoteMarkdown(props.detail, summary, rejectReason),
        stage: "approval",
        status: "normal",
      });

      try {
        await createWorkbenchLink({
          source_item_id: note.id,
          target_schema_id: props.schemaId,
        });
        return { note, linkFailed: false as const, savedKey };
      } catch (linkError) {
        return { note, linkFailed: true as const, linkError, savedKey };
      }
    },
    onSuccess: async ({ note, linkFailed, linkError, savedKey }) => {
      setSavedNoteKey(savedKey);
      if (!linkFailed) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: workbenchKeys.all }),
          queryClient.invalidateQueries({ queryKey: ["schema-workbench", props.schemaId, "items"] }),
        ]);
        notify.success({
          title: "工作台笔记已保存",
          message: `${note.title} 已关联当前数据表`,
        });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: workbenchKeys.all });
      const apiError = extractApiError(linkError);
      notify.info({
        title: "笔记已保存，但未完成关联",
        message: `${note.title} 已保留在工作台，可稍后补链。${apiError.message ? ` ${apiError.message}` : ""}`.trim(),
      });
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "保存工作台笔记失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const saveNoteDisabled = saveNoteMutation.isPending || savedNoteKey === currentNoteKey;

  const eligibleApprovers = props.approverChoices.filter(
    (item) => item.id !== props.detail.created_by_id
  );

  return (
    <div className="grid gap-2 border border-border bg-muted/30 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-background px-3 py-2">
        <div className="text-xs text-muted-foreground">
          将当前批次摘要保存为个人工作台笔记，不影响审批或提交流程。
        </div>
        <ActionButton
          icon={
            saveNoteMutation.isPending ? (
              <span className="inline-flex size-4 items-center justify-center">
                <span className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />
              </span>
            ) : (
              <NotebookPen className="size-4" aria-hidden />
            )
          }
          label={savedNoteKey === currentNoteKey ? "已保存为工作台笔记" : "保存为工作台笔记"}
          disabled={saveNoteDisabled}
          onClick={() => saveNoteMutation.mutate()}
          testId="changeset-save-note-button"
        />
      </div>
      {!canSubmit && !canApprove && !canRevert && reason && (
        <div className="border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {reason}
        </div>
      )}
      {canSubmit && (
        <div className="grid gap-2">
          <input
            id={`changeset-summary-${props.detail.id}`}
            name="changeset_summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="h-8 border border-border bg-background px-2 text-sm outline-none"
            placeholder="发布摘要"
          />
          {props.detail.approval_required && (
            <select
              id={`changeset-approver-${props.detail.id}`}
              name="approver_id"
              value={approverId}
              onChange={(event) => setApproverId(event.target.value)}
              className="h-8 border border-border bg-background px-2 text-sm outline-none"
              aria-label="审批人"
            >
              <option value="">选择审批人 (owner / editor)</option>
              {eligibleApprovers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
            </select>
          )}
          <ActionButton
            icon={<Send className="size-4" aria-hidden />}
            label={props.detail.approval_required ? "提交审批" : "发布生效"}
            disabled={
              props.loading ||
              props.detail.entry_count === 0 ||
              !summary.trim() ||
              (props.detail.approval_required && !approverId)
            }
            onClick={() =>
              props.onSubmit(props.detail.id, {
                summary,
                approver_id: approverId ? Number(approverId) : undefined,
              })
            }
          />
          <ActionButton
            icon={<X className="size-4" aria-hidden />}
            label="放弃草稿"
            disabled={props.entryActionLoading}
            tone="destructive"
            onClick={() => props.onDiscardDraft(props.detail.id)}
          />
        </div>
      )}
      {canApprove && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              icon={<Check className="size-4" aria-hidden />}
              label="通过"
              disabled={props.loading}
              onClick={() => props.onApprove(props.detail.id)}
            />
            <ActionButton
              icon={<X className="size-4" aria-hidden />}
              label="驳回"
              disabled={props.loading}
              onClick={() => props.onReject(props.detail.id, { reason: rejectReason })}
            />
          </div>
          <input
            id={`changeset-reject-reason-${props.detail.id}`}
            name="reject_reason"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            className="h-8 border border-border bg-background px-2 text-sm outline-none"
            placeholder="驳回原因"
          />
        </div>
      )}
      {canRevert && (
        <ActionButton
          icon={<RotateCcw className="size-4" aria-hidden />}
          label="回滚"
          disabled={props.loading}
          onClick={() => props.onRevert(props.detail.id)}
        />
      )}
    </div>
  );
}

function unavailableReason(
  detail: ChangeSetSummary,
  canEdit: boolean,
  ownsDraft: boolean,
  canApprove: boolean
) {
  if (detail.status === "draft" && !ownsDraft) return "仅草稿创建者可以提交或放弃该批次。";
  if (detail.status === "draft" && !canEdit) return "当前账号没有提交草稿的编辑权限。";
  if (detail.status === "submitted" && !canApprove) return "仅指定审批人可以通过或驳回该批次。";
  if (detail.status === "applied" && !canEdit) return "当前账号没有回滚已生效批次的编辑权限。";
  return "";
}

function ActionButton(props: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  tone?: "default" | "destructive";
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      data-testid={props.testId}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-2 border border-border bg-background px-2 text-sm hover:border-foreground disabled:opacity-40",
        props.tone === "destructive" && "text-[var(--color-status-error)]"
      )}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function currentSummaryValue(localSummary: string, fallback: string) {
  return localSummary.trim() || fallback.trim() || "未命名批次";
}

function buildChangeSetNoteSummary(detail: ChangeSetSummary) {
  return `状态 ${changeSetStatusLabel(detail.status)} / 来源 ${changeSetSourceLabel(detail.source)} / ${detail.entry_count} 条明细`;
}

function buildChangeSetNoteMarkdown(
  detail: ChangeSetSummary,
  localSummary: string,
  localRejectReason: string
) {
  const sections = [
    "# ChangeSet 审批记录",
    "",
    `- ChangeSet ID: #${detail.id}`,
    `- Schema ID: ${detail.schema_id}`,
    `- 摘要: ${currentSummaryValue(localSummary, detail.summary)}`,
    `- 状态: ${changeSetStatusLabel(detail.status)}`,
    `- 来源: ${changeSetSourceLabel(detail.source)}`,
    `- 创建人: ${detail.created_by_username}`,
    `- 明细数: ${detail.entry_count}`,
    `- 新增: ${detail.action_counts.create}`,
    `- 更新: ${detail.action_counts.update}`,
    `- 终止: ${detail.action_counts.terminate}`,
  ];

  if (localRejectReason.trim()) {
    sections.push(`- 当前驳回原因: ${localRejectReason.trim()}`);
  }

  return sections.join("\n");
}

function buildChangeSetNoteKey(
  detail: ChangeSetSummary,
  localSummary: string,
  localRejectReason: string
) {
  return JSON.stringify({
    id: detail.id,
    status: detail.status,
    detailSummary: detail.summary,
    currentSummary: currentSummaryValue(localSummary, detail.summary),
    rejectReason: localRejectReason.trim(),
  });
}

function changeSetStatusLabel(status: ChangeSetSummary["status"]) {
  if (status === "draft") return "草稿";
  if (status === "submitted") return "已提交";
  if (status === "approved") return "已批准";
  if (status === "rejected") return "已驳回";
  if (status === "applied") return "已生效";
  if (status === "reverted") return "已回滚";
  return status;
}

function changeSetSourceLabel(source: ChangeSetSummary["source"]) {
  if (source === "manual") return "手工";
  if (source === "excel") return "Excel";
  if (source === "api") return "API";
  if (source === "revert") return "回滚";
  return source;
}
