import { useEffect, useRef } from "react";
import { BarChart, LineChart, SankeyChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { init, use as registerECharts, type ECharts, type EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

registerECharts([BarChart, LineChart, SankeyChart, GridComponent, TooltipComponent, CanvasRenderer]);

export function EChartCanvas(props: { option: object; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = init(container);
    chartRef.current = chart;
    const resize = () => {
      chart.resize();
    };
    resize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        resize();
      });
      observer.observe(container);
      return () => {
        observer.disconnect();
        chart.dispose();
        chartRef.current = null;
      };
    }

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(props.option as EChartsCoreOption, true);
  }, [props.option]);

  return <div ref={containerRef} style={{ height: props.height }} />;
}
