import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import {
  approveChangeSet,
  getSchemaChangeset,
  listPendingChangeSets,
  rejectChangeSet,
  type ChangeSetSummary,
} from "@/api/schemas";
import { ChangeBadge, StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { ChangeEntryCard } from "@/features/current-view/ChangeEntryCard";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { cn } from "@/lib/utils";

export function PendingApprovalsPage() {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [searchParams] = useSearchParams();
  const targetChangeSetId = parsePositiveInt(searchParams.get("changeset_id"));
  const query = useQuery({ queryKey: ["pending-changesets"], queryFn: () => listPendingChangeSets() });
  const items = query.data?.results ?? [];
  const action = useMutation({
    mutationFn: (vars: { type: "approve" | "reject"; id: number; reason?: string }) =>
      vars.type === "approve" ? approveChangeSet(vars.id) : rejectChangeSet(vars.id, { reason: vars.reason }),
    onSuccess: async (detail, vars) => {
      notify.success({
        title: vars.type === "approve" ? "审批已通过" : "审批已驳回",
        message: `批次 #${detail.id} · ${detail.summary}`,
      });
      await queryClient.invalidateQueries({ queryKey: ["pending-changesets"] });
    },
    onError: (err, vars) => {
      const apiError = extractApiError(err);
      notify.error({
        title: vars.type === "approve" ? "通过审批失败" : "驳回审批失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  async function handleApprove(item: ChangeSetSummary) {
    const confirmed = await notify.confirm({
      title: "确认通过审批",
      description: "通过后，该变更批次会继续流转或按规则生效。",
      impactSummary: [
        `批次 #${item.id}`,
        `摘要：${item.summary}`,
        `提交人：${item.created_by_username}`,
        formatActionCounts(item),
      ],
      confirmLabel: "确认通过",
      cancelLabel: "取消",
    });
    if (confirmed) action.mutate({ type: "approve", id: item.id });
  }

  async function handleReject(item: ChangeSetSummary, reason: string) {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      notify.error({
        title: "驳回原因缺失",
        message: "请先填写驳回原因，再驳回该变更批次。",
      });
      return;
    }
    const confirmed = await notify.confirm({
      title: "确认驳回审批",
      description: "驳回后，该变更批次会退回给提交人继续调整。",
      impactSummary: [
        `批次 #${item.id}`,
        `摘要：${item.summary}`,
        formatActionCounts(item),
        `驳回原因：${trimmedReason}`,
      ],
      confirmLabel: "确认驳回",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) action.mutate({ type: "reject", id: item.id, reason: trimmedReason });
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid max-w-6xl gap-4 p-6">
        <section className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">我的待审批</h1>
            <p className="mt-1 text-sm text-muted-foreground">待处理变更批次</p>
          </div>
          {query.isFetching && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </section>
        <section className="nd-interactive-surface divide-y divide-border border border-border">
          {items.length === 0 ? (
            <EmptyState
              title="暂无待审批"
              description="当前没有需要你处理的变更批次。"
              minH="min-h-44"
            />
          ) : (
            items.map((item) => (
              <ApprovalRow
                key={`${item.id}:${targetChangeSetId === item.id ? "target" : "normal"}`}
                item={item}
                loading={action.isPending}
                isTargeted={targetChangeSetId === item.id}
                onApprove={() => void handleApprove(item)}
                onReject={(reason) => void handleReject(item, reason)}
              />
            ))
          )}
        </section>
      </main>
    </div>
  );
}

function ApprovalRow(props: {
  item: ChangeSetSummary;
  loading: boolean;
  isTargeted: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [expanded, setExpanded] = useState(props.isTargeted);
  const [reason, setReason] = useState("");
  const detailQuery = useQuery({
    queryKey: ["approval-changeset", props.item.schema_id, props.item.id],
    queryFn: () => getSchemaChangeset(props.item.schema_id, props.item.id),
    enabled: expanded,
  });
  const detail = detailQuery.data;

  return (
    <article
      className={cn(
        "nd-interactive-row grid gap-3 px-4 py-3",
        props.isTargeted && "border-l-2 border-foreground bg-muted/30"
      )}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{props.item.summary}</h2>
            <StatusBadge variant={props.item.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <ChangeBadge kind="new" count={props.item.action_counts.create} mutedWhenZero />
            <ChangeBadge kind="modified" count={props.item.action_counts.update} mutedWhenZero />
            <ChangeBadge
              kind="terminated"
              count={props.item.action_counts.terminate}
              mutedWhenZero
            />
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            #{props.item.id} · {props.item.created_by_username}
          </div>
        </div>
        <div className="grid gap-2 md:min-w-80">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={detailQuery.isFetching}
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {expanded ? "收起详情" : "复核详情"}
            </button>
            <button
              type="button"
              disabled={props.loading}
              onClick={props.onApprove}
              className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-40"
            >
              <Check className="size-4" aria-hidden />
              通过
            </button>
            <button
              type="button"
              disabled={props.loading}
              onClick={() => props.onReject(reason)}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <X className="size-4" aria-hidden />
              驳回
            </button>
          </div>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-9 border border-border bg-background px-3 text-sm outline-none"
            placeholder={`批次 #${props.item.id} 的驳回原因`}
          />
        </div>
      </div>
      {expanded && (
        <section className="grid gap-2 border-t border-border pt-3">
          {detailQuery.isFetching && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              加载审批详情
            </div>
          )}
          {detailQuery.isError && (
            <div className="text-sm text-[var(--color-status-error)]">审批详情加载失败</div>
          )}
          {detail && (
            <>
              <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-3">
                <span>提交人：{detail.created_by_username}</span>
                <span>明细：{detail.entry_count} 条</span>
                <span>来源：{detail.source}</span>
              </div>
              <div className="grid gap-2">
                {detail.entries.map((entry) => (
                  <ChangeEntryCard key={entry.id} entry={entry} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </article>
  );
}

function formatActionCounts(item: ChangeSetSummary) {
  return `新增 ${item.action_counts.create} / 修改 ${item.action_counts.update} / 终止 ${item.action_counts.terminate}`;
}

function parsePositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
