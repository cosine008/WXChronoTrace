import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UserPlus, Users } from "lucide-react";

import { markUserLeft, restoreUser } from "@/api/adminUsers";
import { listUsers, type UserOption } from "@/api/users";
import { AppHeader, HeroBanner } from "@/components/brand";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { AdminUserFormDialog, ResetPasswordDialog } from "@/features/admin-users/AdminUserDialogs";
import {
  AdminUserHandoverDialog,
  type BlockingSchema,
} from "@/features/admin-users/AdminUserHandoverDialog";
import { AdminUsersTable } from "@/features/admin-users/AdminUsersTable";
import { extractApiError, type ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const usersQuery = useQuery({
    queryKey: ["admin-users", { includeInactive: true }],
    queryFn: () => listUsers({ includeInactive: true }),
  });
  const [resetTarget, setResetTarget] = useState<UserOption | null>(null);
  const [editTarget, setEditTarget] = useState<UserOption | null>(null);
  const [handoverTarget, setHandoverTarget] = useState<{
    user: UserOption;
    schemas: BlockingSchema[];
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const markLeftMutation = useAdminUserAction({
    action: markUserLeft,
    successTitle: "账号已停用",
    successMessage: (target) => `${target.username} 已标记为离职，登录已停用。`,
    errorTitle: "账号停用失败",
    errorDetail: formatMarkLeftErrorDetail,
    onError: (target, apiError) => {
      const schemas = parseBlockingSchemas(apiError);
      if (apiError.code !== "OWNS_SCHEMAS" || schemas.length === 0) return false;
      setHandoverTarget({ user: target, schemas });
      return true;
    },
    invalidate,
  });
  const restoreMutation = useAdminUserAction({
    action: restoreUser,
    successTitle: "账号已恢复",
    successMessage: (target) => `${target.username} 已恢复登录。`,
    errorTitle: "账号恢复失败",
    invalidate,
  });
  const users = usersQuery.data ?? [];
  const employed = users.filter((user) => user.is_employed);
  const left = users.filter((user) => !user.is_employed);

  async function handleMarkLeft(user: UserOption) {
    const confirmed = await notify.confirm({
      title: "确认停用账号",
      description: `将 ${user.username} 标记为离职后，该账号将无法继续登录。`,
      impactSummary: [
        `用户：${user.display_name || user.username}`,
        "操作会写入敏感审计",
        "若该用户仍持有未归档数据表，后端会拒绝本次操作",
      ],
      confirmLabel: "确认停用",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) markLeftMutation.mutate(user);
  }

  async function handleRestore(user: UserOption) {
    const confirmed = await notify.confirm({
      title: "确认恢复账号",
      description: `恢复 ${user.username} 后，该账号将重新允许登录。`,
      impactSummary: [`用户：${user.display_name || user.username}`, "操作会写入审计记录"],
      confirmLabel: "确认恢复",
      cancelLabel: "取消",
    });
    if (confirmed) restoreMutation.mutate(user);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        back={{ to: "/admin" }}
        right={
          <button
            type="button"
            title="刷新"
            onClick={() => usersQuery.refetch()}
            className="grid size-9 place-items-center text-muted-foreground hover:text-foreground"
          >
            <RefreshCw
              className={cn("size-4", usersQuery.isFetching && "animate-spin")}
              aria-hidden
            />
          </button>
        }
      />
      <main className="mx-auto grid max-w-7xl gap-5 px-6 py-6">
        <HeroBanner
          eyebrow="ADMIN / USERS"
          title="账号管理"
          subtitle="User administration"
          meta={
            <span className="inline-flex items-center gap-2">
              <Users className="size-4" aria-hidden />
              {usersQuery.data ? `${employed.length} 在职 / ${left.length} 已离职` : "loading"}
            </span>
          }
          action={
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm text-background"
            >
              <UserPlus className="size-4" aria-hidden />
              新建账号
            </button>
          }
        />
        <AdminNavigation />
        <section className="nd-interactive-surface border border-border bg-card">
          {usersQuery.isLoading ? (
            <LoadingState minH="min-h-56" label="加载用户中" />
          ) : usersQuery.isError ? (
            <ErrorState
              title="加载用户失败"
              error={usersQuery.error}
              onRetry={() => usersQuery.refetch()}
              minH="min-h-56"
            />
          ) : users.length === 0 ? (
            <EmptyState title="暂无用户" minH="min-h-56" />
          ) : (
            <AdminUsersTable
              users={users}
              markLeftPendingId={markLeftMutation.isPending ? markLeftMutation.variables?.id : undefined}
              restorePendingId={restoreMutation.isPending ? restoreMutation.variables?.id : undefined}
              onEdit={setEditTarget}
              onReset={setResetTarget}
              onMarkLeft={(user) => void handleMarkLeft(user)}
              onRestore={(user) => void handleRestore(user)}
            />
          )}
        </section>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          管理员可新建账号、调整角色、重置密码、停用或恢复账号。CSV 批量导入仍可使用后端命令{" "}
          <code>manage.py import_users</code>。
        </p>
      </main>

      {showCreate && (
        <AdminUserFormDialog
          onClose={() => setShowCreate(false)}
          onCompleted={() => {
            setShowCreate(false);
            void invalidate();
          }}
        />
      )}
      {editTarget && (
        <AdminUserFormDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onCompleted={() => {
            setEditTarget(null);
            void invalidate();
          }}
        />
      )}
      {resetTarget && (
        <ResetPasswordDialog
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onCompleted={() => {
            setResetTarget(null);
            void invalidate();
          }}
        />
      )}
      {handoverTarget && (
        <AdminUserHandoverDialog
          target={handoverTarget.user}
          schemas={handoverTarget.schemas}
          users={users}
          onClose={() => setHandoverTarget(null)}
          onCompleted={() => {
            setHandoverTarget(null);
            void invalidate();
          }}
        />
      )}
    </div>
  );
}

function useAdminUserAction(args: {
  action: (userId: number) => Promise<void>;
  successTitle: string;
  successMessage: (target: UserOption) => string;
  errorTitle: string;
  errorDetail?: (details?: Record<string, unknown>) => string | undefined;
  onError?: (target: UserOption, apiError: ApiError) => boolean | void;
  invalidate: () => Promise<unknown>;
}) {
  const notify = useNotification();
  return useMutation({
    mutationFn: async (target: UserOption) => {
      await args.action(target.id);
      return target;
    },
    onSuccess: (target) => {
      notify.success({
        title: args.successTitle,
        message: args.successMessage(target),
      });
      void args.invalidate();
    },
    onError: (err, target) => {
      const apiError = extractApiError(err);
      if (args.onError?.(target, apiError)) return;
      notify.error({
        title: args.errorTitle,
        message: apiError.message,
        code: apiError.code,
        detail: args.errorDetail?.(apiError.details) ?? formatApiErrorDetail(apiError.details),
      });
    },
  });
}

function parseBlockingSchemas(apiError: ApiError): BlockingSchema[] {
  const schemas = apiError.details?.schemas;
  if (!Array.isArray(schemas)) return [];
  return schemas.filter(
    (item): item is BlockingSchema =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { id?: unknown }).id === "number" &&
      typeof (item as { name?: unknown }).name === "string"
  );
}

function formatMarkLeftErrorDetail(details?: Record<string, unknown>) {
  const schemas = details?.schemas;
  if (Array.isArray(schemas)) {
    const lines = schemas
      .filter(
        (item): item is { id: number; name: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "number" &&
          typeof (item as { name?: unknown }).name === "string"
      )
      .map((item) => `#${item.id} · ${item.name}`);
    if (lines.length > 0) return `该用户仍是以下非归档表的 owner，请先移交：\n${lines.join("\n")}`;
  }
  return formatApiErrorDetail(details);
}

function formatApiErrorDetail(details?: Record<string, unknown>) {
  return details ? JSON.stringify(details, null, 2) : undefined;
}
