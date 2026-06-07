import type { CSSProperties } from "react";

export type GridDensity = "compact" | "standard" | "comfortable";

export const GRID_DENSITY_OPTIONS: Array<{ value: GridDensity; label: string }> = [
  { value: "compact", label: "紧凑" },
  { value: "standard", label: "标准" },
  { value: "comfortable", label: "舒展" },
];

export function gridDensityRowHeight(density: GridDensity) {
  if (density === "compact") return 40;
  if (density === "comfortable") return 58;
  return 48;
}

export function gridDensityViewportHeight(density: GridDensity) {
  if (density === "compact") return 600;
  if (density === "comfortable") return 660;
  return 620;
}

export function gridDensityCellPadding(density: GridDensity) {
  if (density === "compact") return "px-3 py-1.5";
  if (density === "comfortable") return "px-3 py-2.5";
  return "px-3 py-2";
}

export function gridDensityValueClamp(density: GridDensity): CSSProperties {
  return {
    display: "-webkit-box",
    overflow: "hidden",
    textOverflow: "ellipsis",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: density === "comfortable" ? 2 : 1,
  };
}
