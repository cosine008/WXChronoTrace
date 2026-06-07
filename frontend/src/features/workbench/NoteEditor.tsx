import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, Loader2, NotebookPen, PencilLine } from "lucide-react";

import {
  createNote,
  updateNote,
  type CreateNotePayload,
  type NoteStage,
  type NoteStatus,
  type UpdateNotePayload,
  type WorkbenchNoteItem,
} from "@/api/workbench";
import { EmptyState } from "@/components/feedback";
import { SafeMarkdown } from "@/components/markdown/SafeMarkdown";
import { useNotification } from "@/components/notifications";
import {
  CheckboxRow,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  ModeButton,
} from "@/features/workbench/NoteFormControls";
import {
  NOTE_STAGE_LABELS,
  NOTE_STATUS_LABELS,
  getSafeNoteDetail,
} from "@/features/workbench/noteMeta";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";

const NOTE_STAGE_OPTIONS = Object.entries(NOTE_STAGE_LABELS) as Array<[NoteStage, string]>;
const NOTE_STATUS_OPTIONS = Object.entries(NOTE_STATUS_LABELS) as Array<[NoteStatus, string]>;

type EditorMode = "edit" | "preview";

type FormState = {
  title: string;
  summary: string;
  tagsText: string;
  is_pinned: boolean;
  is_sensitive: boolean;
  stage: NoteStage;
  status: NoteStatus;
  markdown_content: string;
};

export function NoteEditor(props: {
  item?: WorkbenchNoteItem | null;
  disabled?: boolean;
  onCancel: () => void;
  onSaved: (item: WorkbenchNoteItem) => void;
  onPendingChange?: (pending: boolean, noteId: number | null) => void;
}) {
  const { item, disabled = false, onCancel, onPendingChange, onSaved } = props;
  const notify = useNotification();
  const [form, setForm] = useState<FormState>(() => buildFormState(item ?? null));
  const [mode, setMode] = useState<EditorMode>("edit");
  const noteId = item?.id ?? null;
  const isEditing = noteId !== null;

  const mutation = useMutation({
    mutationFn: () => {
      if (item) {
        return updateNote(item.id, buildUpdatePayload(form));
      }
      return createNote(buildCreatePayload(form));
    },
    onMutate: () => {
      onPendingChange?.(true, noteId);
    },
    onSuccess: (item) => {
      notify.success({
        title: isEditing ? "笔记已更新" : "笔记已创建",
        message: item.title,
      });
      onSaved(item);
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: isEditing ? "笔记更新失败" : "笔记创建失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
    onSettled: () => {
      onPendingChange?.(false, noteId);
    },
  });

  useEffect(() => {
    return () => {
      onPendingChange?.(false, noteId);
    };
  }, [noteId, onPendingChange]);

  const formDisabled = Boolean(disabled || mutation.isPending);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      notify.error({ title: "保存失败", message: "标题不能为空" });
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid min-w-0 gap-5" onSubmit={handleSubmit}>
      <section className="grid min-w-0 gap-4 border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid min-w-0 gap-1">
            <h3 className="text-sm font-semibold text-foreground">
              {isEditing ? "编辑笔记" : "新建笔记"}
            </h3>
            <p className="text-xs text-muted-foreground">
              维护标题、标签、阶段与状态，正文使用 Markdown。
            </p>
          </div>
          <div className="grid grid-cols-2 border border-border p-1 sm:inline-flex">
            <ModeButton
              active={mode === "edit"}
              icon={<PencilLine className="size-4" aria-hidden />}
              label="编辑"
              disabled={formDisabled}
              onClick={() => setMode("edit")}
            />
            <ModeButton
              active={mode === "preview"}
              icon={<Eye className="size-4" aria-hidden />}
              label="预览"
              disabled={formDisabled}
              onClick={() => setMode("preview")}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <LabeledInput
            label="标题"
            required
            value={form.title}
            disabled={formDisabled}
            onChange={(value) => updateForm("title", value)}
          />
          <LabeledInput
            label="标签"
            value={form.tagsText}
            disabled={formDisabled}
            onChange={(value) => updateForm("tagsText", value)}
            placeholder="用逗号、中文逗号或换行分隔"
          />
          <LabeledTextarea
            label="摘要"
            value={form.summary}
            disabled={formDisabled}
            onChange={(value) => updateForm("summary", value)}
            rows={3}
            className="md:col-span-2"
          />
          <LabeledSelect
            label="阶段"
            value={form.stage}
            disabled={formDisabled}
            onChange={(value) => updateForm("stage", value as NoteStage)}
            options={NOTE_STAGE_OPTIONS}
          />
          <LabeledSelect
            label="状态"
            value={form.status}
            disabled={formDisabled}
            onChange={(value) => updateForm("status", value as NoteStatus)}
            options={NOTE_STATUS_OPTIONS}
          />
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <CheckboxRow
            label="置顶"
            checked={form.is_pinned}
            disabled={formDisabled}
            onChange={(checked) => updateForm("is_pinned", checked)}
          />
          <CheckboxRow
            label="敏感笔记"
            checked={form.is_sensitive}
            disabled={formDisabled}
            onChange={(checked) => updateForm("is_sensitive", checked)}
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid min-w-0 gap-1">
            <h3 className="text-sm font-semibold text-foreground">Markdown 正文</h3>
            <p className="text-xs text-muted-foreground">
              支持 GFM 语法，预览经过 SafeMarkdown 安全渲染。
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {form.markdown_content.length} chars
          </span>
        </div>

        {mode === "edit" ? (
          <textarea
            value={form.markdown_content}
            disabled={formDisabled}
            onChange={(event) => updateForm("markdown_content", event.target.value)}
            rows={16}
            aria-label="Markdown 正文"
            className="min-h-0 w-full min-w-0 resize-y border border-border bg-transparent px-3 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        ) : form.markdown_content.trim() ? (
          <div className="min-w-0 overflow-hidden border border-border px-3 py-3">
            <SafeMarkdown value={form.markdown_content} className="max-w-none" />
          </div>
        ) : (
          <EmptyState
            minH="min-h-40"
            title="预览为空"
            description="当前笔记正文还没有内容，切换回编辑模式后可以继续填写。"
          />
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={formDisabled}
          className="inline-flex h-10 items-center justify-center border border-border px-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="取消编辑笔记"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={formDisabled || !form.title.trim()}
          className="inline-flex h-10 items-center justify-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={isEditing ? "保存笔记" : "创建笔记"}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <NotebookPen className="size-4" aria-hidden />
          )}
          {isEditing ? "保存变更" : "创建笔记"}
        </button>
      </div>
    </form>
  );
}

function buildFormState(item: WorkbenchNoteItem | null): FormState {
  const detail = item ? getSafeNoteDetail(item) : null;
  return {
    title: item?.title ?? "",
    summary: item?.summary ?? "",
    tagsText: item?.tags.join(", ") ?? "",
    is_pinned: item?.is_pinned ?? false,
    is_sensitive: item?.is_sensitive ?? false,
    stage: detail?.stage ?? "other",
    status: detail?.status ?? "normal",
    markdown_content: detail?.markdown_content ?? "",
  };
}

function buildCreatePayload(form: FormState): CreateNotePayload {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    tags: parseTags(form.tagsText),
    is_pinned: form.is_pinned,
    is_sensitive: form.is_sensitive,
    markdown_content: form.markdown_content,
    stage: form.stage,
    status: form.status,
  };
}

function buildUpdatePayload(form: FormState): UpdateNotePayload {
  return buildCreatePayload(form);
}

function parseTags(text: string) {
  return [...new Set(text.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean))];
}
