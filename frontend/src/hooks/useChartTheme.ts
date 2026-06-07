import { useSyncExternalStore } from "react";

import { useThemeStore } from "@/stores/theme";

export interface ChartTheme {
  /** "light" | "dark" - 当前实际主题 */
  mode: "light" | "dark";
  /** 主前景色 (HSL 字符串)。 */
  foreground: string;
  /** 次级灰。用于 axis / label / grid。 */
  muted: string;
  /** 边线灰。用于 axis line / split line。 */
  border: string;
  /** 主色,用于折线 / 柱图。 */
  accent: string;
}

type ResolvedThemeMode = "light" | "dark";

const PALETTE: Record<ResolvedThemeMode, ChartTheme> = {
  light: {
    mode: "light",
    foreground: "hsl(0, 0%, 9%)",
    muted: "hsl(0, 0%, 45%)",
    border: "hsl(0, 0%, 80%)",
    accent: "hsl(210, 90%, 45%)",
  },
  dark: {
    mode: "dark",
    foreground: "hsl(0, 0%, 96%)",
    muted: "hsl(0, 0%, 64%)",
    border: "hsl(0, 0%, 28%)",
    accent: "hsl(210, 90%, 60%)",
  },
};

/** 给 echarts / 其他第三方图表用的主题色 token。
 *  echarts 不会自动跟随 CSS 变量,这里手动桥接到 ThemeStore。 */
export function useChartTheme(): ChartTheme {
  const mode = useThemeStore((s) => s.mode);
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerTheme
  );
  const resolved = mode === "auto" ? systemTheme : mode;

  return PALETTE[resolved];
}

function subscribeSystemTheme(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSystemTheme(): ResolvedThemeMode {
  if (typeof window === "undefined") return getServerTheme();
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerTheme(): ResolvedThemeMode {
  return "light";
}
