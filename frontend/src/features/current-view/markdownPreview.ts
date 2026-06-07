import type { CurrentViewRecord, FieldConfig } from "@/api/schemas";

export interface MarkdownPreviewTarget {
  record: CurrentViewRecord;
  field: FieldConfig;
  value: string;
}
