import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, FileText, Loader2 } from "lucide-react";

import {
  getFieldFilePreview,
  type FieldFilePreviewResponse,
  type FieldFilePreviewStatus,
} from "@/api/schemas";
import { extractApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CurrentViewDrawer } from "./CurrentViewDrawer";
import { formatFileSize } from "./fileAssets";
import type { FilePreviewTarget } from "./filePreview";
import { recordDisplayCode } from "./currentViewUtils";

type PreviewState = {
  icon?: ReactElement;
  title: string;
  description: string;
  tone?: "muted" | "error";
};

export function FilePreviewDrawer({
  target,
  onClose,
}: {
  target: FilePreviewTarget | null;
  onClose: () => void;
}) {
  const previewQuery = useQuery({
    queryKey: ["field-file-preview", target?.asset.id],
    queryFn: () => getFieldFilePreview(target!.asset.id),
    enabled: Boolean(target),
    retry: false,
  });
  const preview = previewQuery.data;
  const title = preview?.filename ?? target?.asset.name ?? "附件预览";
  const downloadUrl = preview?.download_url ?? target?.asset.download_url;

  return (
    <CurrentViewDrawer
      open={Boolean(target)}
      title={title}
      description={
        target ? (
          <FilePreviewMeta
            target={target}
            preview={preview}
            loading={previewQuery.isLoading || previewQuery.isFetching}
          />
        ) : undefined
      }
      actions={
        target ? (
          <a
            href={downloadUrl}
            className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            <Download className="size-3.5" aria-hidden />
            下载
          </a>
        ) : undefined
      }
      meta="附件预览"
      testId="file-preview-drawer"
      closeTestId="file-preview-drawer-close"
      onRequestClose={onClose}
    >
      {target && (
        <FilePreviewBody
          preview={preview}
          loading={previewQuery.isLoading || previewQuery.isFetching}
          error={previewQuery.error}
        />
      )}
    </CurrentViewDrawer>
  );
}

function FilePreviewMeta({
  target,
  preview,
  loading,
}: {
  target: FilePreviewTarget;
  preview?: FieldFilePreviewResponse;
  loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-mono">{recordDisplayCode(target.record)}</span>
      <span aria-hidden>/</span>
      <span>{target.field.label}</span>
      <span aria-hidden>/</span>
      <span className="font-mono">{formatFileSize(target.asset.size)}</span>
      <PreviewStatusBadge status={preview?.status} loading={loading} />
      <span className="font-mono">
        {preview?.extracted_at ? formatDateTime(preview.extracted_at) : "未记录抽取时间"}
      </span>
    </div>
  );
}

function FilePreviewBody({
  preview,
  loading,
  error,
}: {
  preview?: FieldFilePreviewResponse;
  loading: boolean;
  error: unknown;
}) {
  if (loading) {
    return (
      <StatePanel
        icon={<Loader2 className="size-4 animate-spin" aria-hidden />}
        title="正在加载文本预览"
        description="预览内容来自后端已抽取的纯文本。"
      />
    );
  }
  if (error) {
    const apiError = extractApiError(error);
    return (
      <StatePanel
        tone="error"
        icon={<AlertCircle className="size-4" aria-hidden />}
        title="预览加载失败"
        description={apiError.message}
      />
    );
  }
  if (!preview) return null;
  const state = previewState(preview);
  if (state) return <StatePanel {...state} />;
  return <ReadyPreview preview={preview} />;
}

function ReadyPreview({ preview }: { preview: FieldFilePreviewResponse }) {
  return (
    <div className="grid min-h-full gap-3">
      {preview.truncated && (
        <div className="border border-[var(--color-status-warning)]/50 bg-[var(--color-status-warning)]/10 px-3 py-2 text-xs text-foreground">
          当前仅显示前段纯文本预览，完整内容请下载原文件查看。
        </div>
      )}
      <pre
        data-testid="file-preview-body"
        className="min-h-[55vh] max-w-full overflow-auto whitespace-pre-wrap break-words border border-border bg-card px-3 py-3 font-mono text-sm leading-6 text-foreground"
      >
        {preview.text}
      </pre>
    </div>
  );
}

function previewState(preview: FieldFilePreviewResponse): PreviewState | null {
  if (preview.preview_type !== "text" || preview.status === "unsupported") {
    return {
      title: "此附件暂不支持文本预览",
      description: "仍可通过下载入口获取原文件。",
    };
  }
  if (preview.status === "pending") {
    return {
      title: "文本抽取等待中",
      description: "当前文件已有预览任务状态，但暂时还没有可显示的文本。",
    };
  }
  if (preview.status === "failed") {
    return {
      tone: "error",
      icon: <AlertCircle className="size-4" aria-hidden />,
      title: "文本抽取失败",
      description: "系统未能从该 Word 附件中生成安全文本预览，可继续下载原文件。",
    };
  }
  if (!preview.text.trim()) {
    return {
      title: "文档没有可预览文本",
      description: "该文件可能为空，或只包含当前抽取策略无法读取的内容。",
    };
  }
  return null;
}

function StatePanel({
  icon = <FileText className="size-4" aria-hidden />,
  title,
  description,
  tone = "muted",
}: {
  icon?: ReactElement;
  title: string;
  description: string;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={cn(
        "flex min-h-[45vh] flex-col items-center justify-center gap-3 border border-border bg-card px-6 py-10 text-center",
        tone === "error" && "border-[var(--color-status-error)]/50"
      )}
    >
      <div
        className={cn(
          "grid size-10 place-items-center border border-border text-muted-foreground",
          tone === "error" && "border-[var(--color-status-error)] text-[var(--color-status-error)]"
        )}
      >
        {icon}
      </div>
      <div className="grid gap-1">
        <div className="font-semibold">{title}</div>
        <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function PreviewStatusBadge({
  status,
  loading,
}: {
  status?: FieldFilePreviewStatus;
  loading: boolean;
}) {
  const label = loading ? "loading" : status ?? "unknown";
  return (
    <span className="border border-border px-1.5 py-0.5 font-mono text-[11px] uppercase">
      {label}
    </span>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
