import { useQuery } from "@tanstack/react-query";

import {
  getWorkbenchOverview,
  listDataCards,
  listMaterials,
  listNotes,
  listWorkbenchItems,
  listWorkbenchTrash,
  type WorkbenchItemType,
} from "@/api/workbench";

export const workbenchKeys = {
  all: ["workbench"] as const,
  overview: () => [...workbenchKeys.all, "overview"] as const,
  items: () => [...workbenchKeys.all, "items"] as const,
  itemList: (params?: { type?: WorkbenchItemType }) =>
    [...workbenchKeys.items(), params ?? {}] as const,
  dataCards: () => [...workbenchKeys.all, "data-cards"] as const,
  notes: () => [...workbenchKeys.all, "notes"] as const,
  materials: () => [...workbenchKeys.all, "materials"] as const,
  trash: () => [...workbenchKeys.all, "trash"] as const,
};

export function useWorkbenchOverviewQuery() {
  return useQuery({
    queryKey: workbenchKeys.overview(),
    queryFn: getWorkbenchOverview,
  });
}

export function useWorkbenchItemsQuery(params?: { type?: WorkbenchItemType }) {
  return useQuery({
    queryKey: workbenchKeys.itemList(params),
    queryFn: () => listWorkbenchItems(params),
  });
}

export function useWorkbenchDataCardsQuery() {
  return useQuery({
    queryKey: workbenchKeys.dataCards(),
    queryFn: listDataCards,
  });
}

export function useWorkbenchNotesQuery() {
  return useQuery({
    queryKey: workbenchKeys.notes(),
    queryFn: listNotes,
  });
}

export function useWorkbenchMaterialsQuery() {
  return useQuery({
    queryKey: workbenchKeys.materials(),
    queryFn: listMaterials,
  });
}

export function useWorkbenchTrashQuery() {
  return useQuery({
    queryKey: workbenchKeys.trash(),
    queryFn: listWorkbenchTrash,
  });
}
