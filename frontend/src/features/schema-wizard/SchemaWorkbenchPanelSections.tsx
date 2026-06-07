import { type ChangeEvent, type RefObject } from "react";
import { Loader2, NotebookPen, Search, Upload, X } from "lucide-react";

import type { WorkbenchItem, WorkbenchItemType } from "@/api/workbench";
import {
  MATERIAL_ACCEPT,
  MATERIAL_ALLOWED_LABEL,
  MATERIAL_MAX_FILE_SIZE_LABEL,
} from "@/features/workbench/materialMeta";
import { formatFileSize } from "@/features/current-view/fileAssets";
import { cn } from "@/lib/utils";
import {
  SEARCH_FILTERS,
  SEARCH_RESULT_LIMIT,
} from "./schemaWorkbenchMeta";
import { WorkbenchItemRow } from "./SchemaWorkbenchItemRow";

export function PendingWorkbenchItems(props: {
  disabled?: boolean;
  items: WorkbenchItem[];
  onRemove: (id: number) => void;
}) {
  return (
    <div className="grid gap-2 border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">待关联内容</div>
        <div className="font-mono text-[11px] text-muted-foreground">{props.items.length} 项</div>
      </div>
      {props.items.length === 0 ? (
        <div className="text-xs text-muted-foreground">还没有待关联的资料、笔记或材料。</div>
      ) : (
        <div className="grid gap-2">
          {props.items.map((item) => (
            <WorkbenchItemRow
              key={item.id}
              item={item}
              actionLabel="移除"
              disabled={props.disabled}
              onAction={() => props.onRemove(item.id)}
              actionIcon={<X className="size-3.5" aria-hidden />}
              actionClassName="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-border text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkbenchSearchSection(props: {
  disabled?: boolean;
  query: string;
  filter: "all" | WorkbenchItemType;
  submitted: boolean;
  pending: boolean;
  results: WorkbenchItem[];
  selectedIds: ReadonlySet<number>;
  errorMessage?: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: "all" | WorkbenchItemType) => void;
  onSubmit: () => void;
  onToggleItem: (item: WorkbenchItem, enabled: boolean) => void;
}) {
  return (
    <section className="grid gap-3 border border-border bg-card p-3">
      <div className="grid gap-1">
        <div className="text-xs font-medium text-foreground">搜索现有工作台</div>
        <p className="text-xs text-muted-foreground">选中的项目会在建表成功后自动关联。</p>
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {SEARCH_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={props.disabled}
              aria-pressed={props.filter === item.key}
              onClick={() => props.onFilterChange(item.key)}
              className={cn(
                "inline-flex h-7 items-center border border-border px-2 text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40",
                props.filter === item.key && "border-foreground bg-foreground text-background"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex items-center gap-2 border border-border px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              value={props.query}
              disabled={props.disabled}
              onChange={(event) => props.onQueryChange(event.target.value)}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="搜索资料、笔记、材料"
            />
          </label>
          <button
            type="button"
            disabled={props.disabled || props.pending || !props.query.trim()}
            onClick={props.onSubmit}
            className="inline-flex h-9 items-center justify-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-40"
            data-testid="schema-wizard-workbench-search-button"
          >
            {props.pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            搜索
          </button>
        </div>
      </div>

      {!props.submitted ? (
        <div className="text-xs text-muted-foreground">输入关键词后选择要关联的现有项目。</div>
      ) : props.errorMessage ? (
        <div className="border border-[var(--color-status-error)]/40 px-3 py-2 text-xs text-[var(--color-status-error)]">
          {props.errorMessage}
        </div>
      ) : props.results.length === 0 ? (
        <div className="text-xs text-muted-foreground">没有找到匹配结果。</div>
      ) : (
        <div className="divide-y divide-border border border-border">
          {props.results.slice(0, SEARCH_RESULT_LIMIT).map((item) => {
            const selected = props.selectedIds.has(item.id);
            return (
              <WorkbenchItemRow
                key={item.id}
                item={item}
                actionLabel={selected ? "已选" : "加入关联"}
                disabled={props.disabled}
                actionClassName={cn(
                  "inline-flex h-8 items-center justify-center border px-3 text-xs",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                  props.disabled && "opacity-40"
                )}
                onAction={() => props.onToggleItem(item, !selected)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function WorkbenchQuickNoteSection(props: {
  disabled?: boolean;
  pending: boolean;
  content: string;
  error: string;
  onContentChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="grid gap-3 border border-border bg-card p-3">
      <div className="grid gap-1">
        <div className="text-xs font-medium text-foreground">快速记录笔记</div>
        <p className="text-xs text-muted-foreground">先保存未关联笔记，建表成功后再自动补链。</p>
      </div>
      <textarea
        value={props.content}
        disabled={props.disabled || props.pending}
        onChange={(event) => props.onContentChange(event.target.value)}
        rows={4}
        className="min-h-24 resize-y border border-border bg-background px-3 py-2 text-sm outline-none"
        placeholder="记录当前建表背景、规则假设或待补充材料"
      />
      {props.error && <div className="text-xs text-[var(--color-status-error)]">{props.error}</div>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={props.disabled || props.pending || !props.content.trim()}
          onClick={props.onSubmit}
          className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-40"
          data-testid="schema-wizard-workbench-quick-note-button"
        >
          {props.pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <NotebookPen className="size-4" aria-hidden />
          )}
          保存笔记
        </button>
      </div>
    </section>
  );
}

export function WorkbenchMaterialUploadSection({
  disabled,
  pending,
  file,
  title,
  description,
  isSensitive,
  error,
  onFileChange,
  onTitleChange,
  onDescriptionChange,
  onSensitiveChange,
  onSubmit,
  inputRef,
}: {
  disabled?: boolean;
  pending: boolean;
  file: File | null;
  title: string;
  description: string;
  isSensitive: boolean;
  error: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSensitiveChange: (checked: boolean) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <section className="grid gap-3 border border-border bg-card p-3">
      <div className="grid gap-1">
        <div className="text-xs font-medium text-foreground">上传材料</div>
        <p className="text-xs text-muted-foreground">
          支持 {MATERIAL_ALLOWED_LABEL}，单文件不超过 {MATERIAL_MAX_FILE_SIZE_LABEL}。
        </p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">文件</span>
        <input
          ref={inputRef}
          type="file"
          accept={MATERIAL_ACCEPT}
          disabled={disabled || pending}
          onChange={onFileChange}
          className="block w-full text-sm file:mr-3 file:h-9 file:border-0 file:bg-foreground file:px-3 file:text-background disabled:opacity-60"
        />
      </label>
      {file && (
        <div className="grid gap-1 border border-border bg-background px-3 py-2">
          <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
          <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
        </div>
      )}
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">标题覆盖（可选）</span>
        <input
          value={title}
          disabled={disabled || pending}
          onChange={(event) => onTitleChange(event.target.value)}
          className="h-9 border border-border bg-background px-3 outline-none"
          placeholder="默认使用材料标题"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">说明（可选）</span>
        <textarea
          value={description}
          disabled={disabled || pending}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={3}
          className="min-h-20 resize-y border border-border bg-background px-3 py-2 outline-none"
          placeholder="说明材料用途或来源"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={isSensitive}
          disabled={disabled || pending}
          onChange={(event) => onSensitiveChange(event.target.checked)}
        />
        标记为敏感材料
      </label>
      {error && <div className="text-xs text-[var(--color-status-error)]">{error}</div>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={disabled || pending || !file}
          onClick={onSubmit}
          className="inline-flex h-9 items-center gap-2 bg-foreground px-3 text-sm text-background disabled:opacity-40"
          data-testid="schema-wizard-workbench-upload-button"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          上传材料
        </button>
      </div>
    </section>
  );
}
