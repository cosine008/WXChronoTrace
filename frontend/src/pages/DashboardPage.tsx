import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listSchemas, type DataSchema } from "@/api/schemas";
import { getDashboardSummary } from "@/api/stats";
import { DataMetric, MetricGrid } from "@/components/badges";
import { HeroBanner } from "@/components/brand";
import { EmptyState, ErrorState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import {
  DashboardHeroTools,
  SectionLabel,
} from "@/features/dashboard/DashboardChrome";
import {
  SchemaRow,
  SchemaSummaryStrip,
  Toolbar,
  type SchemaListFilter,
} from "@/features/dashboard/DashboardPageParts";
import {
  defaultSortDesc,
  loadSchemaListPreferences,
  saveSchemaListPreferences,
  type SchemaListPreferences,
  type SchemaListSortField,
  toSchemaOrdering,
} from "@/features/dashboard/schemaListPreferences";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";

export function DashboardPage() {
  const notify = useNotification();
  const [showArchived, setShowArchived] = useState(false);
  const [schemaFilter, setSchemaFilter] = useState<SchemaListFilter>("all");
  const [schemaListPreferences, setSchemaListPreferences] = useState(() =>
    loadSchemaListPreferences()
  );
  const schemaOrdering = toSchemaOrdering(schemaListPreferences);
  const schemasQuery = useQuery({
    queryKey: ["schemas", { includeArchived: showArchived, ordering: schemaOrdering }],
    queryFn: () => listSchemas({ includeArchived: showArchived, ordering: schemaOrdering }),
  });
  const dashboardQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });
  const schemas = schemasQuery.data ?? [];
  const visibleSchemas = filterSchemas(schemas, schemaFilter);
  const summary = dashboardQuery.data;
  const activeFilterCopy = FILTER_COPY[schemaFilter];

  function updateSchemaListPreferences(next: SchemaListPreferences) {
    setSchemaListPreferences(next);
    saveSchemaListPreferences(next);
  }

  function handleSortFieldChange(sortField: SchemaListSortField) {
    updateSchemaListPreferences({
      ...schemaListPreferences,
      sortField,
      sortDesc: defaultSortDesc(sortField),
    });
  }

  function handleSortDirectionToggle() {
    updateSchemaListPreferences({
      ...schemaListPreferences,
      sortDesc: !schemaListPreferences.sortDesc,
    });
  }

  function handleSchemaFilterChange(next: SchemaListFilter) {
    setSchemaFilter(next);
    if (next === "archived") setShowArchived(true);
  }

  function handleShowArchivedChange(next: boolean) {
    setShowArchived(next);
    if (!next && schemaFilter === "archived") setSchemaFilter("all");
  }

  async function handleRefresh() {
    const [schemasResult, dashboardResult] = await Promise.all([
      schemasQuery.refetch(),
      dashboardQuery.refetch(),
    ]);
    const error = schemasResult.error ?? dashboardResult.error;
    if (error) {
      const apiError = extractApiError(error);
      notify.error({
        title: "工作台刷新失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
      return;
    }
    notify.success({
      title: "工作台已刷新",
      message: `已同步 ${schemasResult.data?.length ?? schemas.length} 张表。`,
    });
  }

  return (
    <div className="min-h-screen">
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:gap-6 sm:p-6">
        <HeroBanner
          eyebrow="DASHBOARD / 工作台"
          title="我的表"
          subtitle="Schema workspace"
          action={<DashboardHeroTools />}
        />

        <section className="grid gap-4">
          <SectionLabel index="01" title="近况" subtitle="LIVE METRICS" />
          <MetricGrid columns={3}>
            <DataMetric
              label="待审批"
              value={metricValue(summary?.pending_approval_count)}
              hint="变更批次队列"
              tone="warning"
            />
            <DataMetric
              label="近 30 天变更"
              value={metricValue(summary?.recent_change_count)}
              hint="最近滚动周期"
              tone="info"
            />
            <DataMetric
              label="活跃用户"
              value={metricValue(summary?.active_user_count)}
              hint="过去 30 天"
              tone="success"
              className="sm:col-span-2 md:col-span-1"
            />
          </MetricGrid>
        </section>

        <section className="grid gap-4">
          <SectionLabel index="02" title="表清单" subtitle="DATA SCHEMAS" />
          <SchemaSummaryStrip
            items={[
              {
                key: "all",
                label: "全部可见",
                value: metricValue(summary?.schema_count),
                hint: "当前权限范围",
              },
              {
                key: "managed",
                label: "我管理",
                value: metricValue(summary?.owned_schema_count),
                hint: "拥有或管理员",
              },
              {
                key: "shared",
                label: "共享给我",
                value: metricValue(summary?.shared_schema_count),
                hint: "协作入口",
              },
              {
                key: "public",
                label: "公共",
                value: metricValue(summary?.public_schema_count),
                hint: "全员可见",
              },
              {
                key: "archived",
                label: "归档",
                value: metricValue(summary?.archived_schema_count),
                hint: "默认隐藏",
              },
            ]}
            activeKey={schemaFilter}
            onSelect={handleSchemaFilterChange}
          />

          <div className="nd-interactive-surface border border-border bg-background">
            <Toolbar
              loading={schemasQuery.isFetching || dashboardQuery.isFetching}
              visibleCount={visibleSchemas.length}
              visibleLabel={activeFilterCopy.unit}
              sortField={schemaListPreferences.sortField}
              sortDesc={schemaListPreferences.sortDesc}
              onSortFieldChange={handleSortFieldChange}
              onSortDirectionToggle={handleSortDirectionToggle}
              showArchived={showArchived}
              onShowArchivedChange={handleShowArchivedChange}
              onRefresh={() => void handleRefresh()}
            />
            {schemasQuery.isError ? (
              <ErrorState
                error={schemasQuery.error}
                title="加载失败"
                onRetry={() => schemasQuery.refetch()}
                minH="min-h-56"
              />
            ) : visibleSchemas.length === 0 ? (
              <EmptyState
                title={activeFilterCopy.emptyTitle}
                description={
                  showArchived || schemaFilter !== "all"
                    ? activeFilterCopy.emptyDescription
                    : "点击右上角「新建表」创建第一张数据表。"
                }
                minH="min-h-56"
              />
            ) : (
              <div className="divide-y divide-border">
                {visibleSchemas.map((schema) => (
                  <SchemaRow key={schema.id} schema={schema} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function metricValue(value: number | undefined) {
  return value === undefined ? "..." : String(value);
}

function filterSchemas(schemas: DataSchema[], filter: SchemaListFilter) {
  return schemas.filter((schema) => {
    if (filter === "all") return true;
    if (filter === "managed") return schema.role === "owner" || schema.role === "admin";
    if (filter === "shared") {
      return (
        schema.visibility === "shared" && (schema.role === "editor" || schema.role === "viewer")
      );
    }
    if (filter === "public") return schema.visibility === "public";
    return schema.is_archived;
  });
}

const FILTER_COPY: Record<
  SchemaListFilter,
  { unit: string; emptyTitle: string; emptyDescription: string }
> = {
  all: {
    unit: "表",
    emptyTitle: "暂无数据表",
    emptyDescription: "当前账号没有可见的活跃表或归档表。",
  },
  managed: {
    unit: "我管理的表",
    emptyTitle: "没有你管理的表",
    emptyDescription: "当前账号没有拥有或管理员权限的数据表。",
  },
  shared: {
    unit: "共享表",
    emptyTitle: "没有共享给你的表",
    emptyDescription: "其他成员共享的数据表会出现在这里。",
  },
  public: {
    unit: "公共表",
    emptyTitle: "没有公共表",
    emptyDescription: "设置为公共可见的数据表会出现在这里。",
  },
  archived: {
    unit: "归档表",
    emptyTitle: "没有归档表",
    emptyDescription: "归档后的数据表会保留在这里，默认不进入活跃清单。",
  },
};
