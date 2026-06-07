import type { AdminExportEventRow } from "@/api/adminExports";
import {
  adminExportFormatLabel,
  adminExportRiskLabel,
  adminExportSourceLabel,
  formatAdminExportDate,
  formatAdminExportFileSize,
  formatAdminExportNumber,
} from "./adminExportDisplay";

interface Props {
  rows: AdminExportEventRow[];
  activeEventId?: number | null;
  onOpen: (auditLogId: number) => void;
}

export function AdminExportEventTable({ rows, activeEventId, onOpen }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <HeaderCell>事件 / 来源</HeaderCell>
            <HeaderCell>操作人 / 目标</HeaderCell>
            <HeaderCell>导出内容</HeaderCell>
            <HeaderCell>风险</HeaderCell>
            <HeaderCell>时间</HeaderCell>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              onClick={() => onOpen(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(row.id);
                }
              }}
              className="cursor-pointer border-t border-border align-top outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/20"
              aria-selected={activeEventId === row.id}
            >
              <DataCell className="min-w-[220px]">
                <div className="grid gap-1">
                  <div className="font-mono text-[11px] text-muted-foreground">#{row.id}</div>
                  <div className="truncate font-medium text-foreground">{adminExportSourceLabel(row.source)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {row.job_code || "无任务号"}
                  </div>
                </div>
              </DataCell>
              <DataCell className="min-w-[220px]">
                <div className="grid gap-1">
                  <div className="truncate text-foreground">{row.actor?.username || "system"}</div>
                  <div className="truncate font-medium text-foreground">
                    {row.schema_name || row.schema_code || row.target_type}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {row.target_type}
                    {row.target_id === null ? "" : ` / ${row.target_id}`}
                  </div>
                </div>
              </DataCell>
              <DataCell className="min-w-[170px]">
                <dl className="grid gap-1 text-xs">
                  <MetaRow label="格式" value={adminExportFormatLabel(row.format)} />
                  <MetaRow label="行数" value={formatAdminExportNumber(row.row_count)} />
                  <MetaRow label="大小" value={formatAdminExportFileSize(row.file_size_bytes)} />
                </dl>
              </DataCell>
              <DataCell className="min-w-[180px]">
                {row.risk_flags.length === 0 ? (
                  <span className="text-xs text-muted-foreground">无</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {row.risk_flags.map((risk) => (
                      <RiskChip key={risk}>{adminExportRiskLabel(risk)}</RiskChip>
                    ))}
                  </div>
                )}
              </DataCell>
              <DataCell className="min-w-[150px]">
                <div className="grid gap-1 text-xs">
                  <div className="font-mono text-foreground">{formatAdminExportDate(row.created_at)}</div>
                  <div className="text-muted-foreground">{row.action}</div>
                </div>
              </DataCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function DataCell(props: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${props.className ?? ""}`}>{props.children}</td>;
}

function MetaRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="font-mono text-foreground">{props.value}</dd>
    </div>
  );
}

function RiskChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center border border-[var(--color-status-modified)]/80 bg-[var(--color-status-modified)]/10 px-1.5 text-[11px] text-foreground">
      {children}
    </span>
  );
}
