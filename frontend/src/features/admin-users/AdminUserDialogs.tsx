import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  createAdminUser,
  resetUserPassword,
  updateAdminUser,
  type AdminUserCreatePayload,
  type AdminUserUpdatePayload,
} from "@/api/adminUsers";
import type { UserOption } from "@/api/users";
import { InlineMessage } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";

import { CheckboxField, Modal, ModalFooter, TextField } from "./DialogShell";

export function AdminUserFormDialog(props: {
  target?: UserOption;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const target = props.target;
  const isCreate = target === undefined;
  const notify = useNotification();
  const [form, setForm] = useState(() => ({
    username: target?.username ?? "",
    password: "",
    email: target?.email ?? "",
    displayName: target?.display_name ?? "",
    isSuperuser: target?.is_superuser ?? false,
  }));
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      if (target === undefined) return createAdminUser(buildCreatePayload(form));
      return updateAdminUser(target.id, buildUpdatePayload(form));
    },
    onSuccess: (user) => {
      notify.success({
        title: isCreate ? "账号已创建" : "账号已更新",
        message: `${user.username} 的账号信息已保存。`,
      });
      props.onCompleted();
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setLocalError(apiError.message);
      notify.error({
        title: isCreate ? "创建账号失败" : "更新账号失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  async function submit() {
    setLocalError(null);
    const validation = validateForm(form, isCreate);
    if (validation) return setLocalError(validation);
    if (!(await confirmRoleChange(target, form.isSuperuser, notify))) return;
    mutation.mutate();
  }

  return (
    <Modal onClose={props.onClose}>
      <h3 className="font-display text-lg font-semibold">
        {isCreate ? "新建账号" : "编辑账号"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {isCreate
          ? "为新员工创建登录账号，并按需授予管理员权限。"
          : "调整账号资料和管理员角色，不会修改该用户的历史审计记录。"}
      </p>
      <div className="mt-4 grid gap-3">
        <TextField
          label="用户名"
          value={form.username}
          readOnly={!isCreate}
          onChange={(username) => setForm((current) => ({ ...current, username }))}
        />
        {isCreate && (
          <TextField
            label="初始密码"
            type="password"
            value={form.password}
            onChange={(password) => setForm((current) => ({ ...current, password }))}
          />
        )}
        <TextField
          label="显示名"
          value={form.displayName}
          onChange={(displayName) => setForm((current) => ({ ...current, displayName }))}
        />
        <TextField
          label="邮箱"
          type="email"
          value={form.email}
          onChange={(email) => setForm((current) => ({ ...current, email }))}
        />
        <CheckboxField
          label="系统管理员"
          checked={form.isSuperuser}
          onChange={(isSuperuser) => setForm((current) => ({ ...current, isSuperuser }))}
        />
        <InlineMessage tone="error" message={localError ?? undefined} />
      </div>
      <ModalFooter
        loading={mutation.isPending}
        onCancel={props.onClose}
        onConfirm={() => void submit()}
        confirmLabel={isCreate ? "创建" : "保存"}
      />
    </Modal>
  );
}

export function ResetPasswordDialog(props: {
  target: UserOption;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const notify = useNotification();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => resetUserPassword(props.target.id, password),
    onSuccess: () => {
      notify.success({
        title: "密码已重置",
        message: `${props.target.username} 的新密码已生效。`,
      });
      props.onCompleted();
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      setLocalError(apiError.message);
      notify.error({
        title: "重置密码失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  async function submit() {
    setLocalError(null);
    if (password.length < 8) return setLocalError("新密码至少 8 个字符");
    if (password !== confirm) return setLocalError("两次输入的密码不一致");
    const confirmed = await notify.confirm({
      title: "确认重置密码",
      description: `将为 ${props.target.username} 设置新密码。`,
      impactSummary: ["操作会写入敏感审计", "用户需要使用新密码登录"],
      confirmLabel: "确认重置",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) mutation.mutate();
  }

  return (
    <Modal onClose={props.onClose}>
      <h3 className="font-display text-lg font-semibold">重置密码</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        将为 <span className="font-mono">{props.target.username}</span> ·{" "}
        {props.target.display_name} 设置新密码。操作会写入敏感审计。
      </p>
      <div className="mt-4 grid gap-3">
        <TextField label="新密码" type="password" value={password} onChange={setPassword} />
        <TextField label="确认新密码" type="password" value={confirm} onChange={setConfirm} />
        <InlineMessage tone="error" message={localError ?? undefined} />
      </div>
      <ModalFooter
        loading={mutation.isPending}
        onCancel={props.onClose}
        onConfirm={() => void submit()}
        confirmLabel="重置"
      />
    </Modal>
  );
}

type UserFormState = {
  username: string;
  password: string;
  email: string;
  displayName: string;
  isSuperuser: boolean;
};

function buildCreatePayload(form: UserFormState): AdminUserCreatePayload {
  return {
    username: form.username.trim(),
    password: form.password,
    email: form.email.trim(),
    display_name: form.displayName.trim(),
    is_superuser: form.isSuperuser,
  };
}

function buildUpdatePayload(form: UserFormState): AdminUserUpdatePayload {
  return {
    email: form.email.trim(),
    display_name: form.displayName.trim(),
    is_superuser: form.isSuperuser,
  };
}

function validateForm(form: UserFormState, isCreate: boolean) {
  if (!form.username.trim()) return "用户名不能为空";
  if (isCreate && form.password.length < 8) return "初始密码至少 8 个字符";
  return null;
}

async function confirmRoleChange(
  target: UserOption | undefined,
  nextIsSuperuser: boolean,
  notify: ReturnType<typeof useNotification>
) {
  const roleChanged = target !== undefined && target.is_superuser !== nextIsSuperuser;
  const createsAdmin = target === undefined && nextIsSuperuser;
  if (!roleChanged && !createsAdmin) return true;
  return notify.confirm({
    title: nextIsSuperuser ? "确认授予管理员权限" : "确认取消管理员权限",
    description: target
      ? `将调整 ${target.username} 的系统管理员角色。`
      : "新账号将拥有系统管理员权限。",
    impactSummary: ["管理员可查看全站数据", "管理员可重置密码、移交表 owner、查看敏感审计"],
    confirmLabel: "确认",
    cancelLabel: "取消",
    tone: "destructive",
  });
}

function formatApiErrorDetail(details?: Record<string, unknown>) {
  return details ? JSON.stringify(details, null, 2) : undefined;
}
