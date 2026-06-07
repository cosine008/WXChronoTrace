import type { ExcelIntakePayload, FieldDraft, SheetSummary } from "@/api/excelIntake";
import type { FieldConfig } from "@/api/schemas";
import { todayInputValue } from "@/features/excel-intake/excelIntakeState";

export function buildFieldImportPayload(args: {
  uploadToken: string;
  sheetName: string;
  headerRow: number;
  dataStartRow: number;
}): ExcelIntakePayload {
  return {
    upload_token: args.uploadToken,
    sheet_name: args.sheetName,
    header_row: args.headerRow,
    data_start_row: args.dataStartRow,
    valid_from: todayInputValue(),
    missing_policy: "keep",
    source_tracking: false,
    schema: {
      schema_code: "excel_field_import",
      name: args.sheetName || "Excel 字段导入",
      description: "",
      icon: "table",
      temporal_mode: "continuous",
      period_unit: null,
      identity_mode: "single",
      identity_field_key: "",
      identity_field_keys: [],
      visibility: "private",
      approval_required: false,
    },
  };
}

export function fieldDraftsToFieldConfigs(fields: FieldDraft[]): FieldConfig[] {
  return fields
    .filter((field) => field.import !== false)
    .map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: Boolean(field.required),
      indexed: Boolean(field.indexed),
      validators: field.validators ?? {},
    }));
}

export function sheetDefaults(sheet: SheetSummary | undefined) {
  return {
    sheetName: sheet?.name ?? "",
    headerRow: sheet?.recommended_header_row ?? 1,
    dataStartRow: sheet?.recommended_data_start_row ?? 2,
  };
}
