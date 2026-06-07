import type { WorkbenchLinkSummary, WorkbenchItemType } from "@/api/workbench";
import { Database, FileText, Link2, Lock, Paperclip, TableProperties } from "lucide-react";

import { EmptyState } from "@/components/feedback";

const ITEM_TYPE_META: Record<
  WorkbenchItemType,
  { label: string; icon: typeof Database }
> = {
  data_card: { label: "资料卡", icon: Database },
  note: { label: "笔记", icon: FileText },
  material: { label: "材料", icon: Paperclip },
};

export function RelationPanel(props: { links: WorkbenchLinkSummary[] }) {
  if (props.links.length === 0) {
    return (
      <EmptyState
        minH="min-h-24"
        title="暂无关联"
        description="后续任务会在这里补充关联的创建与删除。"
      />
    );
  }

  return (
    <div className="divide-y divide-border border border-border">
      {props.links.map((link) => (
        <RelationRow key={link.id} link={link} />
      ))}
    </div>
  );
}

function RelationRow(props: { link: WorkbenchLinkSummary }) {
  if (props.link.target_schema) {
    return <SchemaRelationRow link={props.link} />;
  }
  if (props.link.target_item) {
    return <ItemRelationRow link={props.link} />;
  }

  return (
    <div className="grid gap-1 px-3 py-3 text-sm text-muted-foreground sm:px-4">
      <span className="inline-flex items-center gap-2">
        <Link2 className="size-4" aria-hidden />
        关联 #{props.link.id}
      </span>
      <span className="text-xs">目标信息不可用</span>
    </div>
  );
}

function SchemaRelationRow(props: { link: WorkbenchLinkSummary }) {
  const target = props.link.target_schema;
  if (!target) return null;

  return (
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4">
      <div className="min-w-0 grid gap-1">
        <div className="inline-flex items-center gap-2 text-sm text-foreground">
          <TableProperties className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">关联数据表</span>
        </div>
        <div className="truncate text-sm text-muted-foreground">
          {target.accessible ? target.name || `Schema #${target.id}` : "不可访问"}
        </div>
      </div>
      <span className="font-mono text-xs text-muted-foreground">schema #{target.id}</span>
    </div>
  );
}

function ItemRelationRow(props: { link: WorkbenchLinkSummary }) {
  const target = props.link.target_item;
  if (!target) return null;

  const meta =
    target.type && target.type in ITEM_TYPE_META ? ITEM_TYPE_META[target.type] : undefined;
  const Icon = meta?.icon ?? Link2;
  const accessibleLabel = meta?.label ?? "工作台条目";

  return (
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4">
      <div className="min-w-0 grid gap-1">
        <div className="inline-flex items-center gap-2 text-sm text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">工作台条目摘要</span>
          {target.accessible && meta && (
            <span className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {accessibleLabel}
            </span>
          )}
        </div>
        <div className="truncate text-sm text-muted-foreground">
          {target.accessible ? target.title || `条目 #${target.id}` : "不可访问"}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
        {!target.accessible && <Lock className="size-3.5" aria-hidden />}
        item #{target.id}
      </span>
    </div>
  );
}
