import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { getEntityTimeline } from "@/api/schemas";
import { downloadEntityExport } from "@/api/stats";
import { EntityIdChip } from "@/components/badges";
import { ErrorState, InlineMessage, LoadingState } from "@/components/feedback";
import { buildDefaultEntityMetroContext } from "@/features/entity-metro/entityMetroContext";
import { EntityMetroShell } from "@/features/entity-metro/EntityMetroShell";
import { LabelHistoryPanel } from "@/features/labels/LabelHistoryPanel";
import { saveBlob } from "@/lib/download";
import { CurrentViewDrawer } from "./CurrentViewDrawer";
import { recordDisplayCode } from "./currentViewUtils";

interface Props {
  entityId: number | null;
  onClose: () => void;
}

export function EntityTimelineDrawer({ entityId, onClose }: Props) {
  const timelineQuery = useQuery({
    queryKey: ["entity-timeline", entityId],
    queryFn: () => getEntityTimeline(entityId!),
    enabled: entityId !== null,
  });
  const exportMutation = useMutation({
    mutationFn: (id: number) => downloadEntityExport(id),
    onSuccess: (blob) => saveBlob(blob, `entity_${entityId}_lifecycle.xlsx`),
  });

  if (entityId === null) return null;
  const timeline = timelineQuery.data;

  return (
    <CurrentViewDrawer
      open
      title="实体 Metro"
      description={timeline ? <EntityIdChip code={recordDisplayCode(timeline.entity)} /> : "加载实体 Metro"}
      actions={
        timeline ? (
          <button
            type="button"
            data-testid="entity-timeline-export"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate(timeline.entity.id)}
            className="inline-flex h-8 items-center gap-2 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
          >
            <Download className="size-4" aria-hidden />
            Excel
          </button>
        ) : null
      }
      size="lg"
      testId="entity-timeline-drawer"
      closeTestId="entity-timeline-drawer-close"
      onRequestClose={onClose}
    >
      {exportMutation.isError && (
        <div className="mb-3 border border-[var(--color-status-error)] px-3 py-2">
          <InlineMessage tone="error" error={exportMutation.error} />
        </div>
      )}
      {timelineQuery.isLoading ? (
        <LoadingState minH="min-h-48" label="加载实体 Metro" />
      ) : timelineQuery.isError ? (
        <ErrorState
          title="实体 Metro 加载失败"
          error={timelineQuery.error}
          onRetry={() => timelineQuery.refetch()}
          minH="min-h-48"
        />
      ) : !timeline ? (
        <ErrorState title="实体 Metro 加载失败" minH="min-h-48" />
      ) : (
        <div className="grid gap-3">
          <LabelHistoryPanel
            entityId={timeline.entity.id}
            canManage={["admin", "owner", "editor"].includes(timeline.schema.role ?? "")}
          />
          <EntityMetroShell
            timeline={timeline}
            variant="drawer"
            context={buildDefaultEntityMetroContext(timeline, "current-view")}
          />
        </div>
      )}
    </CurrentViewDrawer>
  );
}
