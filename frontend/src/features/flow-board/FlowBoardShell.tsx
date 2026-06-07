import { lazy, Suspense, useMemo } from "react";
import { ArrowRight, GitBranch } from "lucide-react";
import { Link } from "react-router-dom";

import type { DataSchema } from "@/api/schemas";
import { EmptyState } from "@/components/feedback";
import { useChartTheme } from "@/hooks/useChartTheme";

import { flowSankeyOption } from "./flowBoardChartOptions";
import { appendReturnTo } from "./flowBoardQuery";
import { FlowBoardHeatRail } from "./FlowBoardHeatRail";
import { FlowBoardSummary } from "./FlowBoardSummary";
import { FlowBoardToolbar } from "./FlowBoardToolbar";
import { flowSnapshotDiffUrl, topChangedLinks } from "./flowBoardTransforms";
import type { StatsFlow } from "./flowBoardTypes";

const EChartCanvas = lazy(() =>
  import("../current-view/EChartCanvas").then((module) => ({ default: module.EChartCanvas }))
);

interface Props {
  schema: DataSchema;
  flow: StatsFlow;
  availableDimensions: Array<StatsFlow["dimension"]["kind"]>;
  currentViewTo: string;
  snapshotDiffTo: string | null;
  currentFlowPath: string;
  onDates: (leftAt: string, rightAt: string) => void;
  onDimension: (next: StatsFlow["dimension"]["kind"]) => void;
}

export function FlowBoardShell(props: Props) {
  const chartTheme = useChartTheme();
  const chartOption = useMemo(
    () => flowSankeyOption(props.flow, chartTheme),
    [chartTheme, props.flow]
  );
  const changedLinks = useMemo(() => topChangedLinks(props.flow.links, 6), [props.flow.links]);

  return (
    <section className="grid min-h-[calc(100vh-112px)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden border border-border bg-background">
      <FlowBoardToolbar
        schema={props.schema}
        leftAt={props.flow.scope.left_at}
        rightAt={props.flow.scope.right_at}
        dimension={props.flow.dimension.kind}
        availableDimensions={props.availableDimensions}
        currentViewTo={props.currentViewTo}
        snapshotDiffTo={props.snapshotDiffTo}
        onDates={props.onDates}
        onDimension={props.onDimension}
      />

      <FlowBoardSummary flow={props.flow} />

      <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-[420px] border-b border-border xl:border-r xl:border-b-0">
          <div className="flex h-full flex-col">
            <div className="border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
              Sankey · {props.flow.dimension.label}
            </div>
            <div className="min-h-0 flex-1">
              {props.flow.links.length === 0 ? (
                <EmptyState
                  title="当前时间范围没有可展示的流向"
                  description="尝试切换维度或扩大日期范围后再查看。"
                  minH="min-h-[360px]"
                  action={
                    props.snapshotDiffTo ? (
                      <Link
                        to={props.snapshotDiffTo}
                        className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                      >
                        <GitBranch className="size-4" aria-hidden />
                        打开 Snapshot Diff
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <Suspense
                  fallback={
                    <div className="grid h-[420px] place-items-center text-sm text-muted-foreground">
                      加载流向图...
                    </div>
                  }
                >
                  <EChartCanvas option={chartOption} height={420} />
                </Suspense>
              )}
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-3 px-4 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <GitBranch className="size-4" aria-hidden />
            Top Changed Links
          </div>

          {changedLinks.length === 0 ? (
            <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              当前范围没有 changed links。
            </div>
          ) : (
            <div className="grid gap-2">
              {changedLinks.map((link) => {
                const rawDiffTo = flowSnapshotDiffUrl(props.flow, link);
                const diffTo = rawDiffTo
                  ? appendReturnTo(rawDiffTo, props.currentFlowPath)
                  : props.snapshotDiffTo;
                const itemKey = `${link.source}-${link.target}`;
                const content = (
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{link.from}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{link.to}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{link.value}</span>
                        <span>{link.sample_entity_ids.length} sample ids</span>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm text-foreground">{link.value}</span>
                  </div>
                );

                if (!diffTo) {
                  return (
                    <div key={itemKey} className="border border-border px-3 py-3">
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={itemKey}
                    to={diffTo}
                    className="border border-border px-3 py-3 transition-colors hover:border-foreground"
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          )}

          {props.snapshotDiffTo ? (
            <Link
              to={props.snapshotDiffTo}
              className="inline-flex h-9 items-center justify-between gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              打开完整 Snapshot Diff
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </aside>
      </div>

      <FlowBoardHeatRail
        heat={props.flow.heat}
        leftAt={props.flow.scope.left_at}
        rightAt={props.flow.scope.right_at}
      />
    </section>
  );
}
