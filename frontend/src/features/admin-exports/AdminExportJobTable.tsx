import type { AdminExportJobRow } from "@/api/adminExports";
import {
  adminExportFormatLabel,
  adminExportRiskLabel,
  adminExportStatusMeta,
  adminExportYesNo,
  formatAdminExportDate,
  formatAdminExportFileSize,
  formatAdminExportNumber,
} from "./adminExportDisplay";

interface Props {
  rows: AdminExportJobRow[];
  activeJobCode?: string | null;
  onOpen: (jobCode: string) => void;
}

export function AdminExportJobTable({ rows, activeJobCode, onOpen }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <HeaderCell>任务 / 文件</HeaderCell>
            <HeaderCell>用户 / 表</HeaderCell>
            <HeaderCell>状态</HeaderCell>
            <HeaderCell>行数</HeaderCell>
            <HeaderCell>风险</HeaderCell>
            <HeaderCell>时间</HeaderCell>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.job_code}
              tabIndex={0}
              onClick={() => onOpen(row.job_code)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(row.job_code);
                }
              }}
              className="cursor-pointer border-t border-border align-top outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/20"
              aria-selected={activeJobCode === row.job_code}
            >
              <DataCell className="min-w-[240px]">
                <div className="grid gap-1">
                  <div className="truncate font-medium text-foreground">
                    {row.filename || `${row.schema.schema_code}.${row.format}`}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">{row.job_code}</div>
                  <div className="text-xs text-muted-foreground">
                    {adminExportFormatLabel(row.format)} / {formatAdminExportFileSize(row.file_size_bytes)}
                  </div>
                </div>
              </DataCell>
              <DataCell className="min-w-[220px]">
                <div className="grid gap-1">
                  <div className="truncate text-foreground">{row.owner.username}</div>
                  <div className="truncate font-medium text-foreground">{row.schema.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {row.schema.schema_code}
                  </div>
                </div>
              </DataCell>
              <DataCell className="min-w-[150px]">
                <div className="grid gap-2">
                  <StatusPill status={row.status} />
                  <div className="text-xs text-muted-foreground">has_file {adminExportYesNo(row.has_file)}</div>
                </div>
              </DataCell>
              <DataCell className="min-w-[140px]">
                <dl className="grid gap-1 text-xs">
                  <MetaRow label="估算" value={formatAdminExportNumber(row.row_count_estimate)} />
                  <MetaRow label="实际" value={formatAdminExportNumber(row.row_count_actual)} />
                </dl>
              </DataCell>
              <DataCell className="min-w-[170px]">
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
              <DataCell className="min-w-[220px]">
                <dl className="grid gap-1 text-xs">
                  <MetaRow label="创建" value={formatAdminExportDate(row.created_at)} />
                  <MetaRow label="完成" value={formatAdminExportDate(row.finished_at)} />
                  <MetaRow label="过期" value={formatAdminExportDate(row.expires_at)} />
                </dl>
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

function StatusPill({ status }: { status: AdminExportJobRow["status"] }) {
  const meta = adminExportStatusMeta(status);
  return (
    <span className={`inline-flex h-6 items-center border px-2 text-[11px] ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function RiskChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center border border-[var(--color-status-modified)]/80 bg-[var(--color-status-modified)]/10 px-1.5 text-[11px] text-foreground">
      {children}
    </span>
  );
}
