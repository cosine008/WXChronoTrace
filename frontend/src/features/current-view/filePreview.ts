import type { CurrentViewRecord, FieldConfig, FieldFileAsset } from "@/api/schemas";

export interface FilePreviewTarget {
  record: CurrentViewRecord;
  field: FieldConfig;
  asset: FieldFileAsset;
}
