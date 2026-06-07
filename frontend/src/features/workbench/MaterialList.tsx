import { useMemo } from "react";
import {
  ArrowUpRight,
  Download,
  Eye,
  Trash2,
} from "lucide-react";
import type { MaterialPreviewStatus, WorkbenchMaterialItem } from "@/api/workbench";
import { EmptyState } from "@/components/feedback";
import { formatFileSize } from "@/features/current-view/fileAssets";
import { formatWorkbenchDateTime } from "@/features/workbench/noteMeta";
import {
  canPreviewMaterial,
  formatMaterialPreviewStatus,
  formatMaterialTypeLabel,
  getMaterialDetail,
  getMaterialDisplayTitle,
  getMaterialListDescription,
  getMaterialTypeKey,
} from "@/features/workbench/materialMeta";
import {
  WorkbenchFilterSelect,
  WorkbenchMetaLine,
  WorkbenchRow,
  WorkbenchRowActionButton,
  WorkbenchRowActions,
  WorkbenchRowContent,
  WorkbenchTagList,
  WorkbenchTagSearch,
  WorkbenchToolbar,
} from "@/features/workbench/WorkbenchLayout";
import {
  WorkbenchKindMarker,
  WorkbenchSignalRail,
  WorkbenchStatusTag,
} from "@/features/workbench/WorkbenchObjectMarkers";
interface MaterialListProps {
  items: WorkbenchMaterialItem[];
  fileTypeFilter: string;
  tagQuery: string;
  deletingIds: ReadonlySet<number>;
  savingIds: ReadonlySet<number>;
  downloadingIds: ReadonlySet<number>;
  onFileTypeFilterChange: (value: string) => void;
  onTagQueryChange: (value: string) => void;
  onOpen: (item: WorkbenchMaterialItem) => void;
  onPreview: (item: WorkbenchMaterialItem) => void;
  onDownload: (item: WorkbenchMaterialItem) => void;
  onDelete: (item: WorkbenchMaterialItem) => void;
}
export function MaterialList(props: MaterialListProps) {
  const filteredItems = useMemo(
    () =>
      props.items
        .filter((item) => matchesFilters(item, props.fileTypeFilter, props.tagQuery))
        .sort(sortMaterials),
    [props.items, props.fileTypeFilter, props.tagQuery]
  );
  const fileTypeOptions = useMemo(() => {
    const options = [...new Set(props.items.map((item) => getMaterialTypeKey(item)))].sort();
    if (props.fileTypeFilter && !options.includes(props.fileTypeFilter)) {
      return [props.fileTypeFilter, ...options];
    }
    return options;
  }, [props.items, props.fileTypeFilter]);
  if (props.items.length === 0) {
    return (
      <EmptyState
        minH="min-h-56"
        align="start"
        title="还没有上传材料"
        description="右侧上传区支持文件、标签、敏感标记与 Schema 关联。"
        className="px-4 py-4 md:px-5"
      />
    );
  }
  return (
    <div className="grid gap-0">
      <WorkbenchToolbar
        className="md:grid-cols-[180px_minmax(0,1fr)_220px]"
        summary={
          <>
            <span>共 {props.items.length} 份，当前显示 {filteredItems.length} 份</span>
            <span>图片预览仅通过显式按钮打开</span>
          </>
        }
      >
        <WorkbenchFilterSelect
          label="文件类型"
          value={props.fileTypeFilter}
          onChange={props.onFileTypeFilterChange}
          options={[
            { value: "", label: "全部类型" },
            ...fileTypeOptions.map((value) => ({
              value,
              label: formatMaterialTypeLabel(value),
            })),
          ]}
        />
        <WorkbenchTagSearch
          label="标签筛选"
          value={props.tagQuery}
          onChange={props.onTagQueryChange}
          placeholder="输入标签关键字"
        />
      </WorkbenchToolbar>

      {filteredItems.length === 0 ? (
        <EmptyState
          minH="min-h-48"
          title="没有符合筛选条件的材料"
          description="可调整文件类型或标签筛选条件。"
        />
      ) : (
        <div className="divide-y divide-border">
          {filteredItems.map((item) => (
            <MaterialRow
              key={item.id}
              item={item}
              deleting={props.deletingIds.has(item.id)}
              saving={props.savingIds.has(item.id)}
              downloading={props.downloadingIds.has(item.id)}
              onOpen={props.onOpen}
              onPreview={props.onPreview}
              onDownload={props.onDownload}
              onDelete={props.onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function MaterialRow(props: {
  item: WorkbenchMaterialItem;
  deleting: boolean;
  saving: boolean;
  downloading: boolean;
  onOpen: (item: WorkbenchMaterialItem) => void;
  onPreview: (item: WorkbenchMaterialItem) => void;
  onDownload: (item: WorkbenchMaterialItem) => void;
  onDelete: (item: WorkbenchMaterialItem) => void;
}) {
  const detail = getMaterialDetail(props.item);
  const previewable = canPreviewMaterial(props.item);
  const busy = props.deleting || props.saving;
  const typeLabel = formatMaterialTypeLabel(getMaterialTypeKey(props.item));
  const previewStatus = detail?.preview_status ?? "none";

  return (
    <WorkbenchRow>
      <WorkbenchRowContent>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WorkbenchKindMarker type="material" detail={typeLabel} />
            <WorkbenchStatusTag
              code="MIME"
              label={detail?.content_type || typeLabel}
              tone="neutral"
            />
            <WorkbenchStatusTag
              code="PREVIEW"
              label={formatMaterialPreviewStatus(previewStatus)}
              tone={materialPreviewTone(previewStatus)}
            />
          </div>
          <WorkbenchSignalRail
            pinned={props.item.is_pinned}
            sensitive={props.item.is_sensitive}
            saving={props.saving}
            preview={previewable}
          />
        </div>

        <div className="grid min-w-0 gap-3 overflow-hidden border border-border bg-background p-3 sm:grid-cols-[92px_minmax(0,1fr)]">
          <div className="grid min-h-20 place-items-center border border-dashed border-border px-2 py-2 text-center">
            <div>
              <div className="font-mono text-sm font-semibold uppercase text-foreground">{typeLabel}</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {formatFileSize(detail?.size ?? 0)}
              </div>
            </div>
          </div>
          <div className="grid min-w-0 content-center gap-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {getMaterialDisplayTitle(props.item)}
            </div>
            {!props.item.is_sensitive && detail?.original_name && detail.original_name !== props.item.title && (
              <div className="truncate text-xs text-muted-foreground">{detail.original_name}</div>
            )}
            <p className="text-sm text-muted-foreground">{getMaterialListDescription(props.item)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <WorkbenchTagList tags={props.item.tags} />
        </div>

        <WorkbenchMetaLine>
          <span>{formatFileSize(detail?.size ?? 0)}</span>
          <span>更新于 {formatWorkbenchDateTime(props.item.updated_at)}</span>
          {detail?.content_type && <span>{detail.content_type}</span>}
        </WorkbenchMetaLine>
      </WorkbenchRowContent>

      <WorkbenchRowActions className="sm:w-[290px]">
        {previewable && (
          <WorkbenchRowActionButton
            label="预览"
            disabled={busy}
            icon={<Eye className="size-4" aria-hidden />}
            onClick={() => props.onPreview(props.item)}
          />
        )}
        <WorkbenchRowActionButton
          label="下载"
          loading={props.downloading}
          disabled={busy || props.downloading}
          icon={<Download className="size-4" aria-hidden />}
          onClick={() => props.onDownload(props.item)}
        />
        <WorkbenchRowActionButton
          label="详情"
          disabled={busy}
          icon={<ArrowUpRight className="size-4" aria-hidden />}
          onClick={() => props.onOpen(props.item)}
        />
        <WorkbenchRowActionButton
          label="删除"
          tone="destructive"
          disabled={busy}
          loading={props.deleting}
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={() => props.onDelete(props.item)}
        />
      </WorkbenchRowActions>
    </WorkbenchRow>
  );
}

function matchesFilters(item: WorkbenchMaterialItem, fileType: string, tagQuery: string) {
  const normalizedTag = tagQuery.trim().toLowerCase();
  if (fileType && getMaterialTypeKey(item) !== fileType) return false;
  if (normalizedTag && !item.tags.some((tag) => tag.toLowerCase().includes(normalizedTag))) {
    return false;
  }
  return true;
}

function sortMaterials(left: WorkbenchMaterialItem, right: WorkbenchMaterialItem) {
  if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1;
  return toTimestamp(right.updated_at) - toTimestamp(left.updated_at);
}

function materialPreviewTone(status: MaterialPreviewStatus) {
  if (status === "image" || status === "text") return "info";
  if (status === "failed") return "danger";
  return "neutral";
}

function toTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
