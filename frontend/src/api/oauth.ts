import { api } from "@/lib/api";
import type { CurrentUser } from "@/stores/auth";

export type OAuthProvider = "github" | "wechat_web" | "dingtalk" | "qq_web";

export interface OAuthStartResponse {
  provider: OAuthProvider;
  authorization_url: string;
  state: string;
}

export interface OAuthCallbackResponse {
  status: "registered" | "logged_in";
  is_new_user: boolean;
  next: string;
  user: CurrentUser;
  csrf_token: string;
}

export async function startOAuth(provider: OAuthProvider, next: string) {
  const { data } = await api.get<OAuthStartResponse>(`/auth/oauth/${provider}/start`, {
    params: { next },
  });
  return data;
}

export async function completeOAuthCallback(provider: OAuthProvider, code: string, state: string) {
  const { data } = await api.get<OAuthCallbackResponse>(`/auth/oauth/${provider}/callback`, {
    params: { code, state },
  });
  return data;
}

export function enabledOAuthProviders(): OAuthProvider[] {
  const raw = import.meta.env.VITE_OAUTH_ENABLED_PROVIDERS || "github";
  return raw
    .split(",")
    .map((item: string) => item.trim())
    .filter((item: string): item is OAuthProvider =>
      ["github", "wechat_web", "dingtalk", "qq_web"].includes(item)
    );
}
