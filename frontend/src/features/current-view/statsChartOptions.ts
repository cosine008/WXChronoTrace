import type { StatsTrend, TrendUnit, TrendUnitParam } from "@/api/stats";
import type { ChartTheme } from "@/hooks/useChartTheme";

export function trendRange(unit: TrendUnit) {
  if (unit === "day") return 14;
  if (unit === "week") return 12;
  return 12;
}

export function trendTitle(trend: StatsTrend) {
  return `近 ${trend.range} ${trendUnitName(trend.unit)}记录趋势`;
}

export function trendNotice(trend: StatsTrend, selectedUnit: TrendUnitParam) {
  const empty = trend.points.length === 0 || trend.points.every((point) => point.count === 0);
  if (empty) {
    return selectedUnit === "month"
      ? "当前月度窗口暂无记录，可切换自动或按日查看。"
      : "当前时间窗口暂无可统计记录。";
  }
  if (selectedUnit === "auto" && trend.unit === "day") return "当前数据周期较短，已按日展示。";
  if (selectedUnit === "auto" && trend.unit === "week") {
    return "当前数据覆盖不足 3 个月，已按周展示。";
  }
  return null;
}

export function trendOption(trend: StatsTrend, theme: ChartTheme) {
  return {
    grid: { left: 36, right: 12, top: 18, bottom: 28 },
    textStyle: { color: theme.foreground },
    color: [theme.accent],
    xAxis: {
      type: "category",
      data: trend.points.map((point) => formatTrendLabel(point.at, trend.unit)),
      ...axis(theme),
    },
    yAxis: { type: "value", minInterval: 1, ...axis(theme) },
    series: [
      {
        type: "line",
        data: trend.points.map((point) => point.count),
        symbolSize: 6,
        lineStyle: { color: theme.accent },
        itemStyle: { color: theme.accent },
      },
    ],
  };
}

export function distributionOption(
  buckets: Array<{ value: string | number | boolean; count: number }>,
  theme: ChartTheme
) {
  return {
    grid: { left: 84, right: 12, top: 18, bottom: 24 },
    textStyle: { color: theme.foreground },
    color: [theme.accent],
    xAxis: { type: "value", minInterval: 1, ...axis(theme) },
    yAxis: {
      type: "category",
      data: buckets.map((bucket) => String(bucket.value)),
      ...axis(theme),
    },
    series: [
      {
        type: "bar",
        data: buckets.map((bucket) => bucket.count),
        barMaxWidth: 18,
        itemStyle: { color: theme.accent },
      },
    ],
  };
}

function axis(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { lineStyle: { color: theme.border } },
    axisLabel: { color: theme.muted },
    splitLine: { lineStyle: { color: theme.border, type: "dashed" as const } },
  };
}

function formatTrendLabel(value: string, unit: TrendUnit) {
  if (unit === "month") return value.slice(0, 7);
  return value.slice(5);
}

function trendUnitName(unit: TrendUnit) {
  if (unit === "day") return "天";
  if (unit === "week") return "周";
  return "月";
}
