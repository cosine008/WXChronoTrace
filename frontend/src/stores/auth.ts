import { create } from "zustand";
import { api, clearCsrfToken } from "@/lib/api";

export interface CurrentUser {
  id: number;
  username: string;
  display_name: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_employed: boolean;
  left_at: string | null;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  initialized: boolean;
  fetchMe: () => Promise<void>;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  acceptOAuthUser: (user: CurrentUser) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  async fetchMe() {
    set({ loading: true });
    try {
      const { data } = await api.get<CurrentUser>("/auth/me");
      set({ user: data, initialized: true });
    } catch {
      set({ user: null, initialized: true });
    } finally {
      set({ loading: false });
    }
  },

  async login(username, password, remember = false) {
    set({ loading: true });
    try {
      const { data } = await api.post<CurrentUser>("/auth/login", {
        username,
        password,
        remember,
      });
      set({ user: data, initialized: true });
    } finally {
      set({ loading: false });
    }
  },

  acceptOAuthUser(user) {
    set({ user, initialized: true, loading: false });
  },

  async logout() {
    set({ loading: true });
    try {
      await api.post("/auth/logout");
    } catch {
      // 服务端会话可能已过期；登出按钮仍应清掉前端登录态。
    } finally {
      clearCsrfToken();
      set({ user: null, loading: false, initialized: true });
    }
  },
}));
