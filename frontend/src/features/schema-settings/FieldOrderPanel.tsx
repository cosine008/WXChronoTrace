import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, Save } from "lucide-react";

import type { DataSchema, FieldConfig } from "@/api/schemas";
import { reorderSchemaFields } from "@/api/schemaGovernance";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { isSystemHiddenField, visibleUserFields } from "@/lib/schemaFields";

export function FieldOrderPanel({
  schema,
  readOnly,
  disabled,
}: {
  schema: DataSchema;
  readOnly: boolean;
  disabled: boolean;
}) {
  const notify = useNotification();
  const queryClient = useQueryClient();
  const visibleFields = visibleUserFields(schema.fields_config);
  const hiddenFieldKeys = schema.fields_config
    .filter((field) => isSystemHiddenField(field))
    .map((field) => field.key);
  const [order, setOrder] = useState(visibleFields.map((field) => field.key));
  const fieldsByKey = useMemo(
    () => Object.fromEntries(visibleFields.map((field) => [field.key, field])),
    [visibleFields]
  );
  const initialOrder = visibleFields.map((field) => field.key);
  const dirty = order.join("\u0000") !== initialOrder.join("\u0000");
  const mutation = useMutation({
    mutationFn: () => reorderSchemaFields(schema.id, [...order, ...hiddenFieldKeys]),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema", schema.id] }),
        queryClient.invalidateQueries({ queryKey: ["schema-versions", schema.id] }),
      ]);
      notify.success({
        title: "字段顺序已保存",
        message: `${schema.name} 已生成新的字段配置版本。`,
      });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      notify.error({
        title: "字段排序失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    const next = [...order];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setOrder(next);
  }

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">字段顺序</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            调整字段展示顺序会生成新的 SchemaVersion，不改变字段编码或历史数据。
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            disabled={!dirty || disabled || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-50"
          >
            <Save className="size-4" aria-hidden />
            保存顺序
          </button>
        )}
      </div>
      {disabled && !readOnly && (
        <div className="mb-3 border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          当前有未保存字段编辑，请先保存或放弃编辑后再调整顺序。
        </div>
      )}
      <div className="nd-interactive-surface divide-y divide-border border border-border">
        {order.map((fieldKey, index) => (
          <OrderRow
            key={fieldKey}
            field={fieldsByKey[fieldKey]}
            index={index}
            readOnly={readOnly || disabled}
            canMoveUp={index > 0}
            canMoveDown={index < order.length - 1}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
          />
        ))}
      </div>
    </section>
  );
}

function OrderRow(props: {
  field: FieldConfig;
  index: number;
  readOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="nd-interactive-row grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
      <span className="font-mono text-xs text-muted-foreground">
        {String(props.index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium">{props.field.label}</span>
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {props.field.key} / {props.field.type}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <MoveButton
          title="上移"
          disabled={props.readOnly || !props.canMoveUp}
          onClick={props.onMoveUp}
        >
          <ArrowUp className="size-4" aria-hidden />
        </MoveButton>
        <MoveButton
          title="下移"
          disabled={props.readOnly || !props.canMoveDown}
          onClick={props.onMoveDown}
        >
          <ArrowDown className="size-4" aria-hidden />
        </MoveButton>
      </div>
    </div>
  );
}

function MoveButton(props: {
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-8 place-items-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
