import { useMemo } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ExternalLink } from "lucide-react";

import { downloadEntityExport } from "@/api/stats";
import { getEntityTimeline } from "@/api/schemas";
import { EntityIdChip, ValidityRange } from "@/components/badges";
import { EmptyState, ErrorState, InlineMessage, LoadingState } from "@/components/feedback";
import { buildDefaultEntityMetroContext } from "@/features/entity-metro/entityMetroContext";
import { buildEntityMetroModel } from "@/features/entity-metro/entityMetroTransforms";
import { saveBlob } from "@/lib/download";
import { IDENTITY_CODE_FIELD_KEY } from "@/lib/schemaFields";
import { recordDisplayCode, stringifyCell } from "./currentViewUtils";

export function EntityInspectorPane(props: {
  entityId: number | null;
  fieldLabels: Record<string, string>;
  onOpenDrawer: (entityId: number) => void;
}) {
  const timelineQuery = useQuery({
    queryKey: ["entity-timeline", props.entityId],
    queryFn: () => getEntityTimeline(props.entityId!),
    enabled: props.entityId !== null,
  });
  const exportMutation = useMutation({
    mutationFn: (id: number) => downloadEntityExport(id),
    onSuccess: (blob, id) => saveBlob(blob, `entity_${id}_lifecycle.xlsx`),
  });
  const timeline = timelineQuery.data;
  const metroContext = useMemo(
    () => (timeline ? buildDefaultEntityMetroContext(timeline, "current-view") : null),
    [timeline]
  );
  const metroModel = useMemo(
    () => (timeline && metroContext ? buildEntityMetroModel(timeline, metroContext) : null),
    [metroContext, timeline]
  );
  const latestRecord = timeline?.records.at(-1) ?? null;
  const recentKeyStations = metroModel ? [...metroModel.keyStations].slice(-3).reverse() : [];

  if (props.entityId === null) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <EmptyState
          title="选择实体"
          description="点击主表实体后在这里查看 Metro 摘要和最近字段快照。"
          minH="min-h-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      {exportMutation.isError && (
        <div className="mb-3 border border-[var(--color-status-error)] px-3 py-2">
          <InlineMessage tone="error" error={exportMutation.error} />
        </div>
      )}
      {timelineQuery.isLoading ? (
        <LoadingState minH="min-h-48" label="加载实体 Metro 摘要" />
      ) : timelineQuery.isError ? (
        <ErrorState
          title="实体 Metro 摘要加载失败"
          error={timelineQuery.error}
          onRetry={() => timelineQuery.refetch()}
          minH="min-h-48"
        />
      ) : !timeline || !metroModel ? (
        <ErrorState title="实体 Metro 摘要加载失败" minH="min-h-48" />
      ) : (
        <div className="grid gap-3">
          <section className="border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <EntityIdChip code={recordDisplayCode(timeline.entity)} />
                <div className="mt-1 text-xs text-muted-foreground">
                  {timeline.records.length} 个版本 · {metroModel.keyStations.length} 个关键站点 ·
                  实体 #{timeline.entity.id}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => props.onOpenDrawer(timeline.entity.id)}
                  className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  打开 Metro
                </button>
                <button
                  type="button"
                  disabled={exportMutation.isPending}
                  onClick={() => exportMutation.mutate(timeline.entity.id)}
                  className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
                >
                  <Download className="size-3.5" aria-hidden />
                  Excel
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-3 border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-foreground">Metro 摘要</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  当前面板保留高密度摘要，完整站点与快照明细在抽屉中查看。
                </p>
              </div>
              <div className="text-right font-mono text-[11px] text-muted-foreground">
                {latestRecord ? `v${latestRecord.schema_version}` : "NO_DATA"}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <MetricTile label="关键站点" value={String(metroModel.keyStations.length)} />
              <MetricTile label="普通版本" value={String(metroModel.minorStations.length)} />
              <MetricTile
                label="当前版本"
                value={latestRecord ? `v${latestRecord.schema_version}` : "—"}
              />
            </div>

            <div className="grid gap-2">
              {recentKeyStations.length > 0 ? (
                recentKeyStations.map((station) => (
                  <article
                    key={station.id}
                    className="grid gap-2 border border-border bg-background px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground">{station.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{station.summary}</div>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        v{station.schemaVersion}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <ValidityRange
                        from={station.record.valid_from}
                        to={station.record.valid_to}
                      />
                      <span>#{station.record.change_set_id}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  当前时间轴没有识别到关键站点，可直接打开完整 Metro 查看全部版本。
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-3 border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground">最近字段快照</h3>
              <div className="font-mono text-[11px] text-muted-foreground">
                {latestRecord ? `record #${latestRecord.record_id}` : "NO_DATA"}
              </div>
            </div>
            {latestRecord ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {Object.entries(latestRecord.data_payload)
                  .filter(([key]) => key !== IDENTITY_CODE_FIELD_KEY)
                  .slice(0, 8)
                  .map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="truncate font-mono text-muted-foreground">
                        {props.fieldLabels[key] ? `${props.fieldLabels[key]} / ${key}` : key}
                      </dt>
                      <dd className="truncate">{stringifyCell(value) || "—"}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <div className="border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                当前实体暂无可展示快照。
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border border-border bg-background px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{props.label}</span>
      <span className="font-mono text-sm text-foreground">{props.value}</span>
    </div>
  );
}
