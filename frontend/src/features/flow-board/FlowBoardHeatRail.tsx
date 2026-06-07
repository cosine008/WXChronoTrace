import { heatIntensity } from "./flowBoardTransforms";
import type { StatsFlowHeatPoint } from "./flowBoardTypes";

interface Props {
  heat: StatsFlowHeatPoint[];
  leftAt: string;
  rightAt: string;
}

export function FlowBoardHeatRail({ heat, leftAt, rightAt }: Props) {
  if (heat.length === 0) {
    return (
      <footer className="grid gap-2 border-t border-border px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground">Heat Rail</div>
        <div className="text-sm text-muted-foreground">当前范围暂无热度数据。</div>
      </footer>
    );
  }

  const maxCount = Math.max(...heat.map((point) => point.count), 0);

  return (
    <footer className="grid gap-3 border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Heat Rail · {heat.length} 个时间点
        </span>
        <span className="font-mono">
          {leftAt}
          {" -> "}
          {rightAt}
        </span>
      </div>

      <ul
        className="flex min-h-12 items-end gap-1 overflow-x-auto"
        aria-label={`Flow heat rail, ${heat.length} time points from ${leftAt} to ${rightAt}`}
      >
        {heat.map((point) => {
          const intensity = heatIntensity(point.count, maxCount);
          const height = 14 + Math.round(intensity * 32);

          return (
            <li
              key={point.at}
              className="w-4 shrink-0 border border-border bg-foreground/10"
              style={{
                height,
                opacity: 0.28 + intensity * 0.72,
              }}
              title={`${point.at} · ${point.count}`}
              aria-label={`${point.at}: ${point.count} changes`}
            />
          );
        })}
      </ul>
    </footer>
  );
}
