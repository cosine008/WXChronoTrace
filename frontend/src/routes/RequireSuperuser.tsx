import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

/** 路由守卫：仅 superuser 可访问，否则跳回首页。 */
export function RequireSuperuser({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="font-mono text-sm text-muted-foreground">loading...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_superuser) return <Navigate to="/" replace />;
  return <>{children}</>;
}
