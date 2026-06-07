import type {
  MaterialPreviewStatus,
  WorkbenchMaterialDetail,
  WorkbenchMaterialItem,
} from "@/api/workbench";

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  csv: "CSV",
  txt: "TXT",
  md: "MD",
  png: "PNG",
  jpg: "JPG",
  jpeg: "JPG",
  webp: "WEBP",
  unknown: "未知",
};

const MATERIAL_PREVIEW_STATUS_LABELS: Record<MaterialPreviewStatus, string> = {
  none: "无预览",
  image: "图片",
  text: "文本",
  failed: "失败",
};

const MATERIAL_ALLOWED_EXTENSIONS = new Set(
  Object.keys(MATERIAL_TYPE_LABELS).filter((key) => key !== "unknown")
);

export const MATERIAL_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp";
export const MATERIAL_ALLOWED_LABEL = "PDF, Word, Excel, CSV, TXT, MD, PNG, JPG, WEBP";
export const MATERIAL_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MATERIAL_MAX_FILE_SIZE_LABEL = "50 MB";

export function getMaterialDetail(
  item: Pick<WorkbenchMaterialItem, "detail"> | null | undefined
): WorkbenchMaterialDetail | null {
  if (!item) return null;
  return isWorkbenchMaterialDetail(item.detail) ? item.detail : null;
}

export function isWorkbenchMaterialDetail(
  detail: WorkbenchMaterialItem["detail"]
): detail is WorkbenchMaterialDetail {
  return (
    "original_name" in detail &&
    typeof detail.original_name === "string" &&
    "size" in detail &&
    typeof detail.size === "number"
  );
}

export function getMaterialTypeKey(item: Pick<WorkbenchMaterialItem, "detail">) {
  return extensionFromName(getMaterialDetail(item)?.original_name ?? "") || "unknown";
}

export function formatMaterialTypeLabel(type: string) {
  return MATERIAL_TYPE_LABELS[type] ?? type.toUpperCase();
}

export function formatMaterialPreviewStatus(status: MaterialPreviewStatus) {
  return MATERIAL_PREVIEW_STATUS_LABELS[status];
}

export function getMaterialDisplayTitle(item: WorkbenchMaterialItem) {
  if (item.is_sensitive) return `敏感材料 #${item.id}`;
  const detail = getMaterialDetail(item);
  return item.title.trim() || detail?.original_name || `材料 #${item.id}`;
}

export function getMaterialListDescription(item: WorkbenchMaterialItem) {
  if (item.is_sensitive) return "敏感材料，列表页已隐藏文件名与说明。";
  const detail = getMaterialDetail(item);
  return detail?.description.trim() || item.summary.trim() || "未填写说明";
}

export function getMaterialDownloadFilename(item: WorkbenchMaterialItem) {
  const detail = getMaterialDetail(item);
  return detail?.original_name || item.title.trim() || `material-${item.id}`;
}

export function canPreviewMaterial(item: Pick<WorkbenchMaterialItem, "detail">) {
  const detail = getMaterialDetail(item);
  return detail?.preview_status === "image" && Boolean(detail.preview_url);
}

export function parseMaterialTags(text: string) {
  return [...new Set(text.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean))];
}

export function validateMaterialFile(file: File) {
  const extension = extensionFromName(file.name);
  if (!extension || !MATERIAL_ALLOWED_EXTENSIONS.has(extension)) {
    return `仅支持 ${MATERIAL_ALLOWED_LABEL}`;
  }
  if (file.size > MATERIAL_MAX_FILE_SIZE_BYTES) {
    return `单个文件不能超过 ${MATERIAL_MAX_FILE_SIZE_LABEL}`;
  }
  return null;
}

function extensionFromName(name: string) {
  const match = /\.([^.]+)$/.exec(name.toLowerCase());
  return match?.[1] ?? "";
}
