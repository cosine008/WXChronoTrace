import type { StatsFlow } from "@/api/stats";
import type { ChartTheme } from "@/hooks/useChartTheme";

export function flowSankeyOption(flow: StatsFlow, theme: ChartTheme) {
  return {
    textStyle: { color: theme.foreground },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (params: {
        dataType?: "node" | "edge";
        data?: {
          from?: string;
          to?: string;
          value?: number;
          count?: number;
          name?: string;
          rawValue?: StatsFlow["nodes"][number]["value"];
        };
      }) => {
        if (params.dataType === "edge") {
          const from = escapeHtml(params.data?.from ?? "-");
          const to = escapeHtml(params.data?.to ?? "-");
          const value = params.data?.value ?? 0;
          return `${from} -> ${to}<br/>value: ${value}`;
        }
        const name = escapeHtml(params.data?.name ?? "-");
        const count = params.data?.count ?? params.data?.value ?? 0;
        return `${name}<br/>count: ${count}`;
      },
    },
    series: [
      {
        type: "sankey",
        emphasis: { focus: "adjacency" as const },
        lineStyle: { curveness: 0.5, opacity: 0.65 },
        label: { color: theme.foreground },
        itemStyle: {
          borderColor: theme.border,
          borderWidth: 1,
          color: theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
        },
        data: flow.nodes.map((node) => ({
          ...node,
          name: node.name,
          value: node.count,
          count: node.count,
          rawValue: node.value,
        })),
        links: flow.links.map((link) => ({
          ...link,
          lineStyle: {
            color: link.changed ? theme.accent : theme.border,
            opacity: link.changed ? 0.9 : 0.45,
          },
        })),
      },
    ],
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
