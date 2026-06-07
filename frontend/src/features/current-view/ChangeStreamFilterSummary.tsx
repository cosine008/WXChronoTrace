import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ChangeStreamFilters } from "./ChangeStreamPanel";
import { changeSetStatusLabel } from "./changeStreamLabels";

interface FilterChip {
  id: keyof ChangeStreamFilters;
  label: string;
  clearPatch: Partial<ChangeStreamFilters>;
}

export function ChangeStreamFilterSummary(props: {
  filters: ChangeStreamFilters;
  onClear: (patch: Partial<ChangeStreamFilters>) => void;
}) {
  const chips = activeFilterChips(props.filters);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => props.onClear(chip.clearPatch)}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-card px-2 py-1",
            "text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
          )}
          aria-label={`清除筛选：${chip.label}`}
          title={`清除筛选：${chip.label}`}
        >
          <span className="min-w-0 truncate">{chip.label}</span>
          <X className="size-3 shrink-0" aria-hidden />
        </button>
      ))}
    </div>
  );
}

function activeFilterChips(filters: ChangeStreamFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.status) {
    chips.push({
      id: "status",
      label: `状态：${changeSetStatusLabel(filters.status)}`,
      clearPatch: { status: "" },
    });
  }
  if (filters.createdBy !== "all") {
    chips.push({
      id: "createdBy",
      label: "创建者：我",
      clearPatch: { createdBy: "all" },
    });
  }
  if (filters.createdFrom) {
    chips.push({
      id: "createdFrom",
      label: `起始：${filters.createdFrom}`,
      clearPatch: { createdFrom: "" },
    });
  }
  if (filters.createdTo) {
    chips.push({
      id: "createdTo",
      label: `截止：${filters.createdTo}`,
      clearPatch: { createdTo: "" },
    });
  }
  return chips;
}
