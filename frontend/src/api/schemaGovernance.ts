import { api } from "@/lib/api";
import type { DataSchema, FieldConfig } from "@/api/schemas";

interface UserSummary {
  id: number;
  username: string;
}

export interface SchemaVersionSummary {
  id: number;
  version: number;
  changelog: string;
  field_count: number;
  created_at: string;
  created_by: UserSummary;
}

export interface SchemaVersionListResponse {
  count: number;
  results: SchemaVersionSummary[];
}

export interface SchemaVersionDetail extends SchemaVersionSummary {
  schema_id: number;
  schema_code: string;
  fields_config: FieldConfig[];
}

export async function listSchemaVersions(schemaId: number | string) {
  const { data } = await api.get<SchemaVersionListResponse>(
    `/schemas/${schemaId}/versions/`
  );
  return data;
}

export async function getSchemaVersion(schemaId: number | string, version: number) {
  const { data } = await api.get<SchemaVersionDetail>(
    `/schemas/${schemaId}/versions/${version}/`
  );
  return data;
}

export async function reorderSchemaFields(
  schemaId: number | string,
  fieldKeys: string[]
) {
  const { data } = await api.post<DataSchema>(`/schemas/${schemaId}/fields/reorder`, {
    field_keys: fieldKeys,
  });
  return data;
}
