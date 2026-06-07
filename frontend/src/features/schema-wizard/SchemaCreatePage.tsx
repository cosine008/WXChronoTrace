import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { createWorkbenchLink, type WorkbenchItem } from "@/api/workbench";
import { createSchema, type EntityCodeConfig, type SequenceResetPeriod } from "@/api/schemas";
import { SchemaIcon, SchemaIconPicker } from "@/components/schema-icons/SchemaIconPicker";
import { useNotification } from "@/components/notifications";
import { workbenchKeys } from "@/features/workbench/useWorkbenchQueries";
import { extractApiError } from "@/lib/api";
import {
  flattenApiErrorDetails,
  formatApiErrorDetail,
  humanizeApiErrorPath,
  type ApiErrorFieldMessage,
} from "@/lib/apiErrorFormat";
import { GENERATED_ENTITY_CODE_FIELD_KEY, formatEntityCodeSample } from "@/lib/schemaFields";
import { cn } from "@/lib/utils";
import { FieldDesigner } from "./FieldDesigner";
import { SchemaDraftObjectPreview } from "./SchemaDraftObjectPreview";
import { SchemaTemporalStep } from "./SchemaTemporalStep";
import { SchemaWorkbenchPanel } from "./SchemaWorkbenchPanel";
import {
  WIZARD_STEPS,
  buildPayload,
  generatedEntityCodeField,
  initialWizardState,
  setSchemaCodeManually,
  syncSchemaCodeFromName,
  validateStep,
  type WizardState,
  type WizardStep,
} from "./schemaWizardState";
import { WizardStepper } from "./WizardStepper";

export function SchemaCreatePage() {
  const [state, setState] = useState<WizardState>(initialWizardState);
  const [step, setStep] = useState<WizardStep>("basic");
  const [error, setError] = useState<string | null>(null);
  const [errorStep, setErrorStep] = useState<WizardStep | null>(null);
  const [errorDetails, setErrorDetails] = useState<ApiErrorFieldMessage[]>([]);
  const [pendingWorkbenchItems, setPendingWorkbenchItems] = useState<WorkbenchItem[]>([]);
  const [workbenchBusy, setWorkbenchBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useNotification();
  const mutation = useMutation({
    mutationFn: createSchema,
    onSuccess: async (schema) => {
      await queryClient.invalidateQueries({ queryKey: ["schemas"] });
      notify.success({
        title: "数据表已创建",
        message: `${schema.name} 已加入工作台。`,
      });
      void linkPendingWorkbenchItems({
        itemIds: pendingWorkbenchItems.map((item) => item.id),
        schemaId: schema.id,
        queryClient,
        notify,
      });
      navigate("/", { replace: true });
    },
    onError: (err) => {
      const apiError = extractApiError(err);
      const fieldMessages = flattenApiErrorDetails(apiError.details);
      const targetStep = inferWizardStepFromApiError(fieldMessages);
      if (targetStep) setStep(targetStep);
      setErrorStep(targetStep);
      setErrorDetails(fieldMessages);
      setError(formatWizardErrorMessage(apiError.message, fieldMessages, targetStep));
      notify.error({
        title: "建表失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const stepIndex = WIZARD_STEPS.findIndex((item) => item.id === step);
  const currentError = useMemo(() => validateStep(step, state), [state, step]);

  function goNext() {
    if (currentError) return showValidationError(currentError, step);
    clearError();
    const next = WIZARD_STEPS[stepIndex + 1]?.id;
    if (next) setStep(next);
  }

  function submit() {
    if (workbenchBusy) {
      const message = "工作台内容仍在保存，请稍后创建";
      setError(message);
      setErrorStep(null);
      setErrorDetails([]);
      notify.error({
        title: "工作台内容仍在保存",
        message,
      });
      return;
    }
    const firstInvalid = WIZARD_STEPS.map((item) => ({
      step: item.id,
      message: validateStep(item.id, state),
    })).find((item) => item.message);
    if (firstInvalid?.message) return showValidationError(firstInvalid.message, firstInvalid.step);
    clearError();
    return mutation.mutate(buildPayload(state));
  }

  function showValidationError(message: string, targetStep: WizardStep) {
    setStep(targetStep);
    setErrorStep(targetStep);
    setErrorDetails([]);
    setError(message);
    notify.error({
      title: "建表校验失败",
      message,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid max-w-7xl gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-5">
          <WizardStepper current={step} errorStep={errorStep} onSelect={handleStepSelect} />
          <section className="nd-interactive-surface min-h-[520px] border border-border bg-background p-5">
            <StepBody state={state} step={step} onChange={setState} />
          </section>
          <footer className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
            <div className="grid gap-2">
              <p className="min-h-5 text-sm text-[var(--color-status-error)]">{error}</p>
              {errorDetails.length > 0 && <ErrorSummary items={errorDetails} />}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => setStep(WIZARD_STEPS[stepIndex - 1].id)}
                className="inline-flex h-10 items-center gap-2 border border-border px-4 text-sm hover:border-foreground disabled:opacity-40"
              >
                <ArrowLeft className="size-4" aria-hidden />
                上一步
              </button>
              {stepIndex < WIZARD_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm text-background"
                >
                  下一步
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={mutation.isPending || workbenchBusy}
                  className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm text-background disabled:opacity-50"
                >
                  {mutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  )}
                  创建
                </button>
              )}
            </div>
          </footer>
        </div>
        <SchemaWorkbenchPanel
          disabled={mutation.isPending}
          pendingItems={pendingWorkbenchItems}
          onBusyChange={setWorkbenchBusy}
          onTogglePendingItem={handleTogglePendingWorkbenchItem}
          onRemovePendingItem={handleRemovePendingWorkbenchItem}
        />
      </main>
    </div>
  );

  function handleStepSelect(nextStep: WizardStep) {
    setStep(nextStep);
    if (errorStep === nextStep) setErrorStep(null);
  }

  function clearError() {
    setError(null);
    setErrorStep(null);
    setErrorDetails([]);
  }

  function handleTogglePendingWorkbenchItem(item: WorkbenchItem, enabled: boolean) {
    setPendingWorkbenchItems((current) => {
      const hasItem = current.some((candidate) => candidate.id === item.id);
      if (enabled) return hasItem ? current : [...current, item];
      return current.filter((candidate) => candidate.id !== item.id);
    });
  }

  function handleRemovePendingWorkbenchItem(id: number) {
    setPendingWorkbenchItems((current) => current.filter((item) => item.id !== id));
  }
}

function StepBody(props: {
  step: WizardStep;
  state: WizardState;
  onChange: (state: WizardState) => void;
}) {
  if (props.step === "basic") return <BasicStep {...props} />;
  if (props.step === "temporal") return <SchemaTemporalStep {...props} />;
  if (props.step === "fields") return <FieldsStep {...props} />;
  if (props.step === "identity") return <IdentityStep {...props} />;
  return <VisibilityStep {...props} />;
}

function BasicStep({ state, onChange }: StepProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.85fr)] xl:items-start">
      <div className="grid min-w-0 gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="表名"
            placeholder="例如：固定资产清单"
            value={state.name}
            onChange={(name) => onChange(syncSchemaCodeFromName(state, name))}
          />
          <SchemaCodeField
            value={state.schemaCode}
            manual={state.schemaCodeManual}
            hasName={Boolean(state.name.trim())}
            onChange={(value) => onChange(setSchemaCodeManually(state, value))}
          />
        </div>
        <SchemaIconPicker
          value={state.icon}
          onChange={(icon) => onChange({ ...state, icon })}
        />
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">描述 · 可选</span>
          <textarea
            value={state.description}
            rows={3}
            placeholder="用于团队理解这张表的边界，不参与字段生成。"
            onChange={(event) => onChange({ ...state, description: event.target.value })}
            className="min-h-20 border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-foreground"
          />
        </label>
      </div>
      <SchemaDraftObjectPreview state={state} />
    </div>
  );
}

function FieldsStep({ state, onChange }: StepProps) {
  return (
    <FieldDesigner
      fields={state.fields}
      selectedKey={state.selectedFieldKey}
      onSelect={(selectedFieldKey) => onChange({ ...state, selectedFieldKey })}
      onChange={(fields, selectedFieldKey) => {
        const identityStillExists =
          state.identityFieldKey === GENERATED_ENTITY_CODE_FIELD_KEY ||
          fields.some((field) => field.key === state.identityFieldKey);
        onChange({
          ...state,
          fields,
          selectedFieldKey: selectedFieldKey ?? state.selectedFieldKey,
          identityFieldKey: identityStillExists ? state.identityFieldKey : fields[0]?.key ?? "",
        });
      }}
    />
  );
}

function IdentityStep({ state, onChange }: StepProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">实体标识字段</span>
        <select
          value={state.identityFieldKey}
          onChange={(event) => onChange({ ...state, identityFieldKey: event.target.value })}
          className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground"
        >
          <option value={GENERATED_ENTITY_CODE_FIELD_KEY}>
            自动生成实体编码 · {GENERATED_ENTITY_CODE_FIELD_KEY}
          </option>
          {state.fields.filter((field) => field.key !== GENERATED_ENTITY_CODE_FIELD_KEY).map((field) => (
            <option key={field.key} value={field.key}>
              {field.label} · {field.key}
            </option>
          ))}
        </select>
      </label>
      {state.identityFieldKey === GENERATED_ENTITY_CODE_FIELD_KEY && (
        <EntityCodeRuleEditor state={state} onChange={onChange} />
      )}
      <Preview state={state} />
    </div>
  );
}

function EntityCodeRuleEditor({ state, onChange }: StepProps) {
  const config = state.entityCodeConfig;
  const update = (patch: Partial<EntityCodeConfig>) =>
    onChange({ ...state, entityCodeConfig: { ...config, ...patch } });
  return (
    <div className="grid gap-3 border border-border bg-card p-3 text-sm md:col-span-2 md:grid-cols-4">
      <Input
        label="编码前缀"
        value={config.prefix}
        onChange={(prefix) => update({ prefix })}
        placeholder="ASSET-"
      />
      <NumberField
        label="数字位数"
        value={config.padding}
        min={0}
        onChange={(padding) => update({ padding })}
      />
      <NumberField
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
          className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground"
        >
          <option value="none">不重置</option>
          <option value="year">按年</option>
          <option value="quarter">按季度</option>
          <option value="month">按月</option>
        </select>
      </label>
      <div className="border border-border bg-background px-3 py-2 md:col-span-4">
        <span className="text-xs text-muted-foreground">样例</span>
        <div className="mt-1 font-mono text-sm">
          {formatEntityCodeSample(state.schemaCode, config)}
        </div>
      </div>
    </div>
  );
}

function VisibilityStep({ state, onChange }: StepProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(["private", "shared", "public"] as const).map((visibility) => (
        <Choice
          key={visibility}
          active={state.visibility === visibility}
          title={{ private: "私有", shared: "共享", public: "公共" }[visibility]}
          meta={visibility}
          onClick={() => onChange({ ...state, visibility })}
        />
      ))}
      <label className="flex h-12 items-center gap-2 border border-border px-3 text-sm md:col-span-3">
        <input
          type="checkbox"
          checked={state.approvalRequired}
          onChange={(event) => onChange({ ...state, approvalRequired: event.target.checked })}
        />
        <span>启用审批</span>
      </label>
      <Preview state={state} />
    </div>
  );
}

type StepProps = {
  state: WizardState;
  onChange: (state: WizardState) => void;
};

function SchemaCodeField(props: {
  value: string;
  manual: boolean;
  hasName: boolean;
  onChange: (value: string) => void;
}) {
  const codeState = props.manual ? "MANUAL" : props.value ? "AUTO" : "WAIT";
  const stateLabel = props.manual ? "手动编码" : props.value ? "自动生成" : "等待表名";

  return (
    <label className="grid gap-1 text-sm">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">表编码</span>
        <span className="inline-grid h-5 grid-cols-[auto_minmax(0,1fr)] overflow-hidden border border-border bg-background text-[10px]">
          <span className="border-r border-border px-1.5 font-mono uppercase text-muted-foreground">
            {codeState}
          </span>
          <span className="truncate px-1.5 text-muted-foreground">{stateLabel}</span>
        </span>
      </span>
      <input
        value={props.value}
        placeholder={props.hasName ? "留空则按表名自动生成" : "snake_case 技术标识"}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-foreground"
      />
    </label>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground placeholder:text-muted-foreground/60"
      />
    </label>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type="number"
        min={props.min}
        value={props.value}
        onChange={(event) =>
          props.onChange(event.target.value === "" ? props.min : Number(event.target.value))
        }
        className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground"
      />
    </label>
  );
}

function Choice(props: { active: boolean; title: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "min-h-24 border p-4 text-left transition-colors",
        props.active ? "border-foreground bg-foreground text-background" : "border-border"
      )}
    >
      <span className="block font-display text-lg font-semibold">{props.title}</span>
      <span className="mt-2 block font-mono text-xs opacity-70">{props.meta}</span>
    </button>
  );
}

function Preview({ state }: { state: WizardState }) {
  const fields =
    state.identityFieldKey === GENERATED_ENTITY_CODE_FIELD_KEY
      ? [
          generatedEntityCodeField(state.schemaCode, state.entityCodeConfig),
          ...state.fields.filter((field) => field.key !== GENERATED_ENTITY_CODE_FIELD_KEY),
        ]
      : state.fields;
  return (
    <div className="nd-interactive-surface border border-border bg-card p-4 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center border border-border text-muted-foreground">
            <SchemaIcon value={state.icon} className="size-4" />
          </span>
          <h3 className="truncate font-display text-lg font-semibold">
            {state.name || "未命名表"}
          </h3>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{state.schemaCode}</span>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        {fields.slice(0, 8).map((field) => (
          <div key={field.key} className="grid grid-cols-[120px_1fr_auto] gap-3 border-t border-border pt-2">
            <span>{field.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{field.key}</span>
            <span className="text-xs text-muted-foreground">{field.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorSummary({ items }: { items: ApiErrorFieldMessage[] }) {
  return (
    <div className="grid max-w-2xl gap-1 border border-[var(--color-status-error)]/40 bg-card px-3 py-2 text-xs">
      <div className="font-medium text-[var(--color-status-error)]">需要修正的字段</div>
      {items.slice(0, 4).map((item) => (
        <div key={`${item.path}-${item.message}`} className="grid gap-1 sm:grid-cols-[150px_1fr]">
          <span className="text-muted-foreground">{humanizeApiErrorPath(item.path)}</span>
          <span>{item.message}</span>
        </div>
      ))}
      {items.length > 4 && (
        <div className="text-muted-foreground">还有 {items.length - 4} 项，已收纳在错误弹窗详情中。</div>
      )}
    </div>
  );
}

function inferWizardStepFromApiError(items: ApiErrorFieldMessage[]): WizardStep | null {
  const path = items[0]?.path ?? "";
  if (/^(name|schema_code|description|icon)\b/.test(path)) return "basic";
  if (/^(temporal_mode|period_unit)\b/.test(path)) return "temporal";
  if (/^fields_config\b/.test(path)) return "fields";
  if (/^identity_field_key\b/.test(path)) return "identity";
  if (/^(visibility|approval_required)\b/.test(path)) return "visibility";
  return null;
}

function formatWizardErrorMessage(
  message: string,
  items: ApiErrorFieldMessage[],
  targetStep: WizardStep | null
) {
  const first = items[0];
  const primary = first ? `${humanizeApiErrorPath(first.path)}：${first.message}` : message;
  const stepLabel = WIZARD_STEPS.find((item) => item.id === targetStep)?.label;
  return stepLabel ? `已定位到「${stepLabel}」：${primary}` : primary;
}

async function linkPendingWorkbenchItems(args: {
  itemIds: number[];
  schemaId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  notify: ReturnType<typeof useNotification>;
}) {
  const itemIds = [...new Set(args.itemIds)];
  if (itemIds.length === 0) return;

  const results = await Promise.allSettled(
    itemIds.map((source_item_id) =>
      createWorkbenchLink({ source_item_id, target_schema_id: args.schemaId })
    )
  );
  await args.queryClient.invalidateQueries({ queryKey: workbenchKeys.all });

  const failedCount = results.filter((result) => result.status === "rejected").length;
  if (failedCount === 0) return;

  args.notify.info({
    title: "工作台内容未全部关联",
    message: `数据表已创建，但仍有 ${failedCount}/${itemIds.length} 项内容关联失败，可稍后在工作台补链。`,
  });
}
