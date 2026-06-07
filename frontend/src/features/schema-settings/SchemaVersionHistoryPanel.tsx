import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Layers3 } from "lucide-react";

import type { DataSchema, FieldConfig } from "@/api/schemas";
import { getSchemaVersion, listSchemaVersions } from "@/api/schemaGovernance";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { cn } from "@/lib/utils";

export function SchemaVersionHistoryPanel({ schema }: { schema: DataSchema }) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const versionsQuery = useQuery({
    queryKey: ["schema-versions", schema.id],
    queryFn: () => listSchemaVersions(schema.id),
  });
  const versions = versionsQuery.data?.results ?? [];
  const activeVersion = selectedVersion ?? versions[0]?.version ?? null;
  const detailQuery = useQuery({
    queryKey: ["schema-version", schema.id, activeVersion],
    queryFn: () => getSchemaVersion(schema.id, activeVersion!),
    enabled: activeVersion !== null,
  });

  return (
    <section className="nd-interactive-surface border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">版本历史</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            查看字段配置快照，用于审计结构性变化。
          </p>
        </div>
        <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <History className="size-4" aria-hidden />
          {versionsQuery.data?.count ?? 0} versions
        </span>
      </div>
      {versionsQuery.isLoading ? (
        <LoadingState minH="min-h-44" label="加载版本历史" />
      ) : versionsQuery.isError ? (
        <ErrorState
          title="版本历史加载失败"
          error={versionsQuery.error}
          onRetry={() => versionsQuery.refetch()}
          minH="min-h-44"
        />
      ) : versions.length === 0 ? (
        <EmptyState title="暂无版本快照" minH="min-h-44" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <VersionList
            versions={versions}
            selectedVersion={activeVersion}
            onSelect={setSelectedVersion}
          />
          <VersionDetail
            loading={detailQuery.isLoading}
            error={detailQuery.isError ? detailQuery.error : null}
            fields={detailQuery.data?.fields_config ?? []}
            version={activeVersion}
            onRetry={() => detailQuery.refetch()}
          />
        </div>
      )}
    </section>
  );
}

function VersionList(props: {
  versions: NonNullable<Awaited<ReturnType<typeof listSchemaVersions>>["results"]>;
  selectedVersion: number | null;
  onSelect: (version: number) => void;
}) {
  return (
    <div className="nd-interactive-surface divide-y divide-border border border-border">
      {props.versions.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => props.onSelect(item.version)}
          className={cn(
            "nd-interactive-row grid w-full gap-1 px-3 py-3 text-left text-sm",
            props.selectedVersion === item.version && "nd-active-row bg-accent"
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium">v{item.version}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {item.field_count} fields
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {item.changelog || "No changelog"}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {item.created_by.username} / {formatDateTime(item.created_at)}
          </span>
        </button>
      ))}
    </div>
  );
}

function VersionDetail(props: {
  loading: boolean;
  error: unknown;
  fields: FieldConfig[];
  version: number | null;
  onRetry: () => void;
}) {
  if (props.loading) return <LoadingState minH="min-h-44" label="加载版本快照" />;
  if (props.error) {
    return (
      <ErrorState
        title="版本快照加载失败"
        error={props.error}
        onRetry={props.onRetry}
        minH="min-h-44"
      />
    );
  }
  return (
    <div className="nd-interactive-surface border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Layers3 className="size-4" aria-hidden />
          {props.version ? `v${props.version} 字段快照` : "字段快照"}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {props.fields.length} fields
        </span>
      </div>
      <div className="divide-y divide-border">
        {props.fields.map((field, index) => (
          <div
            key={`${field.key}-${index}`}
            className="nd-interactive-row grid grid-cols-[40px_minmax(0,1fr)_120px] gap-3 px-3 py-2 text-sm"
          >
            <span className="font-mono text-xs text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{field.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{field.key}</span>
            </span>
            <span className="text-xs text-muted-foreground">{field.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
