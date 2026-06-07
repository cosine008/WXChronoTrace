import { DataMetric, MetricGrid } from "@/components/badges";

import type { StatsFlow } from "./flowBoardTypes";

export function FlowBoardSummary({ flow }: { flow: StatsFlow }) {
  const topFlow = flow.summary.top_flow;

  return (
    <section className="border-b border-border px-4 py-4">
      <MetricGrid columns={4}>
        <DataMetric
          label="实体总数"
          value={String(flow.summary.entity_count)}
          hint={`${flow.summary.left_count} -> ${flow.summary.right_count}`}
          tone="info"
          emphasis
        />
        <DataMetric
          label="变更实体"
          value={String(flow.summary.changed_entity_count)}
          hint={`稳定 ${flow.summary.unchanged_count} / 进入 ${flow.summary.entered_count} / 退出 ${flow.summary.exited_count}`}
          tone="warning"
        />
        <DataMetric
          label="流向数"
          value={String(flow.summary.flow_count)}
          hint={`${flow.links.length} 条链路`}
          tone="neutral"
        />
        <DataMetric
          label="主流向"
          value={topFlow ? String(topFlow.value) : "--"}
          hint={topFlow ? `${topFlow.from} -> ${topFlow.to}` : "当前范围没有主流向"}
          tone={topFlow ? "info" : "neutral"}
          title={topFlow ? `${topFlow.from} -> ${topFlow.to}` : "当前范围没有主流向"}
        />
      </MetricGrid>
    </section>
  );
}
