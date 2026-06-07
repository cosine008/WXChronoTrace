import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  compareSchemaChangesets,
  getChangeSetFieldDiffs,
  getSchema,
  getSnapshotDiff,
  type ChangeAction,
  type ChangeSetCompareResponse,
  type ChangeSetFieldDiffResponse,
  type ChangeSetSummary,
  type DiffMode,
  type SnapshotDiffResponse,
} from "@/api/schemas";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";

import { DiffStudioShell } from "./DiffStudioShell";

const FIELD_DIFFS_PAGE_SIZE = 80;
const DIFF_ACTIONS: ChangeAction[] = ["create", "update", "terminate"];

export function DiffStudioPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const finiteRouteSchemaId = parseFiniteNumber(id ?? null);
  const schemaId = parsePositiveInt(id ?? null);
  const mode: DiffMode = searchParams.get("mode") === "snapshot" ? "snapshot" : "changeset";
  const left = parsePositiveInt(searchParams.get("left"));
  const right = parsePositiveInt(searchParams.get("right"));
  const leftAt = searchParams.get("left_at") || "";
  const rightAt = searchParams.get("right_at") || "";
  const search = searchParams.get("search") || "";
  const ordering = searchParams.get("ordering") || "business_code";
  const retro = searchParams.get("retro") === "true";
  const page = parsePositiveInt(searchParams.get("page")) ?? 1;
  const hasValidChangesetParams =
    schemaId !== null && mode === "changeset" && left !== null && right !== null;
  const hasValidSnapshotParams =
    schemaId !== null && mode === "snapshot" && Boolean(leftAt && rightAt);
  const isValidParams = hasValidChangesetParams || hasValidSnapshotParams;
  const invalidBackTo =
    finiteRouteSchemaId !== null ? `/schemas/${finiteRouteSchemaId}/records` : "/";

  const schemaQuery = useQuery({
    queryKey: ["schema", schemaId],
    queryFn: () => getSchema(schemaId!),
    enabled: isValidParams,
  });
  const compareQuery = useQuery({
    queryKey: ["schema-changeset-compare", schemaId, left, right],
    queryFn: () => compareSchemaChangesets(schemaId!, left!, right!),
    enabled: hasValidChangesetParams,
  });
  const fieldDiffQuery = useQuery({
    queryKey: ["schema-changeset-field-diffs", schemaId, left, right, page, FIELD_DIFFS_PAGE_SIZE],
    queryFn: () =>
      getChangeSetFieldDiffs(schemaId!, {
        left: left!,
        right: right!,
        page,
        page_size: FIELD_DIFFS_PAGE_SIZE,
      }),
    enabled: hasValidChangesetParams,
  });
  const snapshotQuery = useQuery({
    queryKey: ["schema-snapshot-diff", schemaId, leftAt, rightAt, retro, search, ordering, page],
    queryFn: () =>
      getSnapshotDiff(schemaId!, {
        left_at: leftAt,
        right_at: rightAt,
        retro,
        search,
        ordering,
        page,
        page_size: FIELD_DIFFS_PAGE_SIZE,
        mode: "fields",
      }),
    enabled: Number.isFinite(schemaId) && mode === "snapshot" && Boolean(leftAt && rightAt),
  });

  const activeFieldDiffs = useMemo(() => {
    if (mode === "snapshot") {
      if (schemaId === null || !snapshotQuery.data) return null;
      return snapshotRowsToFieldRows(schemaId, snapshotQuery.data);
    }
    return fieldDiffQuery.data ?? null;
  }, [fieldDiffQuery.data, mode, schemaId, snapshotQuery.data]);

  const activeCompare = useMemo(() => {
    if (mode === "snapshot") {
      if (!snapshotQuery.data || !activeFieldDiffs) return null;
      return snapshotCompareAsChangeSet(snapshotQuery.data, activeFieldDiffs);
    }
    return compareQuery.data ?? null;
  }, [activeFieldDiffs, compareQuery.data, mode, snapshotQuery.data]);

  const totalPages = activeFieldDiffs ? Math.max(activeFieldDiffs.total_pages, 1) : null;
  const normalizedPage = totalPages === null ? page : Math.min(page, totalPages);

  useEffect(() => {
    if (!isValidParams || totalPages === null || page === normalizedPage) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("page", String(normalizedPage));
    setSearchParams(next, { replace: true });
  }, [isValidParams, normalizedPage, page, searchParams, setSearchParams, totalPages]);

  const handleRetry = () => {
    const tasks: Array<Promise<unknown>> = [schemaQuery.refetch()];
    if (mode === "snapshot") {
      tasks.push(snapshotQuery.refetch());
    } else {
      tasks.push(compareQuery.refetch(), fieldDiffQuery.refetch());
    }
    void Promise.all(tasks);
  };

  if (!isValidParams) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
          <EmptyState
            title="Diff Studio 参数无效"
            description="请检查参数：ChangeSet 模式需要 mode=changeset、left、right；Snapshot 模式需要 mode=snapshot、left_at、right_at。"
            minH="min-h-72"
            action={
              <Link
                to={invalidBackTo}
                className="inline-flex h-9 items-center border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                返回记录视图
              </Link>
            }
          />
        </main>
      </div>
    );
  }

  const isLoading =
    schemaQuery.isLoading ||
    (mode === "snapshot" ? snapshotQuery.isLoading : compareQuery.isLoading || fieldDiffQuery.isLoading);

  if (isLoading) {
    return <LoadingState fullScreen label="加载 Diff Studio" />;
  }

  const error =
    schemaQuery.error ??
    (mode === "snapshot"
      ? snapshotQuery.error
      : compareQuery.error ?? fieldDiffQuery.error);
  if (error || !schemaQuery.data || !activeCompare || !activeFieldDiffs) {
    return (
      <ErrorState
        fullScreen
        title="Diff Studio 加载失败"
        error={error}
        onRetry={handleRetry}
      />
    );
  }

  if (page !== normalizedPage) {
    return <LoadingState fullScreen label="加载 Diff Studio" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <DiffStudioShell
          schema={schemaQuery.data}
          compare={activeCompare}
          fieldDiffs={activeFieldDiffs}
          mode={mode}
          page={normalizedPage}
          modeLabel={mode === "snapshot" ? "Snapshot Diff" : "ChangeSet Diff"}
          snapshotContext={
            mode === "snapshot" && snapshotQuery.data
              ? {
                  results: snapshotQuery.data.results,
                  scope: snapshotQuery.data.scope,
                }
              : null
          }
          onPage={(nextPage) => {
            const next = new URLSearchParams(searchParams);
            next.set("page", String(nextPage));
            setSearchParams(next);
          }}
        />
      </main>
    </div>
  );
}

function snapshotRowsToFieldRows(
  schemaId: number,
  snapshot: SnapshotDiffResponse
): ChangeSetFieldDiffResponse {
  return {
    diff_mode: "changeset",
    left: snapshotSummaryAsChangeSet(schemaId, "left", snapshot.scope.left_at),
    right: snapshotSummaryAsChangeSet(schemaId, "right", snapshot.scope.right_at),
    summary: snapshot.summary,
    count: snapshot.count,
    page: snapshot.page,
    page_size: snapshot.page_size,
    total_pages: snapshot.total_pages,
    results: snapshot.results.map((row) => ({
      id: row.id,
      side: row.left_record_id === null ? "right" : "left",
      entity: row.entity,
      field: row.field,
      before: row.before,
      after: row.after,
      action: row.action,
      entry_id: 0,
      change_set_id: 0,
      recorded_at: row.recorded_at ?? "",
      valid_from: null,
    })),
  };
}

function snapshotSummaryAsChangeSet(
  schemaId: number,
  label: "left" | "right",
  date: string
): ChangeSetSummary {
  return {
    id: label === "left" ? -1 : -2,
    schema_id: schemaId,
    summary: `Snapshot ${label} ${date}`,
    status: "applied",
    source: "api",
    approval_required: false,
    approver_id: null,
    approver_username: null,
    created_at: date,
    created_by_id: 0,
    created_by_username: "snapshot",
    applied_at: date,
    revert_of_id: null,
    entry_count: 0,
    action_counts: emptyActionCounts(),
  };
}

function snapshotCompareAsChangeSet(
  snapshot: SnapshotDiffResponse,
  fieldDiffs: ChangeSetFieldDiffResponse
): ChangeSetCompareResponse {
  const sharedEntityCount = Math.min(
    snapshot.summary.affected_entity_count,
    snapshot.summary.left_count,
    snapshot.summary.right_count
  );

  return {
    left: fieldDiffs.left,
    right: fieldDiffs.right,
    action_rows: DIFF_ACTIONS.map((action) => {
      const count = snapshot.summary.action_counts[action] ?? 0;
      return {
        action,
        left: 0,
        right: count,
        delta: count,
      };
    }),
    field_rows: snapshot.summary.top_fields.map((field) => ({
      key: field.key,
      label: field.label,
      left_changes: 0,
      right_changes: field.count,
      left_entities: 0,
      right_entities: field.count,
      delta: field.count,
    })),
    entity_overlap: {
      left_entity_count: snapshot.summary.left_count,
      right_entity_count: snapshot.summary.right_count,
      shared_entity_count: sharedEntityCount,
      left_only_entity_count: Math.max(snapshot.summary.left_count - sharedEntityCount, 0),
      right_only_entity_count: Math.max(snapshot.summary.right_count - sharedEntityCount, 0),
    },
  };
}

function emptyActionCounts(): Record<ChangeAction, number> {
  return {
    create: 0,
    update: 0,
    terminate: 0,
  };
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseFiniteNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
