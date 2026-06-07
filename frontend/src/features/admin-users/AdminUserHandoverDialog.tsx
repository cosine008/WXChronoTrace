import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";

import { markUserLeft } from "@/api/adminUsers";
import { handoverSchema } from "@/api/schemas";
import type { UserOption } from "@/api/users";
import { InlineMessage } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";

import { Modal, ModalFooter } from "./DialogShell";

export interface BlockingSchema {
  id: number;
  name: string;
}

export function AdminUserHandoverDialog(props: {
  target: UserOption;
  schemas: BlockingSchema[];
  users: UserOption[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  const notify = useNotification();
  const [ownerId, setOwnerId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const candidates = useMemo(
    () => props.users.filter((user) => user.id !== props.target.id && user.is_employed),
    [props.target.id, props.users]
  );
  const selectedOwner = candidates.find((user) => String(user.id) === ownerId) ?? null;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedOwner) throw new Error("请选择新的 owner");
      for (const schema of props.schemas) {
        await handoverSchema(schema.id, selectedOwner.id);
      }
      await markUserLeft(props.target.id);
    },
    onSuccess: () => {
      notify.success({
        title: "交接完成",
        message: `${props.target.username} 的表已移交，账号已停用。`,
      });
      props.onCompleted();
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setLocalError(apiError.message);
      notify.error({
        title: "交接失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  async function submit() {
    setLocalError(null);
    if (!selectedOwner) return setLocalError("请选择新的 owner");
    const confirmed = await notify.confirm({
      title: "确认移交并停用账号",
      description: `将 ${props.target.username} 名下 ${props.schemas.length} 张表移交给 ${selectedOwner.username}，随后停用该账号。`,
      impactSummary: [
        `新 owner：${selectedOwner.display_name || selectedOwner.username}`,
        `待移交表：${props.schemas.map((schema) => schema.name).join(" / ")}`,
        "表移交和账号停用都会写入审计记录",
      ],
      confirmLabel: "移交并停用",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) mutation.mutate();
  }

  return (
    <Modal onClose={props.onClose}>
      <h3 className="font-display text-lg font-semibold">离职交接</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-mono">{props.target.username}</span> 仍是以下未归档表的 owner。
        先移交 owner 后才能停用账号。
      </p>
      <div className="mt-4 grid gap-3">
        <SchemaList schemas={props.schemas} />
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">新的 owner</span>
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground"
          >
            <option value="">选择在职用户</option>
            {candidates.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name || user.username} · {user.username}
              </option>
            ))}
          </select>
        </label>
        {candidates.length === 0 && (
          <InlineMessage tone="error" message="没有可接收移交的在职用户" />
        )}
        <InlineMessage tone="error" message={localError ?? undefined} />
      </div>
      <ModalFooter
        loading={mutation.isPending}
        onCancel={props.onClose}
        onConfirm={() => void submit()}
        confirmLabel={
          <span className="inline-flex items-center gap-2">
            <Send className="size-4" aria-hidden />
            移交并停用
          </span>
        }
        confirmDisabled={!ownerId || candidates.length === 0}
      />
    </Modal>
  );
}

function SchemaList({ schemas }: { schemas: BlockingSchema[] }) {
  return (
    <div className="max-h-44 overflow-auto border border-border">
      {schemas.map((schema) => (
        <div
          key={schema.id}
          className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
        >
          <span className="font-mono text-xs text-muted-foreground">#{schema.id}</span>
          <span className="truncate">{schema.name}</span>
        </div>
      ))}
    </div>
  );
}

function formatApiErrorDetail(details?: Record<string, unknown>) {
  return details ? JSON.stringify(details, null, 2) : undefined;
}
