import { markdownSourceSummary } from "@/components/markdown/markdownText";
import { cn } from "@/lib/utils";

export function MarkdownDiffSummary({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  const beforeSummary = markdownSourceSummary(before);
  const afterSummary = markdownSourceSummary(after);
  const lineDelta = afterSummary.lineCount - beforeSummary.lineCount;
  const charDelta = afterSummary.charCount - beforeSummary.charCount;

  return (
    <div
      data-testid="markdown-diff-summary"
      className={cn(
        "grid min-w-0 gap-2 border border-[var(--color-status-modified)]/20 bg-[var(--color-status-modified)]/10 px-2 py-1 text-xs",
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="font-semibold">Markdown source summary</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {formatDelta(lineDelta, "line")} / {formatDelta(charDelta, "char")}
        </span>
      </div>
      <MarkdownSummarySide label="Before" summary={beforeSummary} tone="before" source={before} />
      <MarkdownSummarySide label="After" summary={afterSummary} tone="after" source={after} />
    </div>
  );
}

function MarkdownSummarySide({
  label,
  summary,
  tone,
  source,
}: {
  label: string;
  summary: ReturnType<typeof markdownSourceSummary>;
  tone: "before" | "after";
  source: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span
          className={cn(
            "font-mono text-[11px]",
            tone === "before"
              ? "text-[var(--color-status-terminated)]"
              : "text-[var(--color-status-new)]"
          )}
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {summary.lineCount} lines / {summary.charCount} chars
        </span>
      </div>
      <span
        title={source}
        className={cn(
          "min-w-0 break-words font-mono leading-5",
          tone === "before"
            ? "text-[var(--color-status-terminated)] line-through"
            : "font-semibold text-[var(--color-status-new)]"
        )}
      >
        {summary.preview}
      </span>
    </div>
  );
}

function formatDelta(value: number, unit: string) {
  if (value === 0) return `0 ${unit}`;
  return `${value > 0 ? "+" : ""}${value} ${unit}`;
}
