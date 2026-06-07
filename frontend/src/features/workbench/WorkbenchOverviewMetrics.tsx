import type { DashboardSummary } from "@/api/stats";
import { DataMetric, MetricStrip } from "@/components/badges";

export function WorkbenchOverviewMetrics(props: {
  metrics?: {
    data_card_count: number;
    note_count: number;
    material_count: number;
    storage_used_bytes: number;
  };
  dashboardSummary?: DashboardSummary;
}) {
  const items = [
    { label: "资料卡", value: metricValue(props.metrics?.data_card_count), hint: "常用信息" },
    { label: "笔记", value: metricValue(props.metrics?.note_count), hint: "过程沉淀" },
    { label: "材料", value: metricValue(props.metrics?.material_count), hint: "附件与上传" },
    { label: "我的表", value: metricValue(props.dashboardSummary?.schema_count), hint: "可见数据表" },
    {
      label: "待审批",
      value: metricValue(props.dashboardSummary?.pending_approval_count),
      hint: `存储 ${formatBytes(props.metrics?.storage_used_bytes ?? 0)}`,
    },
  ];

  return (
    <MetricStrip>
      {items.map((item) => (
        <DataMetric
          key={item.label}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tone={item.label === "待审批" ? "warning" : item.label === "我的表" ? "info" : "neutral"}
          layout="strip"
          density="compact"
          className={item.label === "待审批" ? "col-span-2 sm:col-span-1" : undefined}
        />
      ))}
    </MetricStrip>
  );
}

function metricValue(value: number | undefined) {
  return value === undefined ? "--" : String(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
