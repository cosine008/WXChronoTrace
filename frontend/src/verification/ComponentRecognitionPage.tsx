import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Database, Settings } from "lucide-react";

import { DataMetric, MetricGrid, MetricStrip, TimePointIndicator } from "@/components/badges";
import { AuditMarker, ChangeBadge, PermissionTag, StatusBadge } from "@/components/badges";
import { SchemaObjectRow } from "@/components/schema/SchemaObjectRow";
import { SchemaIconPicker } from "@/components/schema-icons/SchemaIconPicker";
import { AuditDayGroup } from "@/features/audit/AuditTimeline";
import { TimelineScrubber } from "@/features/current-view/TimelineScrubber";
import { DataCardList } from "@/features/workbench/DataCardList";
import { MaterialList } from "@/features/workbench/MaterialList";
import { NoteListRow } from "@/features/workbench/NoteListRow";
import { FieldDesigner } from "@/features/schema-wizard/FieldDesigner";
import { SchemaDraftObjectPreview } from "@/features/schema-wizard/SchemaDraftObjectPreview";
import { cn } from "@/lib/utils";
import {
  auditEntries,
  changesets,
  dataCardItem,
  materialItem,
  noteItem,
  sampleFields,
  schemaObjects,
  wizardState as initialWizardState,
} from "./componentRecognitionFixtures";

export function ComponentRecognitionPage() {
  const [fields, setFields] = useState(sampleFields);
  const [selectedFieldKey, setSelectedFieldKey] = useState(sampleFields[1]?.key ?? sampleFields[0].key);
  const [dataCardCategory, setDataCardCategory] = useState("");
  const [dataCardStatus, setDataCardStatus] = useState("");
  const [dataCardTag, setDataCardTag] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [materialTag, setMaterialTag] = useState("");
  const [wizardIcon, setWizardIcon] = useState(initialWizardState.icon);
  const wizardState = { ...initialWizardState, icon: wizardIcon, fields, selectedFieldKey };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-5 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center border border-border bg-background">
              <Database className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-semibold">
                ChronoTrace Component Recognition Samples
              </h1>
              <p className="text-sm text-muted-foreground">
                P0/P1 组件识别截图样张，固定 fixtures，不依赖后端数据。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <VerificationToken label="Light/Dark" />
            <VerificationToken label="Desktop/Mobile" />
            <VerificationToken label="Grayscale" />
            <VerificationToken label="Fixture Data" />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-6">
        <SampleSection title="MetricGrid / MetricStrip" dataKey="metrics">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
            <MetricGrid>
              <DataMetric label="筛选结果" value="1,284" hint="当前快照" tone="info" emphasis />
              <DataMetric label="待审批" value="12" hint="需处理" tone="warning" />
              <DataMetric label="敏感操作" value="4" hint="24h" tone="danger" />
              <DataMetric
                label="导出成功率"
                value="98"
                unit="%"
                hint="最近 30 天"
                tone="success"
                trend="↑ 2.1%"
                onClick={() => undefined}
                interactiveLabel="查看导出成功率"
              />
            </MetricGrid>
            <MetricStrip columns={2} className="sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-2">
              {["资料卡", "笔记", "材料", "我的表"].map((label, index) => (
                <DataMetric
                  key={label}
                  label={label}
                  value={String([18, 42, 7, 9][index])}
                  hint={index === 3 ? "可见数据表" : "工作台对象"}
                  tone={index === 3 ? "info" : "neutral"}
                  layout="strip"
                  density="compact"
                />
              ))}
            </MetricStrip>
          </div>
        </SampleSection>

        <SampleSection title="TimePointIndicator / ChronoTimeRail" dataKey="time">
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <TimePointIndicator kind="now" date="2026-05-26" detail="datetime" />
              <TimePointIndicator kind="past" date="2026-03-08" detail="date" />
              <TimePointIndicator kind="future" date="2026-06-12" detail="date" />
              <TimePointIndicator kind="now" size="sm" detail="status" />
              <TimePointIndicator kind="past" size="sm" date="2026-01-16" detail="date" />
            </div>
            <TimelineScrubber at="2026-05-26" changesets={changesets} onChange={() => undefined} />
          </div>
        </SampleSection>

        <SampleSection title="Badges / Tokens" dataKey="tokens">
          <div className="grid gap-4 lg:grid-cols-4">
            <TokenCluster title="ChangeBadge">
              <ChangeBadge kind="new" count={12} />
              <ChangeBadge kind="modified" count={47} />
              <ChangeBadge kind="terminated" count={3} />
              <ChangeBadge kind="failed" count={1} />
            </TokenCluster>
            <TokenCluster title="StatusBadge">
              {(["draft", "submitted", "approved", "rejected", "applied", "reverted"] as const).map((variant) => (
                <StatusBadge key={variant} variant={variant} />
              ))}
            </TokenCluster>
            <TokenCluster title="PermissionTag">
              <PermissionTag role="owner" />
              <PermissionTag role="admin" />
              <PermissionTag role="editor" />
              <PermissionTag visibility="private" />
              <PermissionTag visibility="shared" />
              <PermissionTag visibility="public" />
            </TokenCluster>
            <TokenCluster title="AuditMarker">
              <AuditMarker kind="auth" />
              <AuditMarker kind="export" risk="sensitive" />
              <AuditMarker kind="permission" risk="high" />
              <AuditMarker kind="label" />
              <AuditMarker kind="schema" />
              <AuditMarker kind="system" />
            </TokenCluster>
          </div>
        </SampleSection>

        <SampleSection title="SchemaObjectRow" dataKey="schema-object">
          <div className="grid gap-3">
            <SchemaObjectRow
              schema={schemaObjects[0]}
              density="dashboard"
              recordsPath="/schemas/18/records"
              settingsPath="/schemas/18/settings"
            />
            <SchemaObjectRow
              schema={schemaObjects[0]}
              density="admin"
              recordsPath="/admin/schemas"
              actions={<SchemaActionSet />}
            />
            <SchemaObjectRow
              schema={schemaObjects[1]}
              density="compact"
              recordsPath="/schemas/23/records"
              className="border border-border bg-card"
            />
          </div>
        </SampleSection>

        <SampleSection title="AuditTimeline" dataKey="audit">
          <AuditDayGroup date="2026-05-26" items={auditEntries} />
        </SampleSection>

        <SampleSection title="Workbench Object Rows" dataKey="workbench">
          <div className="grid gap-4">
            <div className="border border-border bg-card">
              <DataCardList
                items={[dataCardItem]}
                categoryFilter={dataCardCategory}
                statusFilter={dataCardStatus}
                tagQuery={dataCardTag}
                onCategoryFilterChange={setDataCardCategory}
                onStatusFilterChange={setDataCardStatus}
                onTagQueryChange={setDataCardTag}
                onOpen={() => undefined}
                onCreate={() => undefined}
              />
            </div>
            <div className="border border-border bg-card">
              <NoteListRow item={noteItem} onOpen={() => undefined} />
            </div>
            <div className="border border-border bg-card">
              <MaterialList
                items={[materialItem]}
                fileTypeFilter={materialType}
                tagQuery={materialTag}
                deletingIds={new Set()}
                savingIds={new Set()}
                downloadingIds={new Set()}
                onFileTypeFilterChange={setMaterialType}
                onTagQueryChange={setMaterialTag}
                onOpen={() => undefined}
                onPreview={() => undefined}
                onDownload={() => undefined}
                onDelete={() => undefined}
              />
            </div>
          </div>
        </SampleSection>

        <SampleSection title="Schema Wizard Basic / Field Design" dataKey="wizard">
          <div className="grid gap-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.85fr)] xl:items-start">
              <WizardBasicSample state={wizardState} onIconChange={setWizardIcon} />
              <SchemaDraftObjectPreview state={wizardState} />
            </div>
            <FieldDesigner
              fields={fields}
              selectedKey={selectedFieldKey}
              onSelect={setSelectedFieldKey}
              onChange={(nextFields, nextSelectedKey) => {
                setFields(nextFields);
                if (nextSelectedKey) setSelectedFieldKey(nextSelectedKey);
              }}
            />
          </div>
        </SampleSection>
      </div>
    </main>
  );
}

function WizardBasicSample(props: {
  state: typeof initialWizardState;
  onIconChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ReadonlyField label="表名" value={props.state.name} />
        <label className="grid gap-1 text-sm">
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">表编码</span>
            <span className="inline-grid h-5 grid-cols-[auto_minmax(0,1fr)] overflow-hidden border border-border bg-background text-[10px]">
              <span className="border-r border-border px-1.5 font-mono uppercase text-muted-foreground">
                AUTO
              </span>
              <span className="truncate px-1.5 text-muted-foreground">自动生成</span>
            </span>
          </span>
          <input
            readOnly
            value={props.state.schemaCode}
            className="h-10 border border-border bg-background px-3 font-mono text-sm outline-none"
          />
        </label>
      </div>
      <SchemaIconPicker value={props.state.icon} onChange={props.onIconChange} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">描述 · 可选</span>
        <textarea
          readOnly
          value={props.state.description}
          rows={3}
          className="min-h-20 border border-border bg-background px-3 py-2 text-sm outline-none"
        />
      </label>
    </div>
  );
}

function ReadonlyField(props: { label: string; value: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        readOnly
        value={props.value}
        className="h-10 border border-border bg-background px-3 outline-none"
      />
    </label>
  );
}

function SampleSection(props: { title: string; dataKey: string; children: React.ReactNode }) {
  return (
    <section data-verification-section={props.dataKey} className="grid gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.12em]">{props.title}</h2>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
      {props.children}
    </section>
  );
}

function TokenCluster(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2 border border-border bg-card p-3">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {props.title}
      </h3>
      <div className="flex flex-wrap gap-2">{props.children}</div>
    </div>
  );
}

function VerificationToken({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
      <CheckCircle2 className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function SchemaActionSet() {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title="打开数据视图"
        aria-label="打开数据视图"
        className={cn("grid size-9 place-items-center border border-border text-muted-foreground")}
      >
        <ArrowUpRight className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        title="打开表设置"
        aria-label="打开表设置"
        className={cn("grid size-9 place-items-center border border-border text-muted-foreground")}
      >
        <Settings className="size-4" aria-hidden />
      </button>
    </div>
  );
}
