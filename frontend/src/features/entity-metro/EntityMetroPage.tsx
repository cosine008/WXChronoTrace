import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { getEntityTimeline } from "@/api/schemas";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";

import { EntityMetroShell } from "./EntityMetroShell";
import type { EntityMetroContext } from "./entityMetroTypes";

const DIFF_STUDIO_QUERY_KEYS = [
  "mode",
  "left",
  "right",
  "left_at",
  "right_at",
  "page",
  "search",
  "ordering",
  "retro",
] as const;

export function EntityMetroPage() {
  const { id, entityId: entityIdParam } = useParams();
  const [searchParams] = useSearchParams();

  const schemaId = parsePositiveInt(id ?? null);
  const entityId = parsePositiveInt(entityIdParam ?? null);
  const fieldKey = nonEmptyText(searchParams.get("field"));
  const highlightedRecordId = parsePositiveInt(searchParams.get("record_id"));
  const modeLabel = searchParams.get("mode") === "snapshot" ? "Snapshot Diff" : "ChangeSet Diff";
  const returnTo = normalizeReturnTo(searchParams.get("return_to"));
  const fallbackBackTo = returnTo ?? buildDiffStudioBackTo(schemaId, searchParams);
  const backLabel = returnTo ? "返回原页面" : "返回 Diff Studio";
  const context = useMemo(
    () => buildDiffStudioMetroContext(fieldKey, highlightedRecordId),
    [fieldKey, highlightedRecordId]
  );

  const timelineQuery = useQuery({
    queryKey: ["entity-timeline", entityId],
    queryFn: () => getEntityTimeline(entityId!),
    enabled: entityId !== null,
  });

  if (schemaId === null || entityId === null) {
    return (
      <EmptyState
        fullScreen
        title="实体 Metro 参数无效"
        description="需要有效的 schema id 与 entity id 才能打开全屏 Entity Metro。"
        action={
          <Link
            to={fallbackBackTo}
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
        }
      />
    );
  }

  if (timelineQuery.isLoading) {
    return <LoadingState fullScreen label="加载实体 Metro" />;
  }

  if (timelineQuery.isError || !timelineQuery.data) {
    return (
      <ErrorState
        fullScreen
        title="实体 Metro 加载失败"
        error={timelineQuery.error}
        onRetry={() => timelineQuery.refetch()}
      />
    );
  }

  const timeline = timelineQuery.data;
  if (timeline.entity.schema_id !== schemaId) {
    return (
      <EmptyState
        fullScreen
        title="实体 Metro 路由不匹配"
        description="当前实体不属于 URL 中的 schema，请返回 Diff Studio 或记录视图重新打开。"
        action={
          <Link
            to={fallbackBackTo}
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div className="grid gap-2">
            <div className="inline-flex w-fit items-center gap-2 border border-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Entity Metro
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">
                {timeline.entity.display_code || `实体 #${timeline.entity.id}`}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="border border-border px-2 py-1">{modeLabel}</span>
                <span className="font-mono">schema #{timeline.entity.schema_id}</span>
                <span className="font-mono">entity #{timeline.entity.id}</span>
                {fieldKey ? <span className="font-mono">field {fieldKey}</span> : null}
                {highlightedRecordId !== null ? (
                  <span className="font-mono">record #{highlightedRecordId}</span>
                ) : null}
              </div>
            </div>
          </div>

          <Link
            to={fallbackBackTo}
            className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
        </header>

        <EntityMetroShell timeline={timeline} variant="fullscreen" context={context} />
      </main>
    </div>
  );
}

function buildDiffStudioMetroContext(
  fieldKey: string | null,
  highlightedRecordId: number | null
): EntityMetroContext {
  return {
    source: "diff-studio",
    ...(fieldKey ? { highlightedFieldKeys: [fieldKey] } : {}),
    ...(highlightedRecordId !== null ? { highlightedRecordId } : {}),
  };
}

function buildDiffStudioBackTo(schemaId: number | null, searchParams: URLSearchParams) {
  if (schemaId === null) {
    return "/";
  }
  const params = new URLSearchParams();
  DIFF_STUDIO_QUERY_KEYS.forEach((key) => {
    const value = searchParams.get(key);
    if (value) {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `/schemas/${schemaId}/diff-studio?${query}` : `/schemas/${schemaId}/diff-studio`;
}

function normalizeReturnTo(value: string | null) {
  const normalized = value?.trim();
  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }
  return normalized;
}

function nonEmptyText(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
