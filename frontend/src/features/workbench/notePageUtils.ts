import type { QueryClient } from "@tanstack/react-query";

import { workbenchKeys } from "@/features/workbench/useWorkbenchQueries";

export function withIdToggled(source: Set<number>, id: number, enabled: boolean) {
  const next = new Set(source);
  if (enabled) next.add(id);
  else next.delete(id);
  return next;
}

export function isNoteBusy(id: number, deletingNoteIds: Set<number>, savingNoteIds: Set<number>) {
  return deletingNoteIds.has(id) || savingNoteIds.has(id);
}

export function noteDetailQueryKey(noteId: number | null | undefined) {
  return [...workbenchKeys.notes(), "detail", noteId ?? "idle"] as const;
}

export async function invalidateWorkbenchQueries(queryClient: QueryClient, includeTrash: boolean) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: workbenchKeys.notes() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.items() }),
    queryClient.invalidateQueries({ queryKey: workbenchKeys.overview() }),
  ];
  if (includeTrash) {
    tasks.push(queryClient.invalidateQueries({ queryKey: workbenchKeys.trash() }));
  }
  await Promise.all(tasks);
}
