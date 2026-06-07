import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function SafeMarkdown({
  value,
  compact = false,
  className,
  style,
}: {
  value: string;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const headingClass = compact ? "font-semibold" : "font-semibold leading-7";
  const blockGapClass = compact ? "space-y-1 text-xs leading-5" : "space-y-3 text-sm leading-6";

  return (
    <div
      className={cn(
        "min-w-0 break-words text-foreground",
        blockGapClass,
        className
      )}
      style={style}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => (
            <p className={cn(headingClass, compact ? "" : "text-lg")}>{children}</p>
          ),
          h2: ({ children }) => (
            <p className={cn(headingClass, compact ? "" : "text-base")}>{children}</p>
          ),
          h3: ({ children }) => <p className={headingClass}>{children}</p>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="ml-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={safeHref(href)}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="border border-border bg-muted px-1 py-0.5 font-mono text-[0.92em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="max-w-full overflow-auto border border-border bg-muted p-2 font-mono text-[0.92em]">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="max-w-full overflow-auto">
              <table className="w-full border-collapse text-left">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border px-2 py-1 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

function safeHref(href: string | undefined) {
  if (!href) return undefined;
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}
