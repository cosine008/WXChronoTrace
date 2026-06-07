import type { ReactNode } from "react";
import { Loader2, Tags } from "lucide-react";

import { cn } from "@/lib/utils";

export function WorkbenchToolbar(props: {
  children: ReactNode;
  summary?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 items-end gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 sm:gap-4 md:px-5",
        props.className
      )}
    >
      {props.children}
      {props.summary && (
        <div className="grid min-w-0 content-end gap-1 text-[13px] text-muted-foreground sm:col-span-2 md:col-span-1">
          {props.summary}
        </div>
      )}
    </div>
  );
}

export function WorkbenchFilterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-[13px] text-muted-foreground">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label={props.label}
        className="h-10 w-full min-w-0 border border-border bg-transparent px-3 text-[15px] outline-none"
      >
        {props.options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function WorkbenchTagSearch(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-[13px] text-muted-foreground">{props.label}</span>
      <div className="flex h-10 w-full min-w-0 items-center gap-2 border border-border px-3">
        <Tags className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder}
          aria-label={props.label}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
      </div>
    </label>
  );
}

export function WorkbenchRow(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start md:px-5",
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

export function WorkbenchRowContent(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-3", props.className)}>
      {props.children}
    </div>
  );
}

export function WorkbenchRowActions(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end",
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

export function WorkbenchInlineMeta(props: {
  children: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 text-xs",
        props.emphasis
          ? "border-foreground text-foreground"
          : "border-border text-muted-foreground",
        props.className
      )}
    >
      {props.children}
    </span>
  );
}

export function WorkbenchTagList(props: {
  tags: string[];
  emptyLabel?: string;
}) {
  if (props.tags.length === 0) {
    return <span className="text-[13px] text-muted-foreground">{props.emptyLabel ?? "暂无标签"}</span>;
  }

  return (
    <>
      {props.tags.map((tag) => (
        <span
          key={tag}
          className="max-w-full break-all border border-border px-2 py-1 text-[13px] text-muted-foreground"
        >
          #{tag}
        </span>
      ))}
    </>
  );
}

export function WorkbenchMetaLine(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground", props.className)}>
      {props.children}
    </div>
  );
}

export function WorkbenchRowActionButton(props: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "default" | "destructive";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={cn(
        "inline-flex h-9 min-w-0 items-center justify-center gap-2 whitespace-nowrap border px-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-60",
        props.tone === "destructive"
          ? "border-[var(--color-status-error)] text-[var(--color-status-error)]"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
        props.className
      )}
      aria-label={props.label}
    >
      {props.loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : props.icon}
      {props.label}
    </button>
  );
}
