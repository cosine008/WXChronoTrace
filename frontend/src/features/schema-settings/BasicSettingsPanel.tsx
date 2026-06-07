import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";

import { updateSchema, type DataSchema, type SchemaVisibility } from "@/api/schemas";
import { SchemaIconPicker } from "@/components/schema-icons/SchemaIconPicker";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";

export function BasicSettingsPanel({
  schema,
  readOnly = false,
}: {
  schema: DataSchema;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [form, setForm] = useState({
    name: schema.name,
    description: schema.description,
    icon: schema.icon,
    visibility: schema.visibility,
    approval_required: schema.approval_required,
  });
  const mutation = useMutation({
    mutationFn: () => updateSchema(schema.id, form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema", schema.id] }),
        queryClient.invalidateQueries({ queryKey: ["schemas"] }),
      ]);
      notify.success({ title: "表设置已保存", message: `${form.name} 的基本信息已更新。` });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "表设置保存失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  async function handleSave() {
    if (readOnly) return;
    if (schema.visibility !== "public" && form.visibility === "public") {
      const confirmed = await notify.confirm({
        title: "确认公开数据表",
        description: "公开后，所有登录用户都可以看到这张表，后端会记录敏感审计。",
        impactSummary: [`表：${form.name}`, "可见性将变为公共", "不会改变已有数据内容"],
        confirmLabel: "确认公开",
        cancelLabel: "取消",
        tone: "destructive",
      });
      if (!confirmed) return;
    }
    mutation.mutate();
  }

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <Header title="基本信息" />
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="表名"
          value={form.name}
          disabled={readOnly}
          onChange={(name) => setForm({ ...form, name })}
        />
        <SchemaIconPicker
          value={form.icon}
          disabled={readOnly}
          onChange={(icon) => setForm({ ...form, icon })}
          className="md:col-span-2"
        />
        <label className="grid min-w-0 gap-1 text-sm md:col-span-2">
          <span className="text-xs text-muted-foreground">描述</span>
          <textarea
            value={form.description}
            disabled={readOnly}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="min-h-24 w-full min-w-0 border border-border bg-background px-3 py-2 outline-none focus:border-foreground disabled:opacity-60"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-xs text-muted-foreground">可见性</span>
          <select
            value={form.visibility}
            disabled={readOnly}
            onChange={(event) =>
              setForm({ ...form, visibility: event.target.value as SchemaVisibility })
            }
            className="h-10 w-full min-w-0 border border-border bg-background px-3 outline-none focus:border-foreground disabled:opacity-60"
          >
            <option value="private">私有</option>
            <option value="shared">共享</option>
            <option value="public">公共</option>
          </select>
          <span className="text-xs text-muted-foreground">
            {visibilityHint(form.visibility)}
          </span>
        </label>
        <label className="grid min-w-0 self-start gap-1 text-sm">
          <span aria-hidden className="text-xs text-muted-foreground opacity-0">
            审批
          </span>
          <span className="flex h-10 min-w-0 items-center gap-2 border border-border px-3">
            <input
              type="checkbox"
              checked={form.approval_required}
              disabled={readOnly}
              onChange={(event) => setForm({ ...form, approval_required: event.target.checked })}
            />
            <span className="min-w-0 truncate">启用审批</span>
          </span>
        </label>
      </div>
      <PanelActions
        loading={mutation.isPending}
        readOnly={readOnly}
        onSave={() => void handleSave()}
      />
    </section>
  );
}

function visibilityHint(visibility: SchemaVisibility) {
  if (visibility === "private") return "仅 owner 和管理员可见";
  if (visibility === "shared") return "owner 与协作者可见";
  return "所有登录用户可见，升级为公共会写入敏感审计";
}

function Header({ title }: { title: string }) {
  return <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>;
}

function Input(props: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 w-full min-w-0 border border-border bg-background px-3 outline-none focus:border-foreground disabled:opacity-60"
      />
    </label>
  );
}

function PanelActions(props: { loading: boolean; readOnly: boolean; onSave: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-3">
      {props.readOnly ? (
        <span className="text-xs text-muted-foreground">只读模式</span>
      ) : (
        <button
          type="button"
          disabled={props.loading}
          onClick={props.onSave}
          className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-50"
        >
          <Save className="size-4" aria-hidden />
          保存
        </button>
      )}
    </div>
  );
}
