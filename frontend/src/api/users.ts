import { api } from "@/lib/api";

export interface UserOption {
  id: number;
  username: string;
  display_name: string;
  email: string;
  is_superuser: boolean;
  is_employed: boolean;
  left_at: string | null;
}

export async function listUsers(params?: { includeInactive?: boolean }) {
  const search = params?.includeInactive ? "?include_inactive=1" : "";
  const { data } = await api.get<UserOption[]>(`/users/${search}`);
  return data;
}
