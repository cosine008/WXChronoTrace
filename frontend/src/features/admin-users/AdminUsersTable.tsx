import { KeyRound, Pencil, RotateCcw, UserMinus } from "lucide-react";
import type { ReactNode } from "react";

import type { UserOption } from "@/api/users";
import { cn } from "@/lib/utils";

export function AdminUsersTable(props: {
  users: UserOption[];
  markLeftPendingId?: number;
  restorePendingId?: number;
  onEdit: (user: UserOption) => void;
  onReset: (user: UserOption) => void;
  onMarkLeft: (user: UserOption) => void;
  onRestore: (user: UserOption) => void;
}) {
  return (
    <div className="divide-y divide-border overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-[1fr_1fr_1fr_120px_120px_180px] gap-3 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        <span>用户名</span>
        <span>显示名</span>
        <span>邮箱</span>
        <span>角色</span>
        <span>在职</span>
        <span>操作</span>
      </div>
      {props.users.map((user) => (
        <UserRow key={user.id} user={user} {...props} />
      ))}
    </div>
  );
}

function UserRow(props: {
  user: UserOption;
  markLeftPendingId?: number;
  restorePendingId?: number;
  onEdit: (user: UserOption) => void;
  onReset: (user: UserOption) => void;
  onMarkLeft: (user: UserOption) => void;
  onRestore: (user: UserOption) => void;
}) {
  const { user } = props;
  return (
    <div className="nd-interactive-row grid min-w-[900px] grid-cols-[1fr_1fr_1fr_120px_120px_180px] gap-3 px-4 py-3 text-sm">
      <span className="font-mono">{user.username}</span>
      <span className="truncate">{user.display_name}</span>
      <span className="truncate text-muted-foreground">{user.email || "—"}</span>
      <span className="text-xs">
        {user.is_superuser ? (
          <span className="border border-foreground px-1.5 py-0.5 font-mono uppercase tracking-[0.2em]">
            admin
          </span>
        ) : (
          <span className="text-muted-foreground">user</span>
        )}
      </span>
      <span className="text-xs">
        {user.is_employed ? (
          <span className="text-[var(--color-status-new)]">在职</span>
        ) : (
          <span className="text-muted-foreground">
            已离职{user.left_at ? ` · ${user.left_at.slice(0, 10)}` : ""}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <IconButton title="编辑账号" onClick={() => props.onEdit(user)}>
          <Pencil className="size-4" aria-hidden />
        </IconButton>
        <IconButton title="重置密码" onClick={() => props.onReset(user)}>
          <KeyRound className="size-4" aria-hidden />
        </IconButton>
        {user.is_employed ? (
          <IconButton
            title="标记离职"
            disabled={props.markLeftPendingId === user.id}
            danger
            onClick={() => props.onMarkLeft(user)}
          >
            <UserMinus className="size-4" aria-hidden />
          </IconButton>
        ) : (
          <IconButton
            title="恢复账号"
            disabled={props.restorePendingId === user.id}
            onClick={() => props.onRestore(user)}
          >
            <RotateCcw className="size-4" aria-hidden />
          </IconButton>
        )}
      </span>
    </div>
  );
}

function IconButton(props: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "grid size-8 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
        props.danger &&
          "hover:border-[var(--color-status-error)] hover:text-[var(--color-status-error)]"
      )}
    >
      {props.children}
    </button>
  );
}
