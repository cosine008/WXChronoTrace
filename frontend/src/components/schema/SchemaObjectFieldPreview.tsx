import { CircleDashed, EyeOff } from "lucide-react";

import type { FieldConfig, FieldType } from "@/api/schemas";

export type SchemaObjectFieldPreview = Pick<FieldConfig, "key" | "label"> &
  Partial<Pick<FieldConfig, "type" | "hidden" | "system">>;

interface SchemaObjectFieldPreviewListProps {
  fields?: SchemaObjectFieldPreview[];
  fieldCount: number;
  hasRows: boolean;
  compact: boolean;
}

export function SchemaObjectFieldPreviewList({
  fields = [],
  fieldCount,
  hasRows,
  compact,
}: SchemaObjectFieldPreviewListProps) {
  const publicFields = fields.filter((field) => !isHiddenFieldPreview(field));
  const hiddenFieldCount = fields.length - publicFields.length;
  const visibleFields = publicFields.slice(0, compact ? 2 : 3);
  const extraPublicCount = Math.max(publicFields.length - visibleFields.length, 0);
  const unloadedFieldCount = Math.max(fieldCount - fields.length, 0);
  const overflowCount = extraPublicCount + unloadedFieldCount;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 text-xs text-muted-foreground md:max-w-[24rem] md:justify-end">
      {fieldCount === 0 ? (
        <NoFieldsToken />
      ) : (
        <>
          {!hasRows && <WaitingDataToken />}
          {hiddenFieldCount > 0 && <HiddenFieldsToken count={hiddenFieldCount} />}
          {visibleFields.map((field) => (
            <span
              key={field.key}
              title={`字段：${field.label}`}
              className="inline-grid max-w-28 grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden border border-border bg-background"
            >
              <span className="border-r border-border px-1 font-mono text-[10px] uppercase text-muted-foreground">
                {field.type ? fieldTypeCode(field.type) : "F"}
              </span>
              <span className="truncate px-2 py-1">{field.label}</span>
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="inline-flex min-w-10 items-center justify-center border border-border bg-background px-2 py-1 font-mono text-[11px]">
              +{overflowCount}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function isHiddenFieldPreview(field: SchemaObjectFieldPreview) {
  return Boolean(field.hidden || field.system);
}

function NoFieldsToken() {
  return (
    <span className="inline-flex items-center gap-1 border border-dashed border-border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      <span aria-hidden className="size-2 rounded-full border border-current" />
      无字段
    </span>
  );
}

function WaitingDataToken() {
  return (
    <span className="inline-flex items-center gap-1 border border-dashed border-border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      <CircleDashed className="size-3" aria-hidden />
      等待数据
    </span>
  );
}

function HiddenFieldsToken({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      <EyeOff className="size-3" aria-hidden />
      隐藏 {count}
    </span>
  );
}

function fieldTypeCode(type: FieldType) {
  if (type === "longtext" || type === "markdown") return "TXT";
  if (type === "multi-enum") return "ENUM";
  if (type === "auto-number") return "NO";
  if (type === "attachment") return "FILE";
  if (type === "datetime") return "TIME";
  return type.slice(0, 4).toUpperCase();
}
