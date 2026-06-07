import { useQuery } from "@tanstack/react-query";

import { listSchemas } from "@/api/schemas";
import { FIELD_TYPES, defaultValidatorsForType, fieldTypeLabel } from "./schemaWizardState";
import type { FieldConfig, FieldType, SchemaRole } from "@/api/schemas";
import { FieldStateStrip, FieldTypeMarker } from "./SchemaFieldVisuals";

interface Props { field: FieldConfig | null; onChange: (patch: Partial<FieldConfig>) => void; }

const CONTROL_CLASS = "h-10 w-full min-w-0 border border-border bg-background px-3 outline-none focus:border-foreground";
const LABEL_CLASS = "grid min-w-0 gap-1 text-sm";
const TWO_COLUMN_GRID_CLASS = "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2";

export function FieldPropertyPanel({ field, onChange }: Props) {
  if (!field) {
    return (
      <aside className="nd-interactive-surface min-h-[320px] min-w-0 border border-border bg-card p-4 text-sm text-muted-foreground">
        未选择字段
      </aside>
    );
  }

  return (
    <aside className="nd-interactive-surface min-w-0 border border-border bg-card p-4">
      <FieldPropertyHeader field={field} />

      <div className="grid min-w-0 gap-3">
        <TextInput label="字段编码" value={field.key} onChange={(key) => onChange({ key })} />
        <TextInput label="显示名" value={field.label} onChange={(label) => onChange({ label })} />

        <label className={LABEL_CLASS}>
          <span className="text-xs text-muted-foreground">字段类型</span>
          <select
            value={field.type}
            onChange={(event) => {
              const type = event.target.value as FieldType;
              onChange({
                type,
                validators: defaultValidatorsForType(type),
                required: type === "formula" ? false : field.required,
                indexed: type === "formula" ? false : field.indexed,
              });
            }}
            className={CONTROL_CLASS}
          >
            {FIELD_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className={TWO_COLUMN_GRID_CLASS}>
          <Toggle
            checked={Boolean(field.required)}
            label="必填"
            onChange={(required) => onChange({ required })}
          />
          <Toggle
            checked={Boolean(field.indexed)}
            label="索引"
            onChange={(indexed) => onChange({ indexed })}
          />
        </div>

        <ValidatorEditor field={field} onChange={onChange} />
        <MaskingEditor field={field} onChange={onChange} />
      </div>
    </aside>
  );
}

function FieldPropertyHeader({ field }: { field: FieldConfig }) {
  return (
    <div className="mb-4 grid min-w-0 gap-3 border border-border bg-background p-3">
      <div className="flex min-w-0 items-start gap-3">
        <FieldTypeMarker type={field.type} className="h-8 min-w-[4.25rem]" />
        <span className="grid min-w-0 gap-1">
          <span className="font-display text-sm font-semibold">字段属性</span>
          <span className="truncate text-sm text-foreground">{field.label}</span>
        </span>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {field.key} · {fieldTypeLabel(field.type)}
        </span>
        <FieldStateStrip field={field} className="sm:justify-end" />
      </div>
    </div>
  );
}

function TextInput(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={LABEL_CLASS}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={CONTROL_CLASS}
      />
    </label>
  );
}

function Toggle(props: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-10 min-w-0 items-center gap-2 border border-border px-3 text-sm">
      <input className="shrink-0" type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span className="min-w-0 truncate">{props.label}</span>
    </label>
  );
}

function ValidatorEditor({ field, onChange }: Props & { field: FieldConfig }) {
  const schemasQuery = useQuery({
    queryKey: ["schemas"],
    queryFn: () => listSchemas(),
    enabled: field.type === "reference",
  });
  const validators = field.validators ?? {};

  if (field.type === "enum" || field.type === "multi-enum") {
    return (
      <TextInput
        label="选项"
        value={String((validators.options as string[] | undefined)?.join(", ") ?? "")}
        onChange={(value) =>
          onChange({
            validators: {
              ...validators,
              options: value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            },
          })
        }
      />
    );
  }

  if (field.type === "number") {
    return (
      <div className={TWO_COLUMN_GRID_CLASS}>
        <NumberInput label="最小值" name="min" validators={validators} onChange={onChange} />
        <NumberInput label="最大值" name="max" validators={validators} onChange={onChange} />
      </div>
    );
  }

  if (field.type === "attachment" || field.type === "image") {
    return (
      <div className="grid min-w-0 gap-2">
        <div className={TWO_COLUMN_GRID_CLASS}>
          <NumberInput label="最大文件数" name="max_files" validators={validators} onChange={onChange} />
          <NumberInput
            label="单文件上限(B)"
            name="max_file_size"
            validators={validators}
            onChange={onChange}
          />
        </div>
        <TextInput
          label="允许扩展名"
          value={String((validators.allowed_extensions as string[] | undefined)?.join(", ") ?? "")}
          onChange={(value) =>
            onChange({
              validators: {
                ...validators,
                allowed_extensions: value
                  .split(",")
                  .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
                  .filter(Boolean),
              },
            })
          }
        />
      </div>
    );
  }

  if (field.type === "formula") {
    return (
      <div className="grid min-w-0 gap-2">
        <TextInput
          label="公式表达式"
          value={String(validators.expression ?? "")}
          onChange={(expression) => onChange({ validators: { ...validators, expression } })}
        />
        <label className={LABEL_CLASS}>
          <span className="text-xs text-muted-foreground">结果类型</span>
          <select
            value={String(validators.result_type ?? "text")}
            onChange={(event) =>
              onChange({ validators: { ...validators, result_type: event.target.value } })
            }
            className={CONTROL_CLASS}
          >
            <option value="text">文本</option>
            <option value="number">数字</option>
          </select>
        </label>
        <NumberInput label="小数位" name="precision" validators={validators} onChange={onChange} />
      </div>
    );
  }

  if (field.type === "reference") {
    return (
      <label className={LABEL_CLASS}>
        <span className="text-xs text-muted-foreground">目标表</span>
        <select
          value={String(validators.target_schema ?? "")}
          onChange={(event) =>
            onChange({ validators: { ...validators, target_schema: event.target.value } })
          }
          className={CONTROL_CLASS}
        >
          <option value="">选择可见表</option>
          {(schemasQuery.data ?? []).map((schema) => (
            <option key={schema.id} value={schema.schema_code}>
              {schema.name} · {schema.schema_code}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <NumberInput
      label={field.type === "longtext" || field.type === "markdown" ? "最大字数" : "最大长度"}
      name="max_length"
      validators={validators}
      onChange={onChange}
    />
  );
}

const ROLE_OPTIONS: Array<{ value: SchemaRole; label: string }> = [
  { value: "admin", label: "系统管理员" }, { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" }, { value: "viewer", label: "Viewer" },
];

function MaskingEditor({ field, onChange }: Props & { field: FieldConfig }) {
  const masking = field.masking ?? {};
  const visibleRoles = masking.visible_roles ?? ["admin", "owner"];
  return (
    <div className="nd-interactive-surface grid min-w-0 gap-2 border border-border p-3">
      <Toggle
        checked={Boolean(field.sensitive)}
        label="敏感字段"
        onChange={(sensitive) => onChange({ sensitive })}
      />
      <label className={LABEL_CLASS}>
        <span className="text-xs text-muted-foreground">脱敏方式</span>
        <select
          value={masking.mode ?? "full"}
          onChange={(event) =>
            onChange({ masking: { ...masking, mode: event.target.value as "full" | "partial" | "none" } })
          }
          className={CONTROL_CLASS}
        >
          <option value="full">完全隐藏</option>
          <option value="partial">保留首尾</option>
          <option value="none">不脱敏</option>
        </select>
      </label>
      <div className={TWO_COLUMN_GRID_CLASS}>
        {ROLE_OPTIONS.map((role) => (
          <Toggle
            key={role.value}
            checked={visibleRoles.includes(role.value)}
            label={role.label}
            onChange={(checked) =>
              onChange({
                masking: {
                  ...masking,
                  visible_roles: checked
                    ? [...visibleRoles, role.value]
                    : visibleRoles.filter((item) => item !== role.value),
                },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function NumberInput(props: { label: string; name: string; validators: Record<string, unknown>; onChange: (patch: Partial<FieldConfig>) => void }) {
  const value = props.validators[props.name];

  return (
    <label className={LABEL_CLASS}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(event) =>
          props.onChange({
            validators: {
              ...props.validators,
              [props.name]: event.target.value ? Number(event.target.value) : undefined,
            },
          })
        }
        className={CONTROL_CLASS}
      />
    </label>
  );
}
