import { useMemo, useState } from "react";
import { AlertTriangle, Info, Radio, RefreshCw, ShieldCheck } from "lucide-react";

import type { FieldDraft, IdentityQuality, IdentityQualityLevel, SchemaDraft } from "@/api/excelIntake";
import type { EntityCodeConfig, FieldType, SequenceResetPeriod } from "@/api/schemas";
import {
  GENERATED_ENTITY_CODE_FIELD_KEY,
  IDENTITY_CODE_FIELD_KEY,
  PERSON_CODE_FIELD_KEY,
  formatEntityCodeSample,
  normalizeEntityCodeConfig,
  syncEntityCodeConfigForSchemaCode,
} from "@/lib/schemaFields";
import { cn } from "@/lib/utils";
import { INTAKE_FIELD_TYPES, nextCompositeIdentityKeys, updateFieldType } from "./excelIntakeState";
import {
  DEFAULT_FIELD_KEY_GENERATION_MODE,
  FIELD_KEY_GENERATION_OPTIONS,
  regenerateFieldKeys,
  type FieldKeyGenerationMode,
} from "./fieldKeyGeneration";

const QUALITY_TONE: Record<IdentityQualityLevel, string> = {
  recommended: "border-[var(--color-status-new)] text-[var(--color-status-new)]",
  neutral: "border-border text-muted-foreground",
  risk: "border-[var(--color-status-modified)] text-[var(--color-status-modified)]",
  discouraged: "border-[var(--color-status-error)] text-[var(--color-status-error)]",
};
const EMPTY_MANUAL_KEY_INDEXES: ReadonlySet<number> = new Set();

export function FieldsPanel(props: {
  schema: SchemaDraft;
  fields: FieldDraft[];
  onSchema: (schema: SchemaDraft) => void;
  onFields: (fields: FieldDraft[]) => void;
}) {
  const [keyGenerationMode, setKeyGenerationMode] = useState<FieldKeyGenerationMode>(
    DEFAULT_FIELD_KEY_GENERATION_MODE
  );
  const [overwriteManualKeys, setOverwriteManualKeys] = useState(false);
  const [manualKeyState, setManualKeyState] = useState<{ signature: string; indexes: Set<number> }>({
    signature: "",
    indexes: new Set(),
  });
  const fieldSourceSignature = useMemo(
    () => props.fields.map((field) => `${field.source_index}:${field.source_column}`).join("|"),
    [props.fields]
  );
  const manualKeyIndexes =
    manualKeyState.signature === fieldSourceSignature ? manualKeyState.indexes : EMPTY_MANUAL_KEY_INDEXES;

  function markManualKey(sourceIndex: number) {
    setManualKeyState((current) => {
      const indexes = new Set(current.signature === fieldSourceSignature ? current.indexes : []);
      indexes.add(sourceIndex);
      return { signature: fieldSourceSignature, indexes };
    });
  }

  function handleRegenerateKeys() {
    const result = regenerateFieldKeys({
      schema: props.schema,
      fields: props.fields,
      mode: keyGenerationMode,
      preservedSourceIndexes: overwriteManualKeys ? new Set<number>() : manualKeyIndexes,
    });
    props.onSchema(result.schema);
    props.onFields(result.fields);
  }

  return (
    <section className="grid gap-4">
      <div className="nd-interactive-surface grid gap-3 border border-border bg-card p-4 md:grid-cols-2">
        <TextInput
          id="excel-schema-name"
          name="schema_name"
          label="表名"
          value={props.schema.name}
          onChange={(name) => props.onSchema({ ...props.schema, name })}
        />
        <TextInput
          id="excel-schema-code"
          name="schema_code"
          label="表编码"
          value={props.schema.schema_code}
          onChange={(schema_code) =>
            props.onSchema({
              ...props.schema,
              schema_code,
              entity_code_config: syncEntityCodeConfigForSchemaCode(
                normalizeEntityCodeConfig(props.schema.schema_code, props.schema.entity_code_config),
                props.schema.schema_code,
                schema_code
              ),
            })
          }
        />
        <div className="grid gap-1 text-sm md:col-span-2">
          <span className="text-xs text-muted-foreground">实体标识模式</span>
          <div className="inline-grid w-fit grid-cols-2 border border-border sm:grid-cols-4">
            <IdentityModeButton
              active={
                props.schema.identity_mode !== "composite" &&
                ![GENERATED_ENTITY_CODE_FIELD_KEY, PERSON_CODE_FIELD_KEY].includes(
                  props.schema.identity_field_key
                )
              }
              label="单字段"
              onClick={() => props.onSchema(singleIdentitySchema(props.schema, props.fields))}
            />
            <IdentityModeButton
              active={props.schema.identity_mode === "composite"}
              label={`组合字段 ${props.schema.identity_field_keys.length || ""}`.trim()}
              onClick={() => props.onSchema(compositeIdentitySchema(props.schema))}
            />
            <IdentityModeButton
              active={props.schema.identity_field_key === GENERATED_ENTITY_CODE_FIELD_KEY}
              label="生成实体编码"
              onClick={() => props.onSchema(generatedEntityCodeIdentitySchema(props.schema))}
            />
            <IdentityModeButton
              active={props.schema.identity_field_key === PERSON_CODE_FIELD_KEY}
              label="生成人员编码"
              onClick={() => props.onSchema(personCodeIdentitySchema(props.schema))}
            />
          </div>
        </div>
        {props.schema.identity_field_key === GENERATED_ENTITY_CODE_FIELD_KEY && (
          <EntityCodeRuleEditor schema={props.schema} onSchema={props.onSchema} />
        )}
        <div className="grid gap-2 text-sm md:col-span-2">
          <span className="text-xs text-muted-foreground">字段编码生成规则</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="excel-field-key-generation"
              name="field_key_generation"
              value={keyGenerationMode}
              onChange={(event) => setKeyGenerationMode(event.target.value as FieldKeyGenerationMode)}
              className="h-9 border border-border bg-background px-3 outline-none"
            >
              {FIELD_KEY_GENERATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRegenerateKeys}
              className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm hover:border-foreground"
            >
              <RefreshCw className="size-4" aria-hidden />
              重新生成编码
            </button>
            <label className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={overwriteManualKeys}
                onChange={(event) => setOverwriteManualKeys(event.target.checked)}
              />
              覆盖已手动修改
            </label>
          </div>
        </div>
      </div>
      <IdentityQualityNotice schema={props.schema} fields={props.fields} />
      <div className="nd-interactive-surface overflow-auto border border-border bg-background">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-b border-border bg-card text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">导入</th>
              <th className="px-3 py-2">标识</th>
              <th className="px-3 py-2">标识质量</th>
              <th className="px-3 py-2">原列名</th>
              <th className="px-3 py-2">显示名</th>
              <th className="px-3 py-2">字段编码</th>
              <th className="px-3 py-2">字段类型</th>
              <th className="px-3 py-2">空值率</th>
              <th className="px-3 py-2">唯一率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {props.fields.map((field) => (
              <FieldRow key={field.source_index} field={field} onManualKeyEdit={markManualKey} {...props} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EntityCodeRuleEditor(props: {
  schema: SchemaDraft;
  onSchema: (schema: SchemaDraft) => void;
}) {
  const config = normalizeEntityCodeConfig(
    props.schema.schema_code,
    props.schema.entity_code_config
  );
  const update = (patch: Partial<EntityCodeConfig>) =>
    props.onSchema({
      ...props.schema,
      entity_code_config: { ...config, ...patch },
    });
  return (
    <div className="grid gap-3 border border-border bg-background p-3 text-sm md:col-span-2 md:grid-cols-4">
      <TextInput
        id="excel-entity-code-prefix"
        name="entity_code_prefix"
        label="编码前缀"
        value={config.prefix}
        onChange={(prefix) => update({ prefix })}
      />
      <NumberInput
        id="excel-entity-code-padding"
        name="entity_code_padding"
        label="数字位数"
        value={config.padding}
        min={0}
        onChange={(padding) => update({ padding })}
      />
      <NumberInput
        id="excel-entity-code-start"
        name="entity_code_start"
        label="起始序号"
        value={config.start_sequence}
        min={1}
        onChange={(start_sequence) => update({ start_sequence })}
      />
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">重置周期</span>
        <select
          value={config.sequence_reset_period}
          onChange={(event) =>
            update({ sequence_reset_period: event.target.value as SequenceResetPeriod })
          }
          className="h-10 border border-border bg-background px-3 outline-none"
        >
          <option value="none">不重置</option>
          <option value="year">按年</option>
          <option value="quarter">按季度</option>
          <option value="month">按月</option>
        </select>
      </label>
      <div className="border border-border bg-card px-3 py-2 md:col-span-4">
        <span className="text-xs text-muted-foreground">样例</span>
        <div className="mt-1 font-mono text-sm">
          {formatEntityCodeSample(props.schema.schema_code, config)}
        </div>
      </div>
    </div>
  );
}

function FieldRow(props: {
  schema: SchemaDraft;
  fields: FieldDraft[];
  field: FieldDraft;
  onSchema: (schema: SchemaDraft) => void;
  onFields: (fields: FieldDraft[]) => void;
  onManualKeyEdit: (sourceIndex: number) => void;
}) {
  const fieldId = `field-${props.field.source_index}`;
  const update = (patch: Partial<FieldDraft>) =>
    props.onFields(props.fields.map((item) => (item === props.field ? { ...item, ...patch } : item)));
  return (
    <tr className="nd-table-row">
      <td className="px-3 py-2">
        <input
          id={`${fieldId}-import`}
          name={`${fieldId}-import`}
          type="checkbox"
          checked={props.field.import}
          onChange={(event) => update({ import: event.target.checked })}
        />
      </td>
      <td className="px-3 py-2">
        {props.schema.identity_mode === "composite" ? (
          <input
            id={`${fieldId}-identity-part`}
            name={`${fieldId}-identity-part`}
            type="checkbox"
            title="加入组合实体标识"
            aria-label={`将 ${props.field.label || props.field.source_column} 加入组合实体标识`}
            checked={props.schema.identity_field_keys.includes(props.field.key)}
            onChange={() => toggleCompositeIdentityField(props)}
          />
        ) : (
          <button
            type="button"
            title="设为实体标识"
            aria-label={`将 ${props.field.label || props.field.source_column} 设为实体标识`}
            onClick={() =>
              props.onSchema({
                ...props.schema,
                identity_mode: "single",
                identity_field_key: props.field.key,
                identity_field_keys: [],
              })
            }
            className={cn(
              "grid size-8 place-items-center border border-border",
              props.schema.identity_field_key === props.field.key &&
                "border-foreground bg-foreground text-background"
            )}
          >
            <Radio className="size-4" />
          </button>
        )}
      </td>
      <td className="px-3 py-2">
        <IdentityQualityBadge field={props.field} />
      </td>
      <td className="px-3 py-2">{props.field.source_column}</td>
      <td className="px-3 py-2">
        <CellInput
          id={`${fieldId}-label`}
          name={`${fieldId}-label`}
          value={props.field.label}
          onChange={(label) => update({ label })}
        />
      </td>
      <td className="px-3 py-2">
        <CellInput
          id={`${fieldId}-key`}
          name={`${fieldId}-key`}
          value={props.field.key}
          onChange={(key) => {
            props.onManualKeyEdit(props.field.source_index);
            update({ key });
          }}
        />
      </td>
      <td className="px-3 py-2">
        <select
          id={`${fieldId}-type`}
          name={`${fieldId}-type`}
          value={props.field.type}
          onChange={(event) => replaceFieldType(props, event.target.value as FieldType)}
          className="h-8 border border-border bg-background px-2"
        >
          {INTAKE_FIELD_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 font-mono text-xs">{Math.round(props.field.empty_rate * 100)}%</td>
      <td className="px-3 py-2 font-mono text-xs">{Math.round(props.field.unique_rate * 100)}%</td>
    </tr>
  );
}

function IdentityQualityNotice(props: { schema: SchemaDraft; fields: FieldDraft[] }) {
  if (props.schema.identity_field_key === GENERATED_ENTITY_CODE_FIELD_KEY) {
    return (
      <div className={cn("nd-interactive-surface border bg-card p-3 text-sm", QUALITY_TONE.neutral)}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="font-medium">将生成唯一实体编码</div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              预览会生成 entity_code；后续导入需继续携带该字段，用它匹配同一个实体。
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (props.schema.identity_field_key === PERSON_CODE_FIELD_KEY) {
    return (
      <div className={cn("nd-interactive-surface border bg-card p-3 text-sm", QUALITY_TONE.neutral)}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="font-medium">将生成稳定人员编码</div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              预览会生成 person_code；后续周期导入需继续携带 person_code，不能用行号重新匹配。
            </div>
          </div>
        </div>
      </div>
    );
  }
  const selectedFields = identitySelectedFields(props.schema, props.fields);
  if (selectedFields.length === 0) return null;
  const quality = worstIdentityQuality(selectedFields);
  const reasons = selectedFields.flatMap((field) => identityQuality(field).reasons);
  const title = identityNoticeTitle(props.schema, quality.level);
  return (
    <div className={cn("nd-interactive-surface border bg-card p-3 text-sm", QUALITY_TONE[quality.level])}>
      <div className="flex items-start gap-3">
        <IdentityQualityIcon level={quality.level} className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          <div className="mt-1 break-words text-xs text-muted-foreground">
            {selectedFields.map((field) => field.label || field.source_column).join(" + ")}
            {reasons.length > 0 && ` · ${Array.from(new Set(reasons)).slice(0, 3).join(" / ")}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function IdentityQualityBadge(props: { field: FieldDraft }) {
  const quality = identityQuality(props.field);
  const reasons = quality.reasons.slice(0, 2);
  return (
    <div className="grid min-w-44 gap-1">
      <span
        title={quality.reasons.join("；")}
        className={cn("inline-flex w-fit items-center gap-1 border px-2 py-1 text-xs", QUALITY_TONE[quality.level])}
      >
        <IdentityQualityIcon level={quality.level} className="size-3.5" />
        {quality.label}
      </span>
      {reasons.length > 0 && (
        <span className="break-words text-xs text-muted-foreground">{reasons.join(" / ")}</span>
      )}
    </div>
  );
}

function IdentityQualityIcon(props: { level: IdentityQualityLevel; className?: string }) {
  if (props.level === "recommended") return <ShieldCheck className={props.className} aria-hidden />;
  if (props.level === "risk") return <AlertTriangle className={props.className} aria-hidden />;
  if (props.level === "discouraged") return <AlertTriangle className={props.className} aria-hidden />;
  return <Info className={props.className} aria-hidden />;
}

function identitySelectedFields(schema: SchemaDraft, fields: FieldDraft[]) {
  if (schema.identity_mode === "composite") {
    const keys = new Set(schema.identity_field_keys);
    return fields.filter((field) => field.import && keys.has(field.key));
  }
  return fields.filter((field) => field.import && field.key === schema.identity_field_key);
}

function worstIdentityQuality(fields: FieldDraft[]) {
  return fields.map(identityQuality).sort((left, right) => qualityRank(right.level) - qualityRank(left.level))[0];
}

function identityQuality(field: FieldDraft): IdentityQuality {
  return field.identity_quality ?? {
    level: field.identity_candidate ? "recommended" : "neutral",
    label: field.identity_candidate ? "推荐" : "需确认",
    score: field.identity_candidate ? 1 : 0,
    reasons: field.identity_candidate ? ["系统推荐字段"] : ["需通过预览验证唯一性"],
  };
}

function qualityRank(level: IdentityQualityLevel) {
  if (level === "discouraged") return 3;
  if (level === "risk") return 2;
  if (level === "neutral") return 1;
  return 0;
}

function identityNoticeTitle(schema: SchemaDraft, level: IdentityQualityLevel) {
  const prefix = schema.identity_mode === "composite" ? "当前组合标识" : "当前标识字段";
  if (level === "recommended") return `${prefix}质量较高`;
  if (level === "discouraged") return `${prefix}不推荐`;
  if (level === "risk") return `${prefix}存在风险`;
  return `${prefix}需要预览确认`;
}

function IdentityModeButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "h-9 border-r border-border px-3 text-sm last:border-r-0",
        props.active ? "bg-foreground text-background" : "bg-background text-muted-foreground"
      )}
    >
      {props.label}
    </button>
  );
}

function singleIdentitySchema(schema: SchemaDraft, fields: FieldDraft[]): SchemaDraft {
  const fallbackKey = fields.find((field) => field.import)?.key ?? "";
  const identityKey =
    [
      GENERATED_ENTITY_CODE_FIELD_KEY,
      IDENTITY_CODE_FIELD_KEY,
      PERSON_CODE_FIELD_KEY,
    ].includes(schema.identity_field_key)
      ? schema.identity_field_keys[0] ?? fallbackKey
      : schema.identity_field_key;
  return {
    ...schema,
    identity_mode: "single",
    identity_field_key: identityKey,
    identity_field_keys: [],
  };
}

function generatedEntityCodeIdentitySchema(schema: SchemaDraft): SchemaDraft {
  return {
    ...schema,
    identity_mode: "single",
    identity_field_key: GENERATED_ENTITY_CODE_FIELD_KEY,
    identity_field_keys: [],
    entity_code_config: normalizeEntityCodeConfig(schema.schema_code, schema.entity_code_config),
  };
}

function personCodeIdentitySchema(schema: SchemaDraft): SchemaDraft {
  return {
    ...schema,
    identity_mode: "single",
    identity_field_key: PERSON_CODE_FIELD_KEY,
    identity_field_keys: [],
  };
}

function compositeIdentitySchema(schema: SchemaDraft): SchemaDraft {
  const generatedKeys = [
    GENERATED_ENTITY_CODE_FIELD_KEY,
    IDENTITY_CODE_FIELD_KEY,
    PERSON_CODE_FIELD_KEY,
  ];
  const seed = schema.identity_field_key && !generatedKeys.includes(schema.identity_field_key)
    ? [schema.identity_field_key]
    : schema.identity_field_keys;
  return {
    ...schema,
    identity_mode: "composite",
    identity_field_key: IDENTITY_CODE_FIELD_KEY,
    identity_field_keys: seed,
  };
}

function toggleCompositeIdentityField(props: {
  schema: SchemaDraft;
  field: FieldDraft;
  onSchema: (schema: SchemaDraft) => void;
}) {
  props.onSchema({
    ...props.schema,
    identity_mode: "composite",
    identity_field_key: IDENTITY_CODE_FIELD_KEY,
    identity_field_keys: nextCompositeIdentityKeys(props.schema, props.field.key),
  });
}

function replaceFieldType(props: { field: FieldDraft; fields: FieldDraft[]; onFields: (fields: FieldDraft[]) => void }, type: FieldType) {
  const next = updateFieldType(props.field, type);
  props.onFields(props.fields.map((item) => (item === props.field ? next : item)));
}

function TextInput(props: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={props.id} className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        id={props.id}
        name={props.name}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 outline-none"
      />
    </label>
  );
}

function NumberInput(props: {
  id: string;
  name: string;
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={props.id} className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        id={props.id}
        name={props.name}
        type="number"
        min={props.min}
        value={props.value}
        onChange={(event) =>
          props.onChange(event.target.value === "" ? props.min : Number(event.target.value))
        }
        className="h-10 border border-border bg-background px-3 outline-none"
      />
    </label>
  );
}

function CellInput(props: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      id={props.id}
      name={props.name}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      className="h-8 w-full border border-border bg-background px-2 text-sm outline-none"
    />
  );
}
