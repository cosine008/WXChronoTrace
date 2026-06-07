import { parseFlowDimension } from "./flowBoardTransforms.ts";
import type { FlowBoardRouteParams } from "./flowBoardTypes.ts";

export function buildFlowBoardPath(schemaId: number | string, params: FlowBoardRouteParams) {
  const query = new URLSearchParams({
    left_at: params.left_at,
    right_at: params.right_at,
  });
  const dimension = parseFlowDimension(params.dimension);
  if (dimension) {
    query.set("dimension", dimension);
  }
  query.set("retro", String(Boolean(params.retro)));
  query.set("search", params.search ?? "");
  query.set("ordering", params.ordering || "business_code");
  return `/schemas/${schemaId}/flow-board?${query.toString()}`;
}

export function appendReturnTo(target: string, returnTo: string | null | undefined) {
  const normalized = normalizeInAppPath(returnTo);
  if (!normalized) {
    return target;
  }
  const url = new URL(target, "https://chronotrace.local");
  url.searchParams.set("return_to", normalized);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeReturnTo(value: string | null | undefined, fallback: string) {
  return normalizeInAppPath(value) ?? normalizeInAppPath(fallback) ?? "/";
}

function normalizeInAppPath(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }
  return normalized;
}
