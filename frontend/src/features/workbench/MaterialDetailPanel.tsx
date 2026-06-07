import type { ReactNode } from "react";
import { useState } from "react";
import { Download, Eye, Loader2, ShieldAlert, Trash2 } from "lucide-react";

import type { WorkbenchMaterialItem } from "@/api/workbench";
import { EmptyState } from "@/components/feedback";
import { formatFileSize } from "@/features/current-view/fileAssets";
import {
  canPreviewMaterial,
  formatMaterialPreviewStatus,
  formatMaterialTypeLabel,
  getMaterialDetail,
  getMaterialDisplayTitle,
  getMaterialTypeKey,
} from "@/features/workbench/materialMeta";
import {
  buildMaterialMetadataForm,
  type MaterialMetadataForm,
} from "@/features/workbench/materialPageUtils";
import { CheckboxRow, LabeledInput, LabeledTextarea } from "@/features/workbench/NoteFormControls";
import { formatWorkbenchDateTime } from "@/features/workbench/noteMeta";
import { RelationPanel } from "@/features/workbench/RelationPanel";

interface MaterialDetailPanelProps {
  item: WorkbenchMaterialItem;
  pending: boolean;
  disabled: boolean;
  onSave: (item: WorkbenchMaterialItem, form: MaterialMetadataForm) => Promise<void>;
}

export function MaterialDetailPanel(props: MaterialDetailPanelProps) {
  const detail = getMaterialDetail(props.item);
  const [form, setForm] = useState(() => buildMaterialMetadataForm(props.item));

  return (
    <div className="grid min-w-0 gap-5">
      <form
        className="grid min-w-0 gap-4 border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void props.onSave(props.item, form).catch(() => {});
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid min-w-0 gap-1">
            <h3 className="text-sm font-semibold text-foreground">材料元数据</h3>
            <p className="text-xs text-muted-foreground">可更新标题、说明、标签与敏感标记。</p>
          </div>
          {props.item.is_sensitive && (
            <span className="inline-flex items-center gap-1 border border-foreground px-2 py-1 text-xs text-foreground">
              <ShieldAlert className="size-3.5" aria-hidden />
              敏感材料
            </span>
          )}
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <LabeledInput
            label="标题"
            required
            value={form.title}
            disabled={props.pending || props.disabled}
            onChange={(value) => setForm((current) => ({ ...current, title: value }))}
          />
          <LabeledInput
            label="标签"
            value={form.tagsText}
            disabled={props.pending || props.disabled}
            placeholder="用逗号、中文逗号或换行分隔"
            onChange={(value) => setForm((current) => ({ ...current, tagsText: value }))}
          />
          <LabeledTextarea
            label="说明"
            rows={4}
            className="md:col-span-2"
            value={form.description}
            disabled={props.pending || props.disabled}
            onChange={(value) => setForm((current) => ({ ...current, description: value }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <CheckboxRow
            label="敏感材料"
            checked={form.isSensitive}
            disabled={props.pending || props.disabled}
            onChange={(checked) => setForm((current) => ({ ...current, isSensitive: checked }))}
          />
          <button
            type="submit"
            disabled={props.pending || props.disabled || !form.title.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            保存元数据
          </button>
        </div>
      </form>

      <section className="grid min-w-0 gap-3 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">文件信息</h3>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <MetaBlock label="原文件名" value={detail?.original_name || "未记录"} />
          <MetaBlock label="文件类型" value={formatMaterialTypeLabel(getMaterialTypeKey(props.item))} />
          <MetaBlock label="文件大小" value={formatFileSize(detail?.size ?? 0)} />
          <MetaBlock label="MIME 类型" value={detail?.content_type || "未记录"} />
          <MetaBlock
            label="预览状态"
            value={formatMaterialPreviewStatus(detail?.preview_status ?? "none")}
          />
          <MetaBlock label="更新时间" value={formatWorkbenchDateTime(props.item.updated_at)} />
          <MetaBlock label="创建时间" value={formatWorkbenchDateTime(props.item.created_at)} />
          <MetaBlock label="校验值" value={detail?.checksum || "未记录"} />
        </div>
      </section>

      <section className="grid min-w-0 gap-3 border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">关联信息</h3>
        <RelationPanel links={props.item.links} />
      </section>
    </div>
  );
}

export function MaterialPreview(props: { item: WorkbenchMaterialItem }) {
  const detail = getMaterialDetail(props.item);
  if (!detail?.preview_url) {
    return (
      <EmptyState
        minH="min-h-48"
        title="当前材料没有可用预览"
        description="请改用下载查看原文件。"
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {props.item.is_sensitive && (
        <div className="border border-[var(--color-status-warning)]/40 px-3 py-2 text-xs text-muted-foreground">
          敏感材料预览仅在你显式点击后显示，列表页不会自动渲染缩略图或内容。
        </div>
      )}
      <div className="flex min-h-[55vh] min-w-0 items-center justify-center border border-border bg-card p-3">
        <img
          src={detail.preview_url}
          alt={props.item.is_sensitive ? getMaterialDisplayTitle(props.item) : detail.original_name}
          className="max-h-[70vh] max-w-full object-contain"
        />
      </div>
    </div>
  );
}

export function MaterialDrawerActions(props: {
  item: WorkbenchMaterialItem;
  deleting: boolean;
  saving: boolean;
  downloading: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const busy = props.deleting || props.saving;

  return (
    <>
      {canPreviewMaterial(props.item) && (
        <DrawerActionButton
          label="预览"
          icon={<Eye className="size-4" aria-hidden />}
          disabled={busy}
          onClick={props.onPreview}
        />
      )}
      <DrawerActionButton
        label="下载"
        icon={<Download className="size-4" aria-hidden />}
        loading={props.downloading}
        disabled={busy || props.downloading}
        onClick={props.onDownload}
      />
      <DrawerActionButton
        label="删除"
        tone="destructive"
        icon={<Trash2 className="size-4" aria-hidden />}
        loading={props.deleting}
        disabled={busy}
        onClick={props.onDelete}
      />
    </>
  );
}

export function DrawerActionButton(props: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "default" | "destructive";
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        "inline-flex h-8 min-w-0 items-center justify-center gap-1 whitespace-nowrap border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60",
        props.tone === "destructive"
          ? "border-[var(--color-status-error)] text-[var(--color-status-error)]"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
      ].join(" ")}
    >
      {props.loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : props.icon}
      {props.label}
    </button>
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
