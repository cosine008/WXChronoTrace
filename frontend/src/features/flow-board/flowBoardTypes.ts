export type {
  StatsFlow,
  StatsFlowCountMode,
  StatsFlowDimension,
  StatsFlowHeatPoint,
  StatsFlowLink,
  StatsFlowNode,
  StatsFlowParams,
  StatsFlowRawValue,
  StatsFlowScope,
  StatsFlowSummary,
} from "../../api/stats.ts";

import type { StatsFlowParams } from "../../api/stats.ts";

export interface FlowBoardRouteParams extends Omit<StatsFlowParams, "dimension"> {
  dimension?: string | null;
  return_to?: string | null;
}
