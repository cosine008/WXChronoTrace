import type { CSSProperties } from "react";
import { Download, Eye, FileText, Image } from "lucide-react";

import type { FieldConfig, FieldFileAsset } from "@/api/schemas";
import { SafeMarkdown } from "@/components/markdown/SafeMarkdown";
import { cn } from "@/lib/utils";
import { fileAssetsFromValue, formatFileSize, isDocxFileAsset } from "./fileAssets";

export function FieldValueDisplay({
  field,
  value,
  valueText,
  style,
  onOpenFilePreview,
}: {
  field: FieldConfig;
  value?: unknown;
  valueText: string;
  style?: CSSProperties;
  onOpenFilePreview?: (asset: FieldFileAsset) => void;
}) {
  if (field.type === "markdown") {
    return (
      <SafeMarkdown
        value={valueText}
        compact
        className="max-h-28 overflow-hidden"
        style={style}
      />
    );
  }

  if (field.type === "attachment" || field.type === "image") {
    return (
      <FileAssetList
        field={field}
        value={value}
        fallbackText={valueText}
        style={style}
        onOpenFilePreview={onOpenFilePreview}
      />
    );
  }

  return (
    <span className="min-w-0 break-words" style={style}>
      {valueText}
    </span>
  );
}

function FileAssetList({
  field,
  value,
  fallbackText,
  style,
  onOpenFilePreview,
}: {
  field: FieldConfig;
  value: unknown;
  fallbackText: string;
  style?: CSSProperties;
  onOpenFilePreview?: (asset: FieldFileAsset) => void;
}) {
  const assets = fileAssetsFromValue(value);
  if (assets.length === 0) {
    return (
      <span className="min-w-0 break-words" style={style}>
        {fallbackText}
      </span>
    );
  }

  return (
    <div className="grid min-w-0 gap-1" style={style}>
      {assets.map((asset) => (
        <FileAssetRow
          key={asset.id}
          asset={asset}
          image={field.type === "image"}
          onOpenFilePreview={onOpenFilePreview}
        />
      ))}
    </div>
  );
}

function FileAssetRow({
  asset,
  image,
  onOpenFilePreview,
}: {
  asset: FieldFileAsset;
  image: boolean;
  onOpenFilePreview?: (asset: FieldFileAsset) => void;
}) {
  const canPreviewText = isDocxFileAsset(asset) && Boolean(onOpenFilePreview);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <FileAssetIcon image={image} />
      <span className="min-w-0 truncate" title={asset.name}>
        {asset.name}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatFileSize(asset.size)}
      </span>
      {canPreviewText && (
        <FilePreviewButton asset={asset} onOpenFilePreview={onOpenFilePreview} />
      )}
      <FileDownloadLink asset={asset} />
    </div>
  );
}

function FileAssetIcon({ image }: { image: boolean }) {
  return image ? (
    <Image className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
  ) : (
    <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
  );
}

function FilePreviewButton({
  asset,
  onOpenFilePreview,
}: {
  asset: FieldFileAsset;
  onOpenFilePreview?: (asset: FieldFileAsset) => void;
}) {
  return (
    <button
      type="button"
      title="预览 Word 文本"
      aria-label={`预览 ${asset.name}`}
      data-testid="file-preview-open"
      className={fileActionClass()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onOpenFilePreview?.(asset);
      }}
    >
      <Eye className="size-3.5" aria-hidden />
    </button>
  );
}

function FileDownloadLink({ asset }: { asset: FieldFileAsset }) {
  return (
    <a
      href={asset.download_url}
      download={asset.name}
      title="下载附件"
      aria-label={`下载 ${asset.name}`}
      className={cn(fileActionClass(), "ml-auto")}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <Download className="size-3.5" aria-hidden />
    </a>
  );
}

function fileActionClass() {
  return "grid size-6 shrink-0 place-items-center border border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground";
}
