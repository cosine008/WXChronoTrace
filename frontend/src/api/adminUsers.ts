import { api } from "@/lib/api";
import type { UserOption } from "@/api/users";

export interface AdminUserCreatePayload {
  username: string;
  password: string;
  email?: string;
  display_name?: string;
  is_superuser?: boolean;
}

export interface AdminUserUpdatePayload {
  email?: string;
  display_name?: string;
  is_superuser?: boolean;
}

export async function createAdminUser(payload: AdminUserCreatePayload) {
  const { data } = await api.post<UserOption>("/users/", payload);
  return data;
}

export async function updateAdminUser(userId: number, payload: AdminUserUpdatePayload) {
  const { data } = await api.patch<UserOption>(`/users/${userId}`, payload);
  return data;
}

export async function resetUserPassword(userId: number, newPassword: string) {
  await api.post(`/users/${userId}/reset-password`, { new_password: newPassword });
}

export async function markUserLeft(userId: number) {
  await api.post(`/users/${userId}/mark-left`);
}

export async function restoreUser(userId: number) {
  await api.post(`/users/${userId}/restore`);
}
