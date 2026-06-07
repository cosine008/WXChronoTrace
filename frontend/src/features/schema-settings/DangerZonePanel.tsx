import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Send } from "lucide-react";

import { archiveSchema, handoverSchema, type DataSchema } from "@/api/schemas";
import { useNotification } from "@/components/notifications";
import type { UserOption } from "@/api/users";
import { extractApiError } from "@/lib/api";

export function DangerZonePanel({ schema, users }: { schema: DataSchema; users: UserOption[] }) {
  const [ownerId, setOwnerId] = useState("");
  const queryClient = useQueryClient();
  const notify = useNotification();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["schema", schema.id] }),
      queryClient.invalidateQueries({ queryKey: ["schemas"] }),
    ]);
  };
  const archiveMutation = useMutation({
    mutationFn: () => archiveSchema(schema.id),
    onSuccess: async () => {
      await refresh();
      notify.success({ title: "归档完成", message: `${schema.name} 已归档` });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({ title: "归档失败", message: apiError.message, code: apiError.code });
    },
  });
  const handoverMutation = useMutation({
    mutationFn: (nextOwnerId: number) => handoverSchema(schema.id, nextOwnerId),
    onSuccess: async () => {
      await refresh();
      setOwnerId("");
      notify.success({ title: "移交完成", message: `owner 已移交给新的负责人` });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({ title: "移交失败", message: apiError.message, code: apiError.code });
    },
  });
  const candidates = users.filter((user) => user.id !== schema.owner.id);
  const activeCandidates = candidates.filter((user) => user.is_employed);
  const inactiveCandidates = candidates.filter((user) => !user.is_employed);
  const selectedOwner = candidates.find((user) => String(user.id) === ownerId) ?? null;

  async function handleArchive() {
    const confirmed = await notify.confirm({
      title: "确认归档数据表",
      description: `归档后，${schema.name} 默认不再出现在列表中。`,
      impactSummary: ["不会物理删除数据", "不会影响审计日志", "可由管理员重新查看"],
      confirmLabel: "确认归档",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) archiveMutation.mutate();
  }

  async function handleHandover() {
    if (!selectedOwner) return;
    const confirmed = await notify.confirm({
      title: "确认移交 owner",
      description: `将 ${schema.name} 的 owner 从 ${schema.owner.username} 移交给 ${selectedOwner.username}。`,
      impactSummary: [
        `新 owner: ${selectedOwner.display_name} / ${selectedOwner.username}`,
        "后端会记录敏感审计",
        "原 owner 将不再拥有该表",
      ],
      confirmLabel: "确认移交",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) handoverMutation.mutate(selectedOwner.id);
  }

  return (
    <section className="border border-[var(--color-status-error)]/60 bg-card p-4">
      <h2 className="mb-4 font-display text-lg font-semibold">高级操作</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="nd-interactive-surface border border-border p-3">
          <div className="text-sm font-medium">归档</div>
          <p className="mt-1 text-xs text-muted-foreground">归档后默认不再出现在我的表列表。</p>
          <button
            type="button"
            disabled={schema.is_archived || archiveMutation.isPending}
            onClick={() => void handleArchive()}
            className="mt-3 inline-flex h-9 items-center gap-2 border border-border px-3 text-sm hover:border-[var(--color-status-error)] disabled:opacity-50"
          >
            <Archive className="size-4" aria-hidden />
            {schema.is_archived ? "已归档" : "归档表"}
          </button>
        </div>
        <div className="nd-interactive-surface border border-border p-3">
          <div className="text-sm font-medium">移交 owner</div>
          <p className="mt-1 text-xs text-muted-foreground">仅系统管理员可执行，后端会记录敏感审计。</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <select
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              className="h-9 border border-border bg-background px-2 text-sm"
            >
              <option value="">选择新 owner</option>
              {activeCandidates.length > 0 && (
                <optgroup label="在职">
                  {activeCandidates.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name} · {user.username}
                    </option>
                  ))}
                </optgroup>
              )}
              {inactiveCandidates.length > 0 && (
                <optgroup label="已离职(不可移交)">
                  {inactiveCandidates.map((user) => (
                    <option key={user.id} value={user.id} disabled>
                      {user.display_name} · {user.username} · 已离职
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              disabled={!ownerId || handoverMutation.isPending}
              onClick={() => void handleHandover()}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm hover:border-foreground disabled:opacity-50"
            >
              <Send className="size-4" aria-hidden />
              移交
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
