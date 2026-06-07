import { Database, FileText, Paperclip, type LucideIcon } from "lucide-react";

import type { WorkbenchItem, WorkbenchItemType } from "@/api/workbench";

export const SEARCH_RESULT_LIMIT = 6;

export const SEARCH_FILTERS: Array<{ key: "all" | WorkbenchItemType; label: string }> = [
  { key: "all", label: "全部" },
  { key: "data_card", label: "资料" },
  { key: "note", label: "笔记" },
  { key: "material", label: "材料" },
];

export const TYPE_META: Record<
  WorkbenchItemType,
  { label: string; icon: LucideIcon }
> = {
  data_card: { label: "资料", icon: Database },
  note: { label: "笔记", icon: FileText },
  material: { label: "材料", icon: Paperclip },
};

export function safeWorkbenchTitle(item: WorkbenchItem) {
  if (item.type !== "material") return item.title.trim() || `项目 #${item.id}`;
  if (item.is_sensitive) return `敏感材料 #${item.id}`;

  const originalName = "original_name" in item.detail ? item.detail.original_name : "";
  if (originalName && item.title === originalName) return `材料 #${item.id}`;
  return item.title.trim() || `材料 #${item.id}`;
}
