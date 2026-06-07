import type { WorkbenchItem, WorkbenchItemType } from "@/api/workbench";

const TYPE_LABELS: Record<WorkbenchItemType, string> = {
  data_card: "资料",
  note: "笔记",
  material: "材料",
};

const TYPE_PATHS: Record<WorkbenchItemType, string> = {
  data_card: "/workbench/data-cards",
  note: "/workbench/notes",
  material: "/workbench/materials",
};

export function getWorkbenchTypeLabel(type: WorkbenchItemType) {
  return TYPE_LABELS[type];
}

export function getWorkbenchTypePath(type: WorkbenchItemType) {
  return TYPE_PATHS[type];
}

export function safeWorkbenchObjectTitle(item: WorkbenchItem) {
  if (item.type !== "material") return item.title.trim() || `项目 #${item.id}`;
  if (item.is_sensitive) return `敏感材料 #${item.id}`;

  const originalName = "original_name" in item.detail ? item.detail.original_name : "";
  if (originalName && item.title === originalName) return `材料 #${item.id}`;
  return item.title.trim() || `材料 #${item.id}`;
}
