import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Loader2,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";

import { searchWorkbench, type WorkbenchItem, type WorkbenchItemType } from "@/api/workbench";
import { EmptyState, ErrorState } from "@/components/feedback";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
} from "@/features/workbench/WorkbenchObjectMarkers";
import {
  getWorkbenchTypeLabel,
  getWorkbenchTypePath,
  safeWorkbenchObjectTitle,
} from "@/features/workbench/workbenchObjectMeta";
import { cn } from "@/lib/utils";

const SEARCH_RESULT_LIMIT = 8;
const FILTERS: Array<{ key: "all" | WorkbenchItemType; label: string }> = [
  { key: "all", label: "全部" },
  { key: "data_card", label: "资料" },
  { key: "note", label: "笔记" },
  { key: "material", label: "材料" },
];
export function WorkbenchSearch() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | WorkbenchItemType>("all");
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: { q: string; type?: WorkbenchItemType }) => searchWorkbench(payload),
  });

  function resetDraftResults() {
    setSubmitted(false);
    mutation.reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    setSubmitted(true);
    mutation.mutate({
      q: keyword,
      type: type === "all" ? undefined : type,
    });
  }

  const results = mutation.data?.results ?? [];
  const visibleResults = results.slice(0, SEARCH_RESULT_LIMIT);

  return (
    <div className="grid gap-4">
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              title={`筛选${filter.label}`}
              aria-label={`筛选${filter.label}`}
              aria-pressed={type === filter.key}
              onClick={() => {
                setType(filter.key);
                resetDraftResults();
              }}
              className={cn(
                "inline-flex h-8 items-center border border-border px-3 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground",
                type === filter.key && "border-foreground bg-foreground text-background"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid min-w-0 gap-2">
            <span className="text-[13px] text-muted-foreground">关键词</span>
            <div className="flex h-10 w-full min-w-0 items-center gap-2 border border-border px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetDraftResults();
                }}
                placeholder="搜索资料、笔记、材料"
                title="搜索工作台"
                aria-label="搜索工作台"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
            </div>
          </label>
          <button
            type="submit"
            title="执行搜索"
            aria-label="执行搜索"
            disabled={mutation.isPending || !query.trim()}
            className="inline-flex h-10 w-full items-center justify-center gap-2 border border-foreground bg-foreground px-4 text-[15px] text-background disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-end"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            搜索
          </button>
        </div>
      </form>

      {!submitted ? (
        <p className="text-[13px] text-muted-foreground">输入关键词后可在资料、笔记和材料中统一检索。</p>
      ) : mutation.isError ? (
        <ErrorState title="搜索失败" error={mutation.error} minH="min-h-28" />
      ) : mutation.isSuccess && visibleResults.length === 0 ? (
        <EmptyState
          minH="min-h-28"
          title="没有找到匹配内容。"
          description="可尝试缩短关键词或切换类型筛选。"
        />
      ) : (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
            <span>结果 {results.length} 项</span>
            {results.length > SEARCH_RESULT_LIMIT && <span>当前展示前 {SEARCH_RESULT_LIMIT} 项</span>}
          </div>
          <div className="divide-y divide-border border border-border">
            {visibleResults.map((item) => (
              <SearchResultRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ item }: { item: WorkbenchItem }) {
  const typePath = getWorkbenchTypePath(item.type);
  const typeLabel = getWorkbenchTypeLabel(item.type);

  return (
    <div className="grid min-w-0 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-4">
      <div className="min-w-0 grid gap-2">
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type={item.type} />
          </div>
          <WorkbenchSignalRail pinned={item.is_pinned} sensitive={item.is_sensitive} />
        </div>
        <div className="truncate text-[15px] font-medium text-foreground">{safeWorkbenchObjectTitle(item)}</div>
        {!item.is_sensitive && item.summary.trim() && (
          <p className="line-clamp-2 text-[13px] text-muted-foreground">{item.summary.trim()}</p>
        )}
        {item.is_sensitive && (
          <p className="text-[13px] text-muted-foreground">敏感结果仅展示标题与类型，不展示正文或字段值。</p>
        )}
      </div>
      <Link
        to={typePath}
        title={`打开${typeLabel}列表`}
        aria-label={`打开${typeLabel}列表`}
        className="inline-flex h-8 items-center justify-center gap-1 border border-border px-2 text-[13px] text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        <ArrowUpRight className="size-3.5" aria-hidden />
        打开
      </Link>
    </div>
  );
}
