import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { completeOAuthCallback, type OAuthProvider } from "@/api/oauth";
import { InlineMessage } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const PROVIDERS = new Set(["github", "wechat_web", "dingtalk", "qq_web"]);

export function OAuthCallbackPage() {
  const { provider = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const acceptOAuthUser = useAuthStore((s) => s.acceptOAuthUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function finish() {
      if (!PROVIDERS.has(provider)) {
        setError("不支持的第三方登录方式");
        return;
      }
      const code = searchParams.get("code") || "";
      const state = searchParams.get("state") || "";
      if (!code || !state) {
        setError("第三方登录回调缺少必要参数");
        return;
      }
      try {
        const result = await completeOAuthCallback(provider as OAuthProvider, code, state);
        if (cancelled) return;
        acceptOAuthUser(result.user);
        navigate(safeNextPath(result.next), { replace: true });
      } catch (err) {
        if (cancelled) return;
        const apiError = extractApiError(err);
        setError(apiError.message);
        notify.error({
          title: "第三方登录失败",
          message: apiError.message,
          code: apiError.code,
        });
      }
    }
    finish();
    return () => {
      cancelled = true;
    };
  }, [acceptOAuthUser, navigate, notify, provider, searchParams]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 font-display">
      <div className="flex w-full max-w-[360px] flex-col gap-4 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] opacity-50">
          OAuth Callback
        </p>
        <h1 className="text-2xl font-semibold">正在完成登录</h1>
        <InlineMessage tone="error" message={error ?? undefined} />
        {error ? (
          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center border border-current font-mono text-[11px] uppercase tracking-[0.25em]"
          >
            返回登录
          </Link>
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] opacity-50">
            validating...
          </p>
        )}
      </div>
    </div>
  );
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}
