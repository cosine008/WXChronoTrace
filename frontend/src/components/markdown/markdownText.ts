const MARKDOWN_LINK_RE = /!?\[([^\]]*)\]\([^)]+\)/g;
const MARKDOWN_AUTOLINK_RE = /<(?:https?:\/\/|mailto:)[^>]+>/gi;
const MARKDOWN_HTML_RE = /<[^>]+>/g;
const MARKDOWN_FENCE_RE = /```[a-zA-Z0-9_-]*|```/g;
const MARKDOWN_PREFIX_RE = /^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/gm;

export function markdownToPlainText(value: string) {
  return value
    .replace(MARKDOWN_LINK_RE, "$1")
    .replace(MARKDOWN_AUTOLINK_RE, " ")
    .replace(MARKDOWN_HTML_RE, " ")
    .replace(MARKDOWN_FENCE_RE, " ")
    .replace(MARKDOWN_PREFIX_RE, "")
    .replace(/[`*_~]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function markdownSourceSummary(value: string, limit = 140) {
  const plainText = markdownToPlainText(value);
  return {
    preview: truncate(plainText || "Empty Markdown", limit),
    lineCount: value ? value.split(/\r?\n/).length : 0,
    charCount: value.length,
  };
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}
