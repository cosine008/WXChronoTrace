import type { AdminSchemaLedgerRow } from "@/api/adminSchemas";
import { SchemaObjectRow } from "@/components/schema/SchemaObjectRow";

export function AdminSchemaLedgerTable({ rows }: { rows: AdminSchemaLedgerRow[] }) {
  return (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        <SchemaObjectRow
          key={row.id}
          density="admin"
          schema={{
            id: row.id,
            name: row.name,
            schemaCode: row.schema_code,
            visibility: row.visibility,
            isArchived: row.is_archived,
            approvalRequired: row.approval_required,
            fieldCount: row.field_count,
            currentVersion: row.current_version,
            owner: row.owner,
            createdBy: row.created_by,
            lastModifiedAt: row.updated_at,
            lastChangeAt: row.last_change_at,
            pendingChangesetCount: row.pending_changeset_count,
            changeCount: row.change_count,
          }}
          recordsPath={`/schemas/${row.id}/records`}
          settingsPath={`/schemas/${row.id}/settings`}
        />
      ))}
    </div>
  );
}
