import { AlertTriangle } from "lucide-react";

import type { IdentityDiagnostics } from "@/api/schemas";

export function ImportIdentityDiagnosticsAlert(props: { diagnostics: IdentityDiagnostics }) {
  const duplicates = props.diagnostics.duplicate_values.slice(0, 6);
  const hiddenCount = props.diagnostics.duplicate_values.length - duplicates.length;
  return (
    <div className="nd-interactive-surface mt-3 grid gap-3 border border-[var(--color-status-error)]/50 bg-card p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-status-error)]" />
        <div className="grid gap-1">
          <div className="font-medium text-[var(--color-status-error)]">
            {props.diagnostics.mode === "composite" ? "当前组合实体标识" : "当前实体标识字段"}
            “{props.diagnostics.identity_field_label}”存在重复值
          </div>
          <div className="text-muted-foreground">{props.diagnostics.message}</div>
        </div>
      </div>
      <div className="grid gap-1 pl-6 font-mono">
        {duplicates.map((item) => (
          <div key={item.value} className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{item.value}</span>
            <span className="text-muted-foreground">出现 {item.count} 次</span>
            <span className="text-muted-foreground">行 {item.row_numbers.join(", ")}</span>
          </div>
        ))}
        {hiddenCount > 0 && <div className="text-muted-foreground">另有 {hiddenCount} 个重复值</div>}
      </div>
    </div>
  );
}
