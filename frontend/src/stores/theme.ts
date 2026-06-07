import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "auto";

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

/** 主题 store:持久化到 localStorage,初始化时挂载 class 到 <html> */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "auto",
      setMode: (m) => set({ mode: m }),
    }),
    { name: "chronotrace-theme" }
  )
);

/** 根据 mode 计算实际生效的主题(light / dark) */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

/** 把主题写到 <html> 的 class,并监听系统主题变化 */
export function applyThemeFromStore() {
  const mode = useThemeStore.getState().mode;
  const actual = resolveTheme(mode);
  document.documentElement.classList.toggle("dark", actual === "dark");
}

/** 订阅 store 变化,确保 class 始终同步 */
useThemeStore.subscribe(applyThemeFromStore);

/** 监听系统主题变化(仅 auto 模式生效) */
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (useThemeStore.getState().mode === "auto") {
        applyThemeFromStore();
      }
    });
}
