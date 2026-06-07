import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";

import type { FieldConfig } from "@/api/schemas";
import { ExcelFieldImportPanel } from "./ExcelFieldImportPanel";
import { FieldPropertyPanel } from "./FieldPropertyPanel";
import { SchemaFieldRow } from "./SchemaFieldVisuals";
import { makeEmptyField } from "./schemaWizardState";

interface Props {
  fields: FieldConfig[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onChange: (fields: FieldConfig[], selectedKey?: string) => void;
}

export function FieldDesigner({ fields, selectedKey, onSelect, onChange }: Props) {
  const selectedField = fields.find((field) => field.key === selectedKey) ?? fields[0] ?? null;

  function updateSelected(patch: Partial<FieldConfig>) {
    if (!selectedField) return;
    const next = fields.map((field) =>
      field.key === selectedField.key ? { ...field, ...patch } : field
    );
    onChange(next, patch.key && patch.key !== selectedKey ? patch.key : undefined);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="nd-interactive-surface border border-border bg-card">
        <FieldToolbar count={fields.length} onAdd={() => addField(fields, onChange)} />
        <ExcelFieldImportPanel
          currentCount={fields.length}
          onImport={(importedFields) => onChange(importedFields, importedFields[0]?.key ?? "")}
        />
        <div className="divide-y divide-border">
          {fields.map((field, index) => (
            <FieldRow
              key={`${field.key}-${index}`}
              field={field}
              index={index}
              active={field.key === selectedKey}
              canDelete={fields.length > 1}
              onSelect={() => onSelect(field.key)}
              onDuplicate={() => duplicateField(fields, field, onChange)}
              onDelete={() => deleteField(fields, field.key, onChange)}
            />
          ))}
        </div>
      </section>
      <FieldPropertyPanel field={selectedField} onChange={updateSelected} />
    </div>
  );
}

function FieldToolbar(props: { count: number; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <h2 className="font-display text-sm font-semibold">字段卡片</h2>
        <p className="text-xs text-muted-foreground">{props.count} 个字段</p>
      </div>
      <button
        type="button"
        onClick={props.onAdd}
        title="新增字段"
        className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm hover:border-foreground"
      >
        <Plus className="size-4" aria-hidden />
        新增
      </button>
    </div>
  );
}

function FieldRow(props: {
  field: FieldConfig;
  index: number;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <SchemaFieldRow
      field={props.field}
      index={props.index}
      active={props.active}
      onSelect={props.onSelect}
      prefix={<GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      actions={
        <>
          <IconButton title="复制字段" onClick={props.onDuplicate}>
            <Copy className="size-4" aria-hidden />
          </IconButton>
          <IconButton title="删除字段" onClick={props.onDelete} disabled={!props.canDelete}>
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        </>
      }
    />
  );
}

function IconButton(props: {
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-8 place-items-center border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}

function addField(fields: FieldConfig[], onChange: Props["onChange"]) {
  const nextField = makeEmptyField(fields.length + 1);
  onChange([...fields, nextField], nextField.key);
}

function duplicateField(
  fields: FieldConfig[],
  field: FieldConfig,
  onChange: Props["onChange"]
) {
  const copy = { ...field, key: `${field.key}_copy`, label: `${field.label} 副本` };
  onChange([...fields, copy], copy.key);
}

function deleteField(
  fields: FieldConfig[],
  key: string,
  onChange: Props["onChange"]
) {
  const next = fields.filter((field) => field.key !== key);
  onChange(next, next[0]?.key ?? "");
}
