import { useState, type FormEvent } from "react";
import { GitBranch, MessageCircle, QrCode, Send } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { enabledOAuthProviders, startOAuth, type OAuthProvider } from "@/api/oauth";
import { BrandMark, DotMatrix } from "@/components/brand";
import { InlineMessage } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { extractApiError, type ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const notify = useNotification();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const oauthProviders = enabledOAuthProviders();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password, remember);
      navigate(nextPath, { replace: true });
    } catch (err) {
      const apiError = extractApiError(err);
      const message = formatLoginError(apiError);
      setError(message);
      notify.error({
        title: "登录失败",
        message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      const result = await startOAuth(provider, nextPath);
      window.location.assign(result.authorization_url);
    } catch (err) {
      const apiError = extractApiError(err);
      setError(apiError.message);
      notify.error({
        title: "第三方登录失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
      setOauthLoading(null);
    }
  }

  return (
    <div
      className={cn(
        "nothing-hero relative flex min-h-screen items-center justify-center px-6 font-display"
      )}
    >
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-4 font-mono text-[10px] uppercase tracking-[0.18em] opacity-60 sm:px-6 sm:text-[11px] sm:tracking-[0.25em]">
        <span>CT-LOGIN / 01</span>
        <span>SECURE</span>
      </header>

      <div className="flex w-full max-w-[360px] flex-col items-center gap-8">
        <DotMatrix length={14} intensity={0.55} className="text-2xl" />
        <BrandMark size="lg" align="center" withTagline />

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
          <Field
            label="账号"
            type="text"
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />
          <Field
            label="密码"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          <label className="mt-1 inline-flex items-center gap-2 self-start font-mono text-[10px] uppercase tracking-[0.3em] opacity-60 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3 accent-current"
            />
            记住我 · 7 天
          </label>

          <InlineMessage tone="error" message={error ?? undefined} className="mt-1" />

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "mt-2 inline-flex h-11 items-center justify-center gap-2 border border-current font-medium tracking-[0.4em]",
              "transition-colors hover:bg-[hsl(var(--foreground))] hover:text-[hsl(var(--background))]",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {loading ? "登 录 中" : "登  录"}
          </button>

          {oauthProviders.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] opacity-50">
                <span className="h-px flex-1 bg-current" />
                <span>其他登录方式</span>
                <span className="h-px flex-1 bg-current" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {oauthProviders.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => handleOAuth(provider)}
                    disabled={loading || oauthLoading !== null}
                    title={oauthProviderLabel(provider)}
                    className={cn(
                      "inline-flex h-10 items-center justify-center border border-current",
                      "transition-colors hover:bg-[hsl(var(--foreground))] hover:text-[hsl(var(--background))]",
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <OAuthProviderIcon provider={provider} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        <div className="flex w-full flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] opacity-40 sm:flex-row sm:justify-between sm:text-[11px] sm:tracking-[0.25em]">
          <span>© 2026 ChronoTrace</span>
          <span>BUILD · 0.1.0</span>
        </div>
      </div>
    </div>
  );
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}

function formatLoginError(apiError: ApiError): string {
  if (apiError.code === "ACCOUNT_LOCKED") {
    const lockedUntil = apiError.details?.locked_until;
    if (typeof lockedUntil === "string") {
      const remaining = remainingMinutes(lockedUntil);
      if (remaining > 0) {
        return `${apiError.message}（约 ${remaining} 分钟后解锁）`;
      }
    }
    return apiError.message;
  }
  return apiError.message;
}

function oauthProviderLabel(provider: OAuthProvider): string {
  return {
    github: "GitHub",
    wechat_web: "微信",
    dingtalk: "钉钉",
    qq_web: "QQ",
  }[provider];
}

function OAuthProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === "github") return <GitBranch className="size-4" aria-hidden="true" />;
  if (provider === "wechat_web") return <MessageCircle className="size-4" aria-hidden="true" />;
  if (provider === "dingtalk") return <Send className="size-4" aria-hidden="true" />;
  return <QrCode className="size-4" aria-hidden="true" />;
}

function formatApiErrorDetail(details?: Record<string, unknown>) {
  return details ? JSON.stringify(details, null, 2) : undefined;
}

function remainingMinutes(lockedUntilIso: string): number {
  const until = new Date(lockedUntilIso).getTime();
  if (Number.isNaN(until)) return 0;
  const diffMs = until - Date.now();
  if (diffMs <= 0) return 0;
  return Math.max(1, Math.ceil(diffMs / 60_000));
}

function Field(props: {
  label: string;
  type: "text" | "password";
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-50">
        {props.label}
      </span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required
        className={cn(
          "h-10 border-b border-current bg-transparent px-1 outline-none",
          "transition-all placeholder:opacity-40 focus:border-b-2"
        )}
      />
    </label>
  );
}
