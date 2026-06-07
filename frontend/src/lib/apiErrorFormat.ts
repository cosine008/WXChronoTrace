export type ApiErrorFieldMessage = {
  path: string;
  message: string;
};

export function flattenApiErrorDetails(
  details?: Record<string, unknown>
): ApiErrorFieldMessage[] {
  if (!details) return [];
  return flattenValue(details).slice(0, 12);
}

export function formatApiErrorDetail(details?: Record<string, unknown>) {
  const fieldMessages = flattenApiErrorDetails(details);
  if (fieldMessages.length > 0) {
    return fieldMessages
      .map((item) => `${humanizeApiErrorPath(item.path)}：${item.message}`)
      .join("\n");
  }
  return details ? JSON.stringify(details, null, 2) : undefined;
}

export function humanizeApiErrorPath(path: string) {
  return path
    .replace(/^fields_config\.(\d+)\./, "字段配置第 $1 项.")
    .replace(/^fields_config$/, "字段配置")
    .replace(/^schema_code$/, "表编码")
    .replace(/^name$/, "表名")
    .replace(/^description$/, "描述")
    .replace(/^identity_field_key$/, "实体标识字段")
    .replace(/^visibility$/, "可见性")
    .replace(/^approval_required$/, "审批设置")
    .replace(/^temporal_mode$/, "时态模式")
    .replace(/^period_unit$/, "周期单位")
    .replace(/\.key$/, ".字段编码")
    .replace(/\.label$/, ".显示名")
    .replace(/\.type$/, ".字段类型")
    .replace(/\.validators$/, ".校验规则");
}

function flattenValue(value: unknown, path = ""): ApiErrorFieldMessage[] {
  const message = stringifyLeafMessage(value);
  if (message) return [{ path: path || "detail", message }];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenValue(item, path ? `${path}.${index}` : String(index)));
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      flattenValue(item, path ? `${path}.${key}` : key)
    );
  }

  return [];
}

function stringifyLeafMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join("，");
  }
  if (isRecord(value) && typeof value.message === "string") return value.message;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
