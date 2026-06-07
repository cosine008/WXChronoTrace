import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Settings } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { getSchema } from "@/api/schemas";
import { listUsers } from "@/api/users";
import { PermissionTag } from "@/components/badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { visibleUserFields } from "@/lib/schemaFields";
import { BasicSettingsPanel } from "./BasicSettingsPanel";
import { CollaboratorsPanel } from "./CollaboratorsPanel";
import { DangerZonePanel } from "./DangerZonePanel";
import { FieldOrderPanel } from "./FieldOrderPanel";
import { FieldsSettingsPanel } from "./FieldsSettingsPanel";
import { IdentityDisplayTemplatePanel } from "./IdentityDisplayTemplatePanel";
import { LabelPrintTemplatePanel } from "./LabelPrintTemplatePanel";
import { SchemaVersionHistoryPanel } from "./SchemaVersionHistoryPanel";

export function SchemaSettingsPage() {
  const { id } = useParams();
  const schemaId = Number(id);
  const navigate = useNavigate();
  const notify = useNotification();
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const schemaQuery = useQuery({
    queryKey: ["schema", schemaId],
    queryFn: () => getSchema(schemaId),
    enabled: Number.isFinite(schemaId),
  });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => listUsers() });
  const schema = schemaQuery.data;
  const canChangeSchema = schema?.role === "admin" || schema?.role === "owner";
  const visibleFieldCount = schema ? visibleUserFields(schema.fields_config).length : 0;

  async function handleBack() {
    if (fieldsDirty) {
      const confirmed = await notify.confirm({
        title: "离开前放弃字段修改？",
        description: "字段设置中还有未保存修改，离开后这些本地修改不会保留。",
        impactSummary: ["已保存的线上配置不受影响", "取消后可回到字段设置继续保存"],
        confirmLabel: "放弃并返回",
        cancelLabel: "继续编辑",
        tone: "destructive",
      });
      if (!confirmed) return;
    }
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => void handleBack()}
            className="inline-flex h-9 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            返回
          </button>
          <div className="flex items-center gap-2 font-display font-semibold">
            <Settings className="size-4" aria-hidden />
            表设置
          </div>
        </div>
      </header>
      <main className="mx-auto grid w-full min-w-0 max-w-7xl grid-cols-[minmax(0,1fr)] gap-5 overflow-hidden px-4 py-6 sm:px-6">
        {schemaQuery.isLoading ? (
          <LoadingState minH="min-h-72" label="加载表配置" />
        ) : schemaQuery.isError ? (
          <ErrorState
            title="加载表配置失败"
            error={schemaQuery.error}
            onRetry={() => schemaQuery.refetch()}
            minH="min-h-72"
          />
        ) : !schema ? (
          <EmptyState title="表不存在或无权限" minH="min-h-72" />
        ) : (
          <>
            <section className="nd-interactive-surface flex flex-col gap-3 border border-border bg-card p-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 truncate font-display text-3xl font-semibold tracking-tight">
                    {schema.name}
                  </h1>
                  {schema.role && <PermissionTag role={schema.role} />}
                  <PermissionTag visibility={schema.visibility} />
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{schema.schema_code}</span>
                  <span>v{schema.current_version}</span>
                  <span>{visibleFieldCount} 字段</span>
                  <span>owner {schema.owner.username}</span>
                </div>
              </div>
            </section>
            {!canChangeSchema && <ReadOnlyNotice role={schema.role} />}
            <BasicSettingsPanel schema={schema} readOnly={!canChangeSchema} />
            <IdentityDisplayTemplatePanel
              key={`identity-display-${schema.id}-${schema.current_version}`}
              schema={schema}
              readOnly={!canChangeSchema}
            />
            <LabelPrintTemplatePanel
              key={`label-print-${schema.id}-${schema.current_version}`}
              schema={schema}
              readOnly={!canChangeSchema}
            />
            <FieldOrderPanel
              key={`field-order-${schema.id}-${schema.current_version}`}
              schema={schema}
              readOnly={!canChangeSchema}
              disabled={fieldsDirty}
            />
            <FieldsSettingsPanel
              schema={schema}
              readOnly={!canChangeSchema}
              onDirtyChange={setFieldsDirty}
            />
            <SchemaVersionHistoryPanel key={schema.id} schema={schema} />
            {canChangeSchema ? (
              <>
                <CollaboratorsPanel schema={schema} />
                <DangerZonePanel schema={schema} users={usersQuery.data ?? []} />
              </>
            ) : (
              <ReadOnlyManagementPanel />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ReadOnlyNotice({ role }: { role: string | null }) {
  return (
    <section className="border border-border bg-muted/40 px-4 py-3 text-sm">
      <div className="font-medium">当前设置页为只读</div>
      <p className="mt-1 text-xs text-muted-foreground">
        你的角色是 {role ?? "无权限"}，可以查看表配置，但不能修改字段、协作者或高级操作。
      </p>
    </section>
  );
}

function ReadOnlyManagementPanel() {
  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <h2 className="font-display text-lg font-semibold">协作者与高级操作</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        这些操作仅 owner 或系统管理员可用。当前角色下不展示可点击的危险操作。
      </p>
    </section>
  );
}
