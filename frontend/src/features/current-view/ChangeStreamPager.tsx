export function ChangeStreamPager(props: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPage: (page: number) => void;
}) {
  if (props.totalCount === 0) return null;
  const totalPages = Math.max(props.totalPages, 1);
  return (
    <div className="sticky bottom-0 flex items-center justify-between border-t border-border bg-background px-3 py-2 text-xs text-muted-foreground">
      <span>共 {props.totalCount} 批</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={props.page <= 1}
          onClick={() => props.onPage(props.page - 1)}
          className="border border-border px-2 py-1 disabled:opacity-40"
        >
          上一页
        </button>
        <span className="font-mono">
          {props.page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={props.page >= totalPages}
          onClick={() => props.onPage(props.page + 1)}
          className="border border-border px-2 py-1 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
