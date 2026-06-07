import { Rows3, Tags, Workflow } from "lucide-react";

import type { ChangeSetFieldDiffRow } from "@/api/schemas";
import { cn } from "@/lib/utils";

import type { OutlineItem, OutlineMode } from "./diffStudioTransforms";

interface Props {
  mode: OutlineMode;
  items: OutlineItem[];
  selectedId: string | null;
  rows: ChangeSetFieldDiffRow[];
  onModeChange: (mode: OutlineMode) => void;
  onSelect: (id: string) => void;
}

const MODE_OPTIONS = [
  { id: "entity" as const, label: "实体", icon: Rows3 },
  { id: "field" as const, label: "字段", icon: Tags },
  { id: "action" as const, label: "操作", icon: Workflow },
];

export function DiffStudioOutline({
  mode,
  items,
  selectedId,
  rows,
  onModeChange,
  onSelect,
}: Props) {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-border">
      <div className="border-b border-border px-3 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">导航</h2>
          <p className="text-xs text-muted-foreground">
            本页 {rows.length} 行 / {items.length} 组
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = option.id === mode;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onModeChange(option.id)}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 border px-2 text-xs transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
                aria-pressed={active}
              >
                <Icon className="size-3.5" aria-hidden />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
          当前页没有可导航的差异分组。
        </div>
      ) : (
        <div className="min-h-0 overflow-y-auto px-2 py-2">
          <ul className="grid gap-1">
            {items.map((item) => {
              const active = selectedId !== null && item.rowIds.includes(selectedId);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.rowIds[0])}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      <span className="block truncate font-mono text-[11px]">{item.sublabel}</span>
                    </span>
                    <span className="font-mono text-sm">{item.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
