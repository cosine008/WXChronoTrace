import type { SchemaObjectModel } from "@/components/schema/SchemaObjectRow";
import { SchemaObjectRow } from "@/components/schema/SchemaObjectRow";
import { GENERATED_ENTITY_CODE_FIELD_KEY } from "@/lib/schemaFields";
import { cn } from "@/lib/utils";
import { generatedEntityCodeField, type WizardState } from "./schemaWizardState";

export function SchemaDraftObjectPreview({ state }: { state: WizardState }) {
  const schema = draftSchemaObject(state);

  return (
    <aside className="grid min-w-0 gap-3 border border-border bg-card p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3 className="text-sm font-semibold text-foreground">对象预览</h3>
          <p className="text-xs text-muted-foreground">首屏同步生成未来数据表的工作台形态。</p>
        </div>
        <DraftToken code="LIVE" label="草稿" tone="info" />
      </div>

      <SchemaObjectRow
        schema={schema}
        density="compact"
        recordsPath="/schemas/new"
        actions={<DraftActionStack state={state} />}
        className="border border-border bg-background"
      />

      <div className="grid gap-2 border-t border-border pt-3 text-xs">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DraftToken code={state.schemaCodeManual ? "MANUAL" : "AUTO"} label="表编码" />
          <DraftToken code={state.temporalMode === "continuous" ? "RAIL" : "GRID"} label={temporalLabel(state)} />
          <DraftToken code="VIS" label={visibilityLabel(state.visibility)} />
          <DraftToken
            code="APP"
            label={state.approvalRequired ? "启用审批" : "免审批"}
            tone={state.approvalRequired ? "warning" : "neutral"}
          />
        </div>
        <p className="line-clamp-2 text-muted-foreground">
          {state.description.trim() || "描述会作为团队理解这张表边界的辅助信息。"}
        </p>
      </div>
    </aside>
  );
}

function DraftActionStack({ state }: { state: WizardState }) {
  return (
    <div className="flex min-w-0 flex-wrap justify-start gap-1.5 md:justify-end">
      <DraftToken code={state.schemaCodeManual ? "MANUAL" : "AUTO"} label={state.schemaCode || "等待编码"} />
      <DraftToken
        code="APP"
        label={state.approvalRequired ? "审批" : "直入"}
        tone={state.approvalRequired ? "warning" : "neutral"}
      />
    </div>
  );
}

function DraftToken(props: {
  code: string;
  label: string;
  tone?: "neutral" | "info" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-grid h-6 max-w-full grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden border bg-background text-[11px]",
        props.tone === "info" && "border-[var(--color-status-info)]/70",
        props.tone === "warning" && "border-[var(--color-status-modified)]/80",
        (!props.tone || props.tone === "neutral") && "border-border"
      )}
    >
      <span className="border-r border-current px-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        {props.code}
      </span>
      <span className="min-w-0 truncate px-1.5">{props.label}</span>
    </span>
  );
}

function draftSchemaObject(state: WizardState): SchemaObjectModel {
  const fields = draftFields(state);
  return {
    id: 0,
    name: state.name.trim() || "未命名表",
    schemaCode: state.schemaCode || "waiting_code",
    icon: state.icon,
    temporalMode: state.temporalMode,
    visibility: state.visibility,
    approvalRequired: state.approvalRequired,
    fieldCount: fields.length,
    currentVersion: 1,
    rowCount: 0,
    owner: { username: "you" },
    fieldPreview: fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      hidden: field.hidden,
      system: field.system,
    })),
  };
}

function draftFields(state: WizardState) {
  if (state.identityFieldKey !== GENERATED_ENTITY_CODE_FIELD_KEY) return state.fields;
  return [
    generatedEntityCodeField(state.schemaCode, state.entityCodeConfig),
    ...state.fields.filter((field) => field.key !== GENERATED_ENTITY_CODE_FIELD_KEY),
  ];
}

function temporalLabel(state: WizardState) {
  if (state.temporalMode === "continuous") return "连续时间";
  return {
    day: "日度快照",
    week: "周度快照",
    month: "月度快照",
    quarter: "季度快照",
    half_year: "半年度快照",
    year: "年度快照",
  }[state.periodUnit];
}

function visibilityLabel(value: WizardState["visibility"]) {
  return { private: "私有", shared: "共享", public: "公共" }[value];
}
