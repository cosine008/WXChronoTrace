import type { FieldFileAsset } from "@/api/schemas";

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function fileAssetsFromValue(value: unknown): FieldFileAsset[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map(coerceFileAsset).filter((asset): asset is FieldFileAsset => Boolean(asset));
}

export function isDocxFileAsset(asset: Pick<FieldFileAsset, "name" | "content_type">) {
  return asset.content_type === DOCX_CONTENT_TYPE || asset.name.toLowerCase().endsWith(".docx");
}

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  const kilobytes = size / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function coerceFileAsset(value: unknown): FieldFileAsset | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return {
      id: value,
      schema_id: 0,
      field_key: "",
      name: `资产 #${value}`,
      content_type: "",
      size: 0,
      download_url: `/api/v1/files/${value}/download`,
      preview_url: null,
      uploaded_by_id: 0,
    };
  }
  if (!isRecord(value)) return null;
  const id = value.id ?? value.asset_id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
  const name = typeof value.name === "string" && value.name ? value.name : `资产 #${id}`;
  return {
    id,
    schema_id: numberValue(value.schema_id),
    field_key: stringValue(value.field_key),
    name,
    content_type: stringValue(value.content_type),
    size: numberValue(value.size),
    download_url: stringValue(value.download_url) || `/api/v1/files/${id}/download`,
    preview_url: typeof value.preview_url === "string" ? value.preview_url : null,
    preview_type: value.preview_type === "text" || value.preview_type === "none" ? value.preview_type : null,
    preview_status: previewStatusValue(value.preview_status),
    extracted_at: typeof value.extracted_at === "string" ? value.extracted_at : null,
    extraction_truncated: value.extraction_truncated === true,
    created_at: typeof value.created_at === "string" ? value.created_at : null,
    uploaded_by_id: numberValue(value.uploaded_by_id),
  };
}

function previewStatusValue(value: unknown) {
  return value === "pending" || value === "ready" || value === "unsupported" || value === "failed"
    ? value
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
