import type { ReactNode } from "react";
import { matchPath, useLocation } from "react-router-dom";

import { AppHeader, AppHeaderActions } from "@/components/brand";
import {
  buildCurrentViewRecordsReturnPath,
  parseCurrentViewExportSearch,
} from "@/features/current-view/currentViewExportRoute";

interface AuthenticatedShellProps {
  children: ReactNode;
}

interface RouteChrome {
  title: string;
  back?: { to: string; label?: string };
}

export function AuthenticatedShell({ children }: AuthenticatedShellProps) {
  const location = useLocation();
  const chrome = resolveRouteChrome(location.pathname, location.search);

  return (
    <>
      <AppHeader
        back={chrome.back}
        center={<ShellCenter title={chrome.title} />}
        right={<AppHeaderActions />}
        className="px-3 sm:px-6"
      />
      {children}
    </>
  );
}

function ShellCenter({ title }: { title: string }) {
  return (
    <div className="hidden min-w-0 sm:block">
      <div className="truncate text-sm font-semibold text-foreground">{title}</div>
    </div>
  );
}

function resolveRouteChrome(pathname: string, search: string): RouteChrome {
  if (pathname === "/" || pathname === "/workbench" || pathname.startsWith("/workbench/")) {
    return { title: "我的工作台" };
  }

  if (pathname === "/dashboard") {
    return { title: "我的表" };
  }

  if (pathname === "/approvals") {
    return { title: "待审批", back: { to: "/", label: "返回工作台" } };
  }

  if (pathname === "/schemas/new") {
    return { title: "新建数据表", back: { to: "/", label: "返回工作台" } };
  }

  if (pathname === "/schemas/import-from-excel") {
    return { title: "从 Excel 创建", back: { to: "/", label: "返回工作台" } };
  }

  const exportMatch = matchPath("/schemas/:id/records/export", pathname);
  if (exportMatch?.params.id) {
    return {
      title: "数据导出",
      back: { to: backToCurrentViewExportSource(exportMatch.params.id, search), label: "返回记录视图" },
    };
  }

  const recordsMatch = matchPath("/schemas/:id/records", pathname);
  if (recordsMatch?.params.id) {
    return { title: "当期视图", back: { to: "/", label: "返回工作台" } };
  }

  const diffMatch = matchPath("/schemas/:id/diff-studio", pathname);
  if (diffMatch?.params.id) {
    return {
      title: "Diff Studio",
      back: { to: backToSchemaRecords(diffMatch.params.id, search), label: "返回记录视图" },
    };
  }

  const flowMatch = matchPath("/schemas/:id/flow-board", pathname);
  if (flowMatch?.params.id) {
    return {
      title: "Flow Board",
      back: { to: backToSchemaRecords(flowMatch.params.id, search), label: "返回记录视图" },
    };
  }

  return { title: "ChronoTrace" };
}

function backToSchemaRecords(schemaId: string, search: string) {
  const returnTo = new URLSearchParams(search).get("return_to");
  if (returnTo && isSafeInternalPath(returnTo)) return returnTo;
  return `/schemas/${schemaId}/records`;
}

function backToCurrentViewExportSource(schemaId: string, search: string) {
  const returnTo = new URLSearchParams(search).get("return_to");
  if (returnTo && isSafeInternalPath(returnTo)) return returnTo;
  const parsedSchemaId = Number(schemaId);
  if (!Number.isInteger(parsedSchemaId) || parsedSchemaId <= 0) {
    return `/schemas/${schemaId}/records`;
  }
  return buildCurrentViewRecordsReturnPath({
    ...parseCurrentViewExportSearch(new URLSearchParams(search)),
    schemaId: parsedSchemaId,
  });
}

function isSafeInternalPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//");
}
