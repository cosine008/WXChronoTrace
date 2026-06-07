import type { QueryClient } from "@tanstack/react-query";

import type { UpdateMaterialPayload, WorkbenchMaterialItem } from "@/api/workbench";
import type { MaterialUploadValues } from "@/features/workbench/MaterialUploader";
import { getMaterialDetail, parseMaterialTags } from "@/features/workbench/materialMeta";
import { workbenchKeys } from "@/features/workbench/useWorkbenchQueries";

export type MaterialMetadataForm = {
  title: string;
  description: string;
  tagsText: string;
  isSensitive: boolean;
};

export function buildMaterialFormData(values: MaterialUploadValues) {
  const description = values.description.trim();
  const formData = new FormData();
  formData.append("file", values.file);
  if (values.title.trim()) formData.append("title", values.title.trim());
  formData.append("summary", description);
  formData.append("description", description);
  formData.append("tags", JSON.stringify(parseMaterialTags(values.tagsText)));
  formData.append("is_sensitive", String(values.isSensitive));
  return formData;
}

export function buildMaterialMetadataForm(item: WorkbenchMaterialItem): MaterialMetadataForm {
  return {
    title: item.title,
    description: getMaterialDetail(item)?.description ?? item.summary ?? "",
    tagsText: item.tags.join(", "),
    isSensitive: item.is_sensitive,
  };
}

export function buildMaterialUpdatePayload(form: MaterialMetadataForm): UpdateMaterialPayload {
  const description = form.description.trim();
  return {
    title: form.title.trim(),
    summary: description,
    description,
    tags: parseMaterialTags(form.tagsText),
    is_sensitive: form.isSensitive,
  };
}

export async function invalidateMaterialQueries(queryClient: QueryClient, includeTrash: boolean) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: workbenchKeys.materials() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.items() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.overview() }),
  ];
  if (includeTrash) tasks.push(queryClient.invalidateQueries({ queryKey: workbenchKeys.trash() }));
  await Promise.all(tasks);
}

export function withIdToggled(source: Set<number>, id: number, enabled: boolean) {
  const next = new Set(source);
  if (enabled) next.add(id);
  else next.delete(id);
  return next;
}

export function isMaterialBusy(
  id: number,
  deletingIds: ReadonlySet<number>,
  savingIds: ReadonlySet<number>
) {
  return deletingIds.has(id) || savingIds.has(id);
}
