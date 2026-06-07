import type { CurrentViewRecord, FieldConfig } from "@/api/schemas";
import { recordDisplayCode } from "./currentViewUtils";

export async function copyRows(records: CurrentViewRecord[], fields: FieldConfig[]) {
  const header = ["display_code", "valid_from", ...fields.map((field) => field.key)];
  const lines = records.map((record) =>
    [
      recordDisplayCode(record),
      record.valid_from,
      ...fields.map((field) => String(record.data_payload[field.key] ?? "")),
    ].join("\t")
  );
  await navigator.clipboard?.writeText([header.join("\t"), ...lines].join("\n"));
}
