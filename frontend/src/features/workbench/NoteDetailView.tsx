import { FileText, NotebookPen, Pin, ShieldAlert } from "lucide-react";

import type { WorkbenchNoteItem } from "@/api/workbench";
import { EmptyState } from "@/components/feedback";
import { SafeMarkdown } from "@/components/markdown/SafeMarkdown";
import { RelationPanel } from "@/features/workbench/RelationPanel";
import {
  NOTE_STAGE_LABELS,
  NOTE_STATUS_LABELS,
  formatWorkbenchDateTime,
  getSafeNoteDetail,
} from "@/features/workbench/noteMeta";

export function NoteDetailView(props: { item: WorkbenchNoteItem }) {
  const detail = getSafeNoteDetail(props.item);

  return (
    <div className="grid min-w-0 gap-5">
      <section className="grid min-w-0 gap-3 border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <InfoBadge icon={FileText} label="笔记" />
          <InfoBadge icon={NotebookPen} label={NOTE_STAGE_LABELS[detail.stage]} />
          <InfoBadge icon={NotebookPen} label={NOTE_STATUS_LABELS[detail.status]} />
          {props.item.is_pinned && <InfoBadge icon={Pin} label="置顶" />}
          {props.item.is_sensitive && (
            <InfoBadge icon={ShieldAlert} label="敏感笔记" emphasis />
          )}
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <MetaBlock label="摘要" value={props.item.summary || "未填写摘要"} />
          <MetaBlock
            label="标签"
            value={
              props.item.tags.length > 0
                ? props.item.tags.map((tag) => `#${tag}`).join(" ")
                : "暂无标签"
            }
          />
          <MetaBlock label="阶段" value={NOTE_STAGE_LABELS[detail.stage]} />
          <MetaBlock label="状态" value={NOTE_STATUS_LABELS[detail.status]} />
          <MetaBlock label="更新时间" value={formatWorkbenchDateTime(props.item.updated_at)} />
          <MetaBlock label="创建时间" value={formatWorkbenchDateTime(props.item.created_at)} />
        </div>
      </section>

      <section className="grid min-w-0 gap-3 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">Markdown 正文</h3>
        {detail.markdown_content.trim() ? (
          <div className="min-w-0 overflow-hidden border border-border px-3 py-3">
            <SafeMarkdown value={detail.markdown_content} className="max-w-none" />
          </div>
        ) : (
          <EmptyState
            minH="min-h-32"
            title="正文为空"
            description="当前笔记还没有 Markdown 内容，可以进入编辑模式继续补充。"
          />
        )}
      </section>

      <section className="grid min-w-0 gap-3 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">关联信息</h3>
        <RelationPanel links={props.item.links} />
      </section>
    </div>
  );
}

function InfoBadge(props: {
  icon: typeof FileText;
  label: string;
  emphasis?: boolean;
}) {
  const Icon = props.icon;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 border px-2 py-1 text-xs",
        props.emphasis ? "border-foreground text-foreground" : "border-border text-muted-foreground",
      ].join(" ")}
    >
      <Icon className="size-3.5" aria-hidden />
      {props.label}
    </span>
  );
}

function MetaBlock(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border border-border px-3 py-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="break-words text-sm text-foreground">{props.value}</div>
    </div>
  );
}
