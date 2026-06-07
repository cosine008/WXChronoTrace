import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { getSchema } from "@/api/schemas";
import { getStatsFlow, type StatsFlowParams } from "@/api/stats";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import {
  STATS_QUERY_CACHE_OPTIONS,
  statsQueryKeys,
} from "@/features/current-view/currentViewStatsCache";
import { todayInputValue } from "@/features/current-view/currentViewUtils";
import { useAuthStore } from "@/stores/auth";

import { FlowBoardShell } from "./FlowBoardShell";
import { appendReturnTo, buildFlowBoardPath, safeReturnTo } from "./flowBoardQuery";
import {
  availableFlowDimensions,
  defaultFlowDates,
  parseFlowDimension,
} from "./flowBoardTransforms";

const TRUE_QUERY_VALUES = new Set(["1", "true", "yes", "on"]);
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function FlowBoardPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.user);

  const schemaId = parsePositiveInt(id ?? null);
  const rawReturnTo = searchParams.get("return_to");
  const rawLeftAt = searchParams.get("left_at");
  const rawRightAt = searchParams.get("right_at");
  const rawLeftAtValid = isOptionalDateInputValue(rawLeftAt);
  const rawRightAtValid = isOptionalDateInputValue(rawRightAt);
  const dates = rawLeftAtValid && rawRightAtValid
    ? defaultFlowDates(rawLeftAt, rawRightAt)
    : { left_at: rawLeftAt ?? "", right_at: rawRightAt ?? "" };
  const leftAt = dates.left_at;
  const rightAt = dates.right_at;
  const requestedDimension = parseFlowDimension(searchParams.get("dimension"));
  const retro = parseBooleanQueryValue(searchParams.get("retro"));
  const search = searchParams.get("search") ?? "";
  const ordering = searchParams.get("ordering") || "business_code";
  const datesAreValid =
    rawLeftAtValid &&
    rawRightAtValid &&
    isDateInputValue(leftAt) &&
    isDateInputValue(rightAt);
  const dateRangeValid = datesAreValid && rightAt >= leftAt;
  const schemaQuery = useQuery({
    queryKey: ["schema", schemaId],
    queryFn: () => getSchema(schemaId!),
    enabled: schemaId !== null,
  });
  const availableDimensions = useMemo(
    () =>
      schemaQuery.data
        ? availableFlowDimensions(schemaQuery.data.fields_config, schemaQuery.data.role)
        : [],
    [schemaQuery.data]
  );
  const effectiveDimension =
    requestedDimension && availableDimensions.includes(requestedDimension)
      ? requestedDimension
      : availableDimensions[0] ?? null;
  const flowParams = useMemo<StatsFlowParams>(
    () => ({
      left_at: leftAt,
      right_at: rightAt,
      dimension: effectiveDimension ?? undefined,
      retro,
      search,
      ordering,
    }),
    [leftAt, rightAt, effectiveDimension, ordering, retro, search]
  );
  const schemaVersion = schemaQuery.data?.current_version ?? 0;
  const flowQuery = useQuery({
    queryKey: statsQueryKeys.flow(schemaId ?? 0, currentUser?.id, schemaVersion, flowParams),
    queryFn: () => getStatsFlow(schemaId!, { ...flowParams, dimension: effectiveDimension! }),
    enabled:
      schemaId !== null && dateRangeValid && schemaQuery.isSuccess && effectiveDimension !== null,
    ...STATS_QUERY_CACHE_OPTIONS,
  });

  const handleRetry = () => {
    void Promise.all([schemaQuery.refetch(), flowQuery.refetch()]);
  };

  if (schemaId === null) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
          <EmptyState
            title="Flow Board 参数无效"
            description="需要有效的 schema id 才能打开 Flow Board。"
            minH="min-h-72"
            action={
              <Link
                to="/"
                className="inline-flex h-9 items-center border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                返回工作台
              </Link>
            }
          />
        </main>
      </div>
    );
  }

  if (!datesAreValid || !dateRangeValid) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
          <EmptyState
            title="Flow Board 日期参数无效"
            description={
              datesAreValid
                ? "right_at 必须晚于或等于 left_at。"
                : "left_at 和 right_at 必须使用 YYYY-MM-DD 日期格式。"
            }
            minH="min-h-72"
            action={
              <Link
                to="/"
                className="inline-flex h-9 items-center border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                返回工作台
              </Link>
            }
          />
        </main>
      </div>
    );
  }

  if (schemaQuery.isLoading) {
    return <LoadingState fullScreen label="加载 Flow Board" />;
  }

  if (schemaQuery.error || !schemaQuery.data) {
    return (
      <ErrorState
        fullScreen
        title="Flow Board 加载失败"
        error={schemaQuery.error}
        onRetry={handleRetry}
      />
    );
  }

  if (!effectiveDimension) {
    const currentViewTo = safeReturnTo(rawReturnTo, buildRecordsPath(schemaId, flowParams));
    return (
      <EmptyState
        fullScreen
        title="当前表没有可用于 Flow Board 的维度"
        description="需要状态 enum、部门 enum 或标签 multi-enum 字段后才能生成流向看板。"
        action={
          <Link
            to={currentViewTo}
            className="inline-flex h-9 items-center border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            返回 Current View
          </Link>
        }
      />
    );
  }

  if (flowQuery.isLoading) {
    return <LoadingState fullScreen label="加载 Flow Board" />;
  }

  if (flowQuery.error) {
    return (
      <ErrorState
        fullScreen
        title="Flow Board 加载失败"
        error={flowQuery.error}
        onRetry={handleRetry}
      />
    );
  }

  if (!flowQuery.data) {
    return (
      <EmptyState
        fullScreen
        title="Flow Board 暂无数据"
        description="当前查询还没有返回可展示的流向结果。"
      />
    );
  }

  const flow = flowQuery.data;
  const currentViewTo = safeReturnTo(rawReturnTo, buildRecordsPath(schemaId, flow.scope));
  const currentFlowPath = appendReturnTo(
    buildFlowBoardPath(schemaId, {
      ...flow.scope,
      dimension: flow.dimension.kind,
    }),
    currentViewTo
  );
  const snapshotDiffTo = flow.snapshot_diff_to
    ? appendReturnTo(flow.snapshot_diff_to, currentFlowPath)
    : null;

  const updateRoute = (patch: Partial<StatsFlowParams>) => {
    const nextParams: StatsFlowParams = {
      ...flowParams,
      ...patch,
    };
    const nextReturnTo = safeReturnTo(rawReturnTo, buildRecordsPath(schemaId, nextParams));
    const target = appendReturnTo(buildFlowBoardPath(schemaId, nextParams), nextReturnTo);
    const [, query = ""] = target.split("?");
    setSearchParams(new URLSearchParams(query), { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid w-full min-w-0 max-w-[1600px] px-4 py-6 sm:px-6">
        <FlowBoardShell
          schema={schemaQuery.data}
          flow={flow}
          availableDimensions={availableDimensions}
          currentViewTo={currentViewTo}
          snapshotDiffTo={snapshotDiffTo}
          currentFlowPath={currentFlowPath}
          onDimension={(next) => updateRoute({ dimension: next })}
          onDates={(leftAt, rightAt) => updateRoute({ left_at: leftAt, right_at: rightAt })}
        />
      </main>
    </div>
  );
}

function buildRecordsPath(
  schemaId: number,
  params: Pick<StatsFlowParams, "right_at" | "retro" | "search" | "ordering">
) {
  const query = new URLSearchParams({
    at: params.right_at || todayInputValue(),
    retro: String(Boolean(params.retro)),
    search: params.search ?? "",
    ordering: params.ordering || "business_code",
  });
  return `/schemas/${schemaId}/records?${query.toString()}`;
}

function parseBooleanQueryValue(value: string | null) {
  return value !== null && TRUE_QUERY_VALUES.has(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isDateInputValue(value: string) {
  if (!DATE_INPUT_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day
  );
}

function isOptionalDateInputValue(value: string | null) {
  return value === null || value.trim() === "" || isDateInputValue(value.trim());
}
