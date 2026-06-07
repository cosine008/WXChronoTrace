import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import {
  addCollaborator,
  listCollaborators,
  removeCollaborator,
  updateCollaborator,
  type Collaborator,
  type DataSchema,
} from "@/api/schemas";
import { listUsers } from "@/api/users";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";

export function CollaboratorsPanel({ schema }: { schema: DataSchema }) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Collaborator["role"]>("viewer");
  const collaboratorsQuery = useQuery({
    queryKey: ["schema", schema.id, "collaborators"],
    queryFn: () => listCollaborators(schema.id),
  });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => listUsers() });
  const collaborators = collaboratorsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const availableUsers = users.filter(
    (user) => user.id !== schema.owner.id && !collaborators.some((item) => item.user_id === user.id)
  );
  const activeAvailable = availableUsers.filter((user) => user.is_employed);
  const inactiveAvailable = availableUsers.filter((user) => !user.is_employed);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["schema", schema.id, "collaborators"] });
  const addMutation = useMutation({
    mutationFn: (payload: { userId: number; role: Collaborator["role"] }) =>
      addCollaborator(schema.id, { user_id: payload.userId, role: payload.role }),
    onSuccess: async (collaborator) => {
      await invalidate();
      setUserId("");
      notify.success({
        title: "协作者已添加",
        message: `${collaborator.username} 已获得 ${collaborator.role} 权限。`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "添加协作者失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: { userId: number; role: Collaborator["role"] }) =>
      updateCollaborator(schema.id, payload.userId, payload.role),
    onSuccess: async (collaborator) => {
      await invalidate();
      notify.success({
        title: "协作者角色已更新",
        message: `${collaborator.username} 已调整为 ${collaborator.role}。`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "更新协作者失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (targetUserId: number) => removeCollaborator(schema.id, targetUserId),
    onSuccess: async (_, targetUserId) => {
      await invalidate();
      const removed = collaborators.find((item) => item.user_id === targetUserId);
      notify.success({
        title: "协作者已移除",
        message: removed ? `${removed.username} 已移出协作者列表。` : "协作者列表已更新。",
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "移除协作者失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  function handleAdd() {
    if (!userId) return;
    addMutation.mutate({ userId: Number(userId), role });
  }

  async function handleRemove(collaborator: Collaborator) {
    const confirmed = await notify.confirm({
      title: "确认移除协作者",
      description: "移除后，该用户将失去这张表的共享访问权限。",
      impactSummary: [
        `用户：${collaborator.username}`,
        `当前角色：${collaborator.role}`,
        "不会删除该用户创建过的审计记录",
      ],
      confirmLabel: "确认移除",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) removeMutation.mutate(collaborator.user_id);
  }

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <h2 className="mb-4 font-display text-lg font-semibold">协作者与审批人</h2>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_auto]">
        <select
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-10 border border-border bg-background px-3 text-sm outline-none"
        >
          <option value="">选择用户</option>
          {activeAvailable.length > 0 && (
            <optgroup label="在职">
              {activeAvailable.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} · {user.username}
                </option>
              ))}
            </optgroup>
          )}
          {inactiveAvailable.length > 0 && (
            <optgroup label="已离职(不可新增)">
              {inactiveAvailable.map((user) => (
                <option key={user.id} value={user.id} disabled>
                  {user.display_name} · {user.username} · 已离职
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as Collaborator["role"])}
          className="h-10 border border-border bg-background px-3 text-sm outline-none"
        >
          <option value="viewer">viewer / 只读</option>
          <option value="editor">editor / 可审批</option>
        </select>
        <button
          type="button"
          disabled={!userId || addMutation.isPending}
          onClick={handleAdd}
          className="inline-flex h-10 items-center gap-2 border border-border px-3 text-sm hover:border-foreground disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden />
          添加
        </button>
      </div>
      <div className="nd-interactive-surface mt-4 divide-y divide-border border border-border">
        {collaborators.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无协作者</div>
        ) : (
          collaborators.map((item) => (
            <div key={item.user_id} className="nd-interactive-row grid gap-2 px-3 py-2 md:grid-cols-[1fr_140px_auto]">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{item.username}</span>
                  {!item.is_employed && (
                    <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      已离职
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground">uid {item.user_id}</div>
              </div>
              <select
                value={item.role}
                onChange={(event) =>
                  updateMutation.mutate({
                    userId: item.user_id,
                    role: event.target.value as Collaborator["role"],
                  })
                }
                className="h-9 border border-border bg-background px-2 text-sm"
              >
                <option value="viewer">viewer / 只读</option>
                <option value="editor">editor / 可审批</option>
              </select>
              <button
                type="button"
                title="移除协作者"
                onClick={() => void handleRemove(item)}
                className="grid size-9 place-items-center text-muted-foreground hover:text-[var(--color-status-error)]"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function formatApiErrorDetail(details?: Record<string, unknown>) {
  return details ? JSON.stringify(details, null, 2) : undefined;
}
