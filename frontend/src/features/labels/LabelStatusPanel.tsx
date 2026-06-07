import { Barcode, Clock3, Printer, ScanLine } from "lucide-react";

import type { EntityLabel } from "@/api/labels";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<EntityLabel["status"], string> = {
  active: "有效",
  revoked: "作废",
  lost: "遗失",
  replaced: "替换",
};

export function LabelStatusPanel({ label, className }: { label: EntityLabel; className?: string }) {
  return (
    <aside className={cn("grid gap-3 border-l border-border pl-5 text-sm", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase text-muted-foreground">Label</span>
        <span className="border border-border px-2 py-0.5 text-xs">{STATUS_LABEL[label.status]}</span>
      </div>
      <Metric icon={Barcode} label="code" value={label.label_code} mono />
      <Metric icon={ScanLine} label="scans" value={String(label.scan_count)} />
      <Metric icon={Clock3} label="last scan" value={formatDateTime(label.last_scanned_at)} />
      <Metric icon={Printer} label="printed" value={formatDateTime(label.printed_at)} />
    </aside>
  );
}

function Metric(props: {
  icon: typeof Barcode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  const Icon = props.icon;
  return (
    <div className="grid grid-cols-[18px_80px_minmax(0,1fr)] items-center gap-2">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-xs uppercase text-muted-foreground">{props.label}</span>
      <span className={cn("min-w-0 truncate", props.mono && "font-mono text-xs")}>{props.value}</span>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString();
}
