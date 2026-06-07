import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { NotificationProvider } from "@/components/notifications";
import { AuthenticatedShell } from "@/routes/AuthenticatedShell";
import { RequireAuth } from "@/routes/RequireAuth";
import { RequireSuperuser } from "@/routes/RequireSuperuser";
import { useAuthStore } from "@/stores/auth";
import { applyThemeFromStore } from "@/stores/theme";

const LoginPage = lazy(async () => ({ default: (await import("@/pages/LoginPage")).LoginPage }));
const OAuthCallbackPage = lazy(async () => ({
  default: (await import("@/pages/OAuthCallbackPage")).OAuthCallbackPage,
}));
const DashboardPage = lazy(async () => ({
  default: (await import("@/pages/DashboardPage")).DashboardPage,
}));
const WorkbenchOverviewPage = lazy(async () => ({
  default: (await import("@/pages/WorkbenchOverviewPage")).WorkbenchOverviewPage,
}));
const WorkbenchDataCardsPage = lazy(async () => ({
  default: (await import("@/pages/WorkbenchDataCardsPage")).WorkbenchDataCardsPage,
}));
const WorkbenchNotesPage = lazy(async () => ({
  default: (await import("@/pages/WorkbenchNotesPage")).WorkbenchNotesPage,
}));
const WorkbenchMaterialsPage = lazy(async () => ({
  default: (await import("@/pages/WorkbenchMaterialsPage")).WorkbenchMaterialsPage,
}));
const WorkbenchTrashPage = lazy(async () => ({
  default: (await import("@/pages/WorkbenchTrashPage")).WorkbenchTrashPage,
}));
const PendingApprovalsPage = lazy(async () => ({
  default: (await import("@/pages/PendingApprovalsPage")).PendingApprovalsPage,
}));
const AuditLogsPage = lazy(async () => ({
  default: (await import("@/pages/AuditLogsPage")).AuditLogsPage,
}));
const AdminOverviewPage = lazy(async () => ({
  default: (await import("@/pages/AdminOverviewPage")).AdminOverviewPage,
}));
const AdminChangesetsPage = lazy(async () => ({
  default: (await import("@/pages/AdminChangesetsPage")).AdminChangesetsPage,
}));
const AdminSchemasPage = lazy(async () => ({
  default: (await import("@/pages/AdminSchemasPage")).AdminSchemasPage,
}));
const AdminExportsPage = lazy(async () => ({
  default: (await import("@/pages/AdminExportsPage")).AdminExportsPage,
}));
const AdminUsersPage = lazy(async () => ({
  default: (await import("@/pages/AdminUsersPage")).AdminUsersPage,
}));
const ExcelIntakePage = lazy(async () => ({
  default: (await import("@/features/excel-intake/ExcelIntakePage")).ExcelIntakePage,
}));
const SchemaCreatePage = lazy(async () => ({
  default: (await import("@/features/schema-wizard/SchemaCreatePage")).SchemaCreatePage,
}));
const SchemaSettingsPage = lazy(async () => ({
  default: (await import("@/features/schema-settings/SchemaSettingsPage")).SchemaSettingsPage,
}));
const CurrentViewPage = lazy(async () => ({
  default: (await import("@/features/current-view/CurrentViewPage")).CurrentViewPage,
}));
const CurrentViewExportPage = lazy(async () => ({
  default: (await import("@/features/current-view/CurrentViewExportPage")).CurrentViewExportPage,
}));
const DiffStudioPage = lazy(async () => ({
  default: (await import("@/features/diff-studio/DiffStudioPage")).DiffStudioPage,
}));
const FlowBoardPage = lazy(async () => ({
  default: (await import("@/features/flow-board/FlowBoardPage")).FlowBoardPage,
}));
const EntityMetroPage = lazy(async () => ({
  default: (await import("@/features/entity-metro/EntityMetroPage")).EntityMetroPage,
}));
const ScanConsolePage = lazy(async () => ({
  default: (await import("@/features/labels/ScanConsolePage")).ScanConsolePage,
}));
const ScanResultPage = lazy(async () => ({
  default: (await import("@/features/labels/ScanResultPage")).ScanResultPage,
}));
const ComponentRecognitionPage = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import("@/verification/ComponentRecognitionPage")).ComponentRecognitionPage,
    }))
  : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function BootstrapGate({ children }: { children: ReactNode }) {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const initialized = useAuthStore((s) => s.initialized);
  useEffect(() => {
    applyThemeFromStore();
    if (!initialized) fetchMe();
  }, [fetchMe, initialized]);
  return <>{children}</>;
}

function RouteBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <span className="font-mono text-sm text-muted-foreground">loading...</span>
    </div>
  );
}

function ProtectedShellRoute({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AuthenticatedShell>
        <RouteBoundary>{children}</RouteBoundary>
      </AuthenticatedShell>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NotificationProvider>
          <BootstrapGate>
            <Routes>
              <Route
                path="/login"
                element={
                  <RouteBoundary>
                    <LoginPage />
                  </RouteBoundary>
                }
              />
              <Route
                path="/auth/oauth/:provider/callback"
                element={
                  <RouteBoundary>
                    <OAuthCallbackPage />
                  </RouteBoundary>
                }
              />
              {ComponentRecognitionPage && (
                <Route
                  path="/__verification/component-recognition"
                  element={
                    <RouteBoundary>
                      <ComponentRecognitionPage />
                    </RouteBoundary>
                  }
                />
              )}
              <Route
                path="/"
                element={
                  <ProtectedShellRoute>
                    <WorkbenchOverviewPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/workbench"
                element={
                  <ProtectedShellRoute>
                    <WorkbenchOverviewPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/workbench/data-cards"
                element={
                  <ProtectedShellRoute>
                    <WorkbenchDataCardsPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/workbench/notes"
                element={
                  <ProtectedShellRoute>
                    <WorkbenchNotesPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/workbench/materials"
                element={
                  <ProtectedShellRoute>
                    <WorkbenchMaterialsPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/workbench/trash"
                element={
                  <ProtectedShellRoute>
                    <WorkbenchTrashPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedShellRoute>
                    <DashboardPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/schemas/new"
                element={
                  <ProtectedShellRoute>
                    <SchemaCreatePage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/schemas/import-from-excel"
                element={
                  <ProtectedShellRoute>
                    <ExcelIntakePage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/schemas/:id/records/export"
                element={
                  <ProtectedShellRoute>
                    <CurrentViewExportPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/schemas/:id/records"
                element={
                  <ProtectedShellRoute>
                    <CurrentViewPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/schemas/:id/diff-studio"
                element={
                  <ProtectedShellRoute>
                    <DiffStudioPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/schemas/:id/flow-board"
                element={
                  <ProtectedShellRoute>
                    <FlowBoardPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/schemas/:id/entity-metro/:entityId"
                element={
                  <RequireAuth>
                    <RouteBoundary>
                      <EntityMetroPage />
                    </RouteBoundary>
                  </RequireAuth>
                }
              />
              <Route
                path="/scan"
                element={
                  <RequireAuth>
                    <RouteBoundary>
                      <ScanConsolePage />
                    </RouteBoundary>
                  </RequireAuth>
                }
              />
              <Route
                path="/scan/:labelCode"
                element={
                  <RequireAuth>
                    <RouteBoundary>
                      <ScanResultPage />
                    </RouteBoundary>
                  </RequireAuth>
                }
              />
              <Route
                path="/approvals"
                element={
                  <ProtectedShellRoute>
                    <PendingApprovalsPage />
                  </ProtectedShellRoute>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <RequireAuth>
                    <RouteBoundary>
                      <AuditLogsPage />
                    </RouteBoundary>
                  </RequireAuth>
                }
              />
              <Route
                path="/audit-logs/sensitive"
                element={
                  <RequireAuth>
                    <RouteBoundary>
                      <AuditLogsPage sensitiveOnly />
                    </RouteBoundary>
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireSuperuser>
                    <RouteBoundary>
                      <AdminOverviewPage />
                    </RouteBoundary>
                  </RequireSuperuser>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <RequireSuperuser>
                    <RouteBoundary>
                      <AdminUsersPage />
                    </RouteBoundary>
                  </RequireSuperuser>
                }
              />
              <Route
                path="/admin/schemas"
                element={
                  <RequireSuperuser>
                    <RouteBoundary>
                      <AdminSchemasPage />
                    </RouteBoundary>
                  </RequireSuperuser>
                }
              />
              <Route
                path="/admin/exports"
                element={
                  <RequireSuperuser>
                    <RouteBoundary>
                      <AdminExportsPage />
                    </RouteBoundary>
                  </RequireSuperuser>
                }
              />
              <Route
                path="/admin/changesets"
                element={
                  <RequireSuperuser>
                    <RouteBoundary>
                      <AdminChangesetsPage />
                    </RouteBoundary>
                  </RequireSuperuser>
                }
              />
              <Route
                path="/schemas/:id/settings"
                element={
                  <RequireAuth>
                    <RouteBoundary>
                      <SchemaSettingsPage />
                    </RouteBoundary>
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BootstrapGate>
        </NotificationProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
