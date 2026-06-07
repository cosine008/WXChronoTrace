import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, NotebookPen } from "lucide-react";
import { Link } from "react-router-dom";

import { quickCaptureNote, type WorkbenchItemType, type WorkbenchNoteItem } from "@/api/workbench";
import { useNotification } from "@/components/notifications";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { cn } from "@/lib/utils";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
  WorkbenchStatusTag,
} from "@/features/workbench/WorkbenchObjectMarkers";
import { QuickCaptureReceipt } from "@/features/workbench/QuickCaptureReceipt";

interface QuickCaptureProps {
  onCreated: () => void;
  defaultSchemaId?: number;
}

type QuickCaptureStatus = "idle" | "typing" | "saving" | "success" | "error" | "route";

type CaptureStatusMeta = {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
};

type CaptureOption = {
  type: WorkbenchItemType;
  title: string;
  detail: string;
  hint: string;
  actionLabel: string;
  href?: string;
};

const CAPTURE_OPTIONS: CaptureOption[] = [
  {
    type: "data_card",
    title: "资料",
    detail: "key-value",
    hint: "政策摘录、联系人、常用口径",
    actionLabel: "打开资料卡",
    href: "/workbench/data-cards",
  },
  {
    type: "note",
    title: "笔记",
    detail: "markdown",
    hint: "判断、问题、审批备注",
    actionLabel: "保存笔记",
  },
  {
    type: "material",
    title: "材料",
    detail: "file",
    hint: "附件、截图、上传文件",
    actionLabel: "上传材料",
    href: "/workbench/materials",
  },
];

const STATUS_META: Record<QuickCaptureStatus, CaptureStatusMeta> = {
  idle: { label: "待输入", tone: "neutral" },
  typing: { label: "输入中", tone: "info" },
  saving: { label: "保存中", tone: "info" },
  success: { label: "已入池", tone: "success" },
  error: { label: "需修正", tone: "danger" },
  route: { label: "转入入口", tone: "warning" },
};

export function QuickCapture(props: QuickCaptureProps) {
  const notify = useNotification();
  const [captureType, setCaptureType] = useState<WorkbenchItemType>("note");
  const [content, setContent] = useState("");
  const [localError, setLocalError] = useState("");
  const [createdItem, setCreatedItem] = useState<WorkbenchNoteItem | null>(null);
  const errorId = "workbench-quick-capture-error";
  const stateId = "workbench-quick-capture-state";
  const mutation = useMutation({
    mutationFn: (payload: { content: string; target_schema_id?: number }) => quickCaptureNote(payload),
    onSuccess: (response) => {
      setContent("");
      setLocalError("");
      setCreatedItem(response.item);
      notify.success({
        title: "快速笔记已保存",
        message: `已记录到工作台笔记：${response.item.title}`,
      });
      if (response.warning) {
        notify.info({
          title: "已保存，但有提示",
          message: response.warning,
        });
      }
      props.onCreated();
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      setLocalError(apiError.message);
      setCreatedItem(null);
      notify.error({
        title: "快速捕获失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (captureType !== "note") return;

    const value = content.trim();
    if (!value) {
      setLocalError("请输入要记录的内容。");
      setCreatedItem(null);
      return;
    }

    setLocalError("");
    setCreatedItem(null);
    mutation.mutate(
      props.defaultSchemaId === undefined
        ? { content: value }
        : { content: value, target_schema_id: props.defaultSchemaId }
    );
  }

  const activeOption = CAPTURE_OPTIONS.find((option) => option.type === captureType) ?? CAPTURE_OPTIONS[1];
  const status = getQuickCaptureStatus({
    captureType,
    content,
    localError,
    saving: mutation.isPending,
    createdItem,
  });
  const statusMeta = STATUS_META[status];
  const isNoteCapture = captureType === "note";
  const describedBy = localError ? `${stateId} ${errorId}` : stateId;

  return (
    <form className="grid min-w-0 gap-3" onSubmit={handleSubmit}>
      <fieldset className="grid min-w-0 gap-2">
        <legend className="sr-only">快速捕获类型</legend>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          {CAPTURE_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              aria-pressed={captureType === option.type}
              onClick={() => {
                setCaptureType(option.type);
                setLocalError("");
                setCreatedItem(null);
                mutation.reset();
              }}
              className={cn(
                "grid min-w-0 gap-2 border bg-background p-2 text-left outline-none transition-colors",
                "focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                captureType === option.type
                  ? "border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
              )}
            >
              <WorkbenchKindMarker type={option.type} detail={option.detail} />
              <span className="min-w-0 truncate text-[13px]">{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid min-w-0 gap-3 border border-border bg-background p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type={activeOption.type} detail={activeOption.detail} />
            <WorkbenchStatusTag code="STATE" label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <WorkbenchSignalRail saving={mutation.isPending} />
        </div>

        <label className="grid min-w-0 gap-2">
          <span className="text-[13px] text-muted-foreground">捕获正文</span>
          <textarea
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              if (localError) {
                setLocalError("");
                mutation.reset();
              }
              if (createdItem) setCreatedItem(null);
            }}
            disabled={mutation.isPending || !isNoteCapture}
            rows={5}
            title="快速捕获内容"
            aria-label="快速捕获内容"
            aria-describedby={describedBy}
            placeholder={
              isNoteCapture
                ? "记录刚确认的信息、待追踪问题或下一步动作。"
                : `${activeOption.title}从对应工作区进入。`
            }
            className={cn(
              "min-h-28 w-full min-w-0 resize-y border bg-transparent px-3 py-3 text-[15px] outline-none",
              "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              status === "error" && "border-[var(--color-status-error)]",
              status === "success" && "border-[var(--color-status-new)]/70",
              status !== "error" && status !== "success" && "border-border"
            )}
          />
        </label>

        <p id={stateId} className="text-[13px] text-muted-foreground">
          {isNoteCapture
            ? "保存后进入工作台笔记，并保留为可追踪的个人工作面。"
            : `${activeOption.title}捕获会进入独立工作区，保持字段和附件结构完整。`}
        </p>
      </div>

      {localError && (
        <p id={errorId} aria-live="polite" className="text-[13px] text-[var(--color-status-error)]">
          {localError}
        </p>
      )}

      {createdItem ? <QuickCaptureReceipt item={createdItem} /> : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p className="text-[13px] text-muted-foreground">
          {isNoteCapture
            ? "笔记会以 DOC 条目进入工作台资产池。"
            : `${activeOption.title}入口会复用对应 row 形态。`}
        </p>
        {isNoteCapture ? (
          <button
            type="submit"
            title="保存快速笔记"
            aria-label="保存快速笔记"
            disabled={mutation.isPending || !content.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 border border-foreground bg-foreground px-4 text-[15px] text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <NotebookPen className="size-4" aria-hidden />
            )}
            保存
          </button>
        ) : (
          <Link
            to={activeOption.href ?? "/workbench"}
            title={activeOption.actionLabel}
            aria-label={activeOption.actionLabel}
            className="inline-flex h-10 items-center justify-center gap-2 border border-foreground px-4 text-[15px] text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowUpRight className="size-4" aria-hidden />
            {activeOption.actionLabel}
          </Link>
        )}
      </div>
    </form>
  );
}

function getQuickCaptureStatus(params: {
  captureType: WorkbenchItemType;
  content: string;
  localError: string;
  saving: boolean;
  createdItem: WorkbenchNoteItem | null;
}): QuickCaptureStatus {
  if (params.captureType !== "note") return "route";
  if (params.saving) return "saving";
  if (params.localError) return "error";
  if (params.createdItem) return "success";
  if (params.content.trim()) return "typing";
  return "idle";
}
