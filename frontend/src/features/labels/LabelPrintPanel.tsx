import { useEffect, useMemo } from "react";
import { Download, Eye, Printer, X } from "lucide-react";

import type { EntityLabel } from "@/api/labels";
import { saveBlob } from "@/lib/download";

export function LabelPreviewButton(props: {
  label: EntityLabel;
  disabled?: boolean;
  onPreview: (label: EntityLabel) => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onPreview(props.label)}
      className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
    >
      <Eye className="size-3.5" aria-hidden />
      预览
    </button>
  );
}

export function LabelSheetPreviewButton(props: {
  disabled?: boolean;
  labelCount: number;
  onPreview: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onPreview}
      title={`预览 ${props.labelCount} 个 active 标签的 A4 SVG`}
      className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
    >
      <Eye className="size-3.5" aria-hidden />
      A4 预览
    </button>
  );
}

export function LabelPreviewDialog(props: {
  blob: Blob | null;
  title: string;
  filename: string;
  description?: string;
  downloadLabel?: string;
  downloadDisabled?: boolean;
  onDownload?: (blob: Blob) => void;
  printLabel?: string;
  printDisabled?: boolean;
  printTips?: readonly string[];
  onPrint?: () => void;
  onClose: () => void;
}) {
  const url = useMemo(() => (props.blob ? URL.createObjectURL(props.blob) : null), [props.blob]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (!props.blob) return null;
  const blob = props.blob;
  const printTips = props.printTips?.filter(Boolean) ?? [];
  const description =
    props.description ??
    (props.onPrint
      ? "预览不会记录打印；点击打印后会写入打印审计并打开系统打印窗口。"
      : "预览不会记录打印。");

  function handleDownload() {
    if (props.onDownload) {
      props.onDownload(blob);
      return;
    }
    saveBlob(blob, props.filename);
  }

  return (
    <div className="fixed inset-0 z-50 grid bg-background/80 p-4 backdrop-blur-sm">
      <section className="mx-auto grid h-full w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto_auto] border border-border bg-background shadow-2xl">
        <header className="flex min-w-0 items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{props.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex size-8 items-center justify-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            aria-label="关闭预览"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 bg-muted/30 p-3">
          {url ? (
            <iframe
              title={props.title}
              src={url}
              className="h-full w-full border border-border bg-white"
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              生成预览中
            </div>
          )}
        </div>
        {printTips.length > 0 && (
          <div className="grid gap-1 border-t border-border bg-background px-4 py-2 text-xs text-muted-foreground md:grid-cols-[auto_1fr] md:items-start md:gap-3">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Printer className="size-3.5" aria-hidden />
              打印设置
            </span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {printTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {props.filename}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={props.onClose}
              className="h-9 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              关闭
            </button>
            {props.downloadLabel && (
              <button
                type="button"
                disabled={props.downloadDisabled}
                onClick={handleDownload}
                className="inline-flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
              >
                <Download className="size-4" aria-hidden />
                {props.downloadLabel}
              </button>
            )}
            {props.onPrint && (
              <button
                type="button"
                disabled={props.printDisabled}
                onClick={props.onPrint}
                className="inline-flex h-9 items-center gap-2 border border-foreground bg-foreground px-3 text-sm text-background disabled:opacity-40"
              >
                <Printer className="size-4" aria-hidden />
                {props.printLabel ?? "打印"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
