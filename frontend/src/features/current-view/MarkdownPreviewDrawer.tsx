import { SafeMarkdown } from "@/components/markdown/SafeMarkdown";
import { CurrentViewDrawer } from "./CurrentViewDrawer";
import { recordDisplayCode } from "./currentViewUtils";
import type { MarkdownPreviewTarget } from "./markdownPreview";

export function MarkdownPreviewDrawer({
  target,
  onClose,
}: {
  target: MarkdownPreviewTarget | null;
  onClose: () => void;
}) {
  return (
    <CurrentViewDrawer
      open={Boolean(target)}
      title={target ? target.field.label : "Markdown 预览"}
      description={target ? <MarkdownPreviewMeta target={target} /> : undefined}
      meta="Markdown"
      testId="markdown-preview-drawer"
      closeTestId="markdown-preview-drawer-close"
      onRequestClose={onClose}
    >
      {target && (
        <div className="grid gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-3 text-xs text-muted-foreground">
            <span className="font-mono">{target.field.key}</span>
            <span aria-hidden>/</span>
            <span className="font-mono">{target.value.length} chars</span>
          </div>
          <div data-testid="markdown-preview-body">
            <SafeMarkdown value={target.value} className="max-w-none" />
          </div>
        </div>
      )}
    </CurrentViewDrawer>
  );
}

function MarkdownPreviewMeta({ target }: { target: MarkdownPreviewTarget }) {
  return (
    <span className="font-mono">
      {recordDisplayCode(target.record)}
    </span>
  );
}
