import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  createWorkbenchLink,
  deleteWorkbenchItem,
  downloadMaterial,
  updateMaterial,
  uploadMaterial,
  type UpdateMaterialPayload,
  type WorkbenchMaterialItem,
} from "@/api/workbench";
import { listSchemas } from "@/api/schemas";
import { ErrorState, LoadingState } from "@/components/feedback";
import { useNotification } from "@/components/notifications";
import { CurrentViewDrawer } from "@/features/current-view/CurrentViewDrawer";
import {
  DrawerActionButton,
  MaterialDetailPanel,
  MaterialDrawerActions,
  MaterialPreview,
} from "@/features/workbench/MaterialDetailPanel";
import { MaterialList } from "@/features/workbench/MaterialList";
import { MaterialUploader, type MaterialUploadValues } from "@/features/workbench/MaterialUploader";
import {
  canPreviewMaterial,
  getMaterialDetail,
  getMaterialDisplayTitle,
  getMaterialDownloadFilename,
} from "@/features/workbench/materialMeta";
import {
  buildMaterialFormData,
  buildMaterialUpdatePayload,
  invalidateMaterialQueries,
  isMaterialBusy,
  type MaterialMetadataForm,
  withIdToggled,
} from "@/features/workbench/materialPageUtils";
import { WorkbenchChrome, WorkbenchSection } from "@/features/workbench/WorkbenchChrome";
import { useWorkbenchMaterialsQuery } from "@/features/workbench/useWorkbenchQueries";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import { saveBlob } from "@/lib/download";

export function WorkbenchMaterialsPage() {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const materialsQuery = useWorkbenchMaterialsQuery();
  const schemasQuery = useQuery({
    queryKey: ["schemas", { includeArchived: false, ordering: "-last_modified_at" }],
    queryFn: () => listSchemas({ includeArchived: false, ordering: "-last_modified_at" }),
  });
  const [fileTypeFilter, setFileTypeFilter] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [detailItem, setDetailItem] = useState<WorkbenchMaterialItem | null>(null);
  const [previewItem, setPreviewItem] = useState<WorkbenchMaterialItem | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(() => new Set());
  const [savingIds, setSavingIds] = useState<Set<number>>(() => new Set());
  const detailItemRef = useRef<WorkbenchMaterialItem | null>(null);
  const previewItemRef = useRef<WorkbenchMaterialItem | null>(null);
  const deletingIdsRef = useRef<Set<number>>(new Set());
  const savingIdsRef = useRef<Set<number>>(new Set());
  const items = materialsQuery.data?.results ?? [];
  const previewableCount = items.filter((item) => canPreviewMaterial(item)).length;
  const sensitiveCount = items.filter((item) => item.is_sensitive).length;

  useEffect(() => {
    detailItemRef.current = detailItem;
    previewItemRef.current = previewItem;
    deletingIdsRef.current = deletingIds;
    savingIdsRef.current = savingIds;
  }, [deletingIds, detailItem, previewItem, savingIds]);
  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => uploadMaterial(formData),
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "材料上传失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (args: { item: WorkbenchMaterialItem; payload: UpdateMaterialPayload }) =>
      updateMaterial(args.item.id, args.payload),
    onMutate: ({ item }) => setSavingIds((current) => withIdToggled(current, item.id, true)),
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "材料更新失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
    onSettled: (_, __, args) =>
      setSavingIds((current) => withIdToggled(current, args.item.id, false)),
  });
  const deleteMutation = useMutation({
    mutationFn: (item: WorkbenchMaterialItem) => deleteWorkbenchItem(item.id),
    onMutate: (item) => setDeletingIds((current) => withIdToggled(current, item.id, true)),
    onSuccess: async (_, item) => {
      notify.success({ title: "材料已移入回收站", message: getMaterialDisplayTitle(item) });
      setDetailItem((current) => (current?.id === item.id ? null : current));
      setPreviewItem((current) => (current?.id === item.id ? null : current));
      await invalidateMaterialQueries(queryClient, true);
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({ title: "删除失败", message: apiError.message, code: apiError.code });
    },
    onSettled: (_, __, item) => setDeletingIds((current) => withIdToggled(current, item.id, false)),
  });
  async function handleUpload(values: MaterialUploadValues) {
    const item = await uploadMutation.mutateAsync(buildMaterialFormData(values));
    if (values.linkedSchemaId !== null) {
      try {
        await createWorkbenchLink({
          source_item_id: item.id,
          target_schema_id: values.linkedSchemaId,
        });
      } catch (error) {
        notify.info({
          title: "材料已上传，关联未完成",
          message: `${extractApiError(error).message}；可稍后在详情中查看关联状态。`,
        });
      }
    }
    notify.success({ title: "材料已上传", message: getMaterialDisplayTitle(item) });
    await invalidateMaterialQueries(queryClient, false);
  }

  async function handleSave(item: WorkbenchMaterialItem, form: MaterialMetadataForm) {
    if (isMaterialBusy(item.id, deletingIdsRef.current, savingIdsRef.current)) return;
    const updated = await updateMutation.mutateAsync({
      item,
      payload: buildMaterialUpdatePayload(form),
    });
    if (deletingIdsRef.current.has(updated.id)) return;
    if (detailItemRef.current?.id === updated.id) setDetailItem(updated);
    if (previewItemRef.current?.id === updated.id) setPreviewItem(updated);
    notify.success({ title: "材料已更新", message: getMaterialDisplayTitle(updated) });
    await invalidateMaterialQueries(queryClient, false);
  }

  async function handleDownload(item: WorkbenchMaterialItem) {
    if (isMaterialBusy(item.id, deletingIds, savingIds) || downloadingIds.has(item.id)) return;
    setDownloadingIds((current) => withIdToggled(current, item.id, true));
    try {
      saveBlob(await downloadMaterial(item.id), getMaterialDownloadFilename(item));
      notify.success({ title: "下载已开始", message: getMaterialDisplayTitle(item) });
    } catch (error) {
      const apiError = extractApiError(error);
      notify.error({ title: "下载失败", message: apiError.message, code: apiError.code });
    } finally {
      setDownloadingIds((current) => withIdToggled(current, item.id, false));
    }
  }

  async function handleDelete(item: WorkbenchMaterialItem) {
    if (isMaterialBusy(item.id, deletingIds, savingIds)) return;
    const confirmed = await notify.confirm({
      title: "确认删除材料",
      description: `“${getMaterialDisplayTitle(item)}”会被移入回收站，不会立即永久删除。`,
      impactSummary: ["材料会从当前列表移除", "下载与预览入口会失效", "可在回收站确认删除记录"],
      confirmLabel: "移入回收站",
      cancelLabel: "取消",
      tone: "destructive",
    });
    if (confirmed) deleteMutation.mutate(item);
  }

  return (
    <WorkbenchChrome
      title="我的材料"
      subtitle="附件、截图与上传文件"
      meta={
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          共 {items.length} 份 / 可预览 {previewableCount} 份 / 敏感 {sensitiveCount} 份
        </span>
      }
    >
      <WorkbenchSection index="01" title="材料工作区" subtitle="MATERIALS">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="min-w-0">
            {materialsQuery.isLoading ? (
              <LoadingState minH="min-h-56" label="加载材料列表" />
            ) : materialsQuery.isError ? (
              <ErrorState
                title="材料列表加载失败"
                error={materialsQuery.error}
                onRetry={() => materialsQuery.refetch()}
                minH="min-h-56"
              />
            ) : (
              <MaterialList
                items={items}
                fileTypeFilter={fileTypeFilter}
                tagQuery={tagQuery}
                deletingIds={deletingIds}
                savingIds={savingIds}
                downloadingIds={downloadingIds}
                onFileTypeFilterChange={setFileTypeFilter}
                onTagQueryChange={setTagQuery}
                onOpen={(item) =>
                  !isMaterialBusy(item.id, deletingIds, savingIds) && setDetailItem(item)
                }
                onPreview={(item) =>
                  !isMaterialBusy(item.id, deletingIds, savingIds) && setPreviewItem(item)
                }
                onDownload={(item) => void handleDownload(item)}
                onDelete={(item) => void handleDelete(item)}
              />
            )}
          </div>

          <aside className="min-w-0 border-t border-border xl:self-start xl:border-l xl:border-t-0">
            <div className="grid gap-4 px-4 py-4 md:px-5">
              <MaterialUploader
                schemas={schemasQuery.data ?? []}
                schemasLoading={schemasQuery.isLoading}
                schemasError={
                  schemasQuery.isError ? extractApiError(schemasQuery.error).message : null
                }
                pending={uploadMutation.isPending}
                onSubmit={handleUpload}
                onRetrySchemas={() => void schemasQuery.refetch()}
              />
            </div>
          </aside>
        </div>
      </WorkbenchSection>

      <CurrentViewDrawer
        open={Boolean(detailItem)}
        title={detailItem ? getMaterialDisplayTitle(detailItem) : "材料详情"}
        description={
          detailItem?.is_sensitive
            ? "敏感材料，列表页已隐藏原文件名与说明；当前抽屉为显式打开。"
            : getMaterialDetail(detailItem)?.description || detailItem?.summary || "未填写说明"
        }
        meta={detailItem ? `#${detailItem.id}` : undefined}
        actions={
          detailItem ? (
            <MaterialDrawerActions
              item={detailItem}
              deleting={deletingIds.has(detailItem.id)}
              saving={savingIds.has(detailItem.id)}
              downloading={downloadingIds.has(detailItem.id)}
              onPreview={() => setPreviewItem(detailItem)}
              onDownload={() => void handleDownload(detailItem)}
              onDelete={() => void handleDelete(detailItem)}
            />
          ) : null
        }
        onRequestClose={() => setDetailItem(null)}
      >
        {detailItem && (
          <MaterialDetailPanel
            key={`${detailItem.id}-${detailItem.updated_at}`}
            item={detailItem}
            pending={savingIds.has(detailItem.id)}
            disabled={deletingIds.has(detailItem.id)}
            onSave={handleSave}
          />
        )}
      </CurrentViewDrawer>

      <CurrentViewDrawer
        open={Boolean(previewItem)}
        title={previewItem ? `${getMaterialDisplayTitle(previewItem)} 预览` : "图片预览"}
        description={
          previewItem ? (
            <span className="font-mono text-xs text-muted-foreground">
              {previewItem.is_sensitive
                ? `敏感材料 #${previewItem.id}`
                : getMaterialDetail(previewItem)?.original_name || `material-${previewItem.id}`}
            </span>
          ) : undefined
        }
        actions={
          previewItem ? (
            <DrawerActionButton
              label="下载"
              icon={<Download className="size-4" aria-hidden />}
              loading={downloadingIds.has(previewItem.id)}
              disabled={
                downloadingIds.has(previewItem.id) ||
                isMaterialBusy(previewItem.id, deletingIds, savingIds)
              }
              onClick={() => void handleDownload(previewItem)}
            />
          ) : null
        }
        onRequestClose={() => setPreviewItem(null)}
      >
        {previewItem && <MaterialPreview item={previewItem} />}
      </CurrentViewDrawer>
    </WorkbenchChrome>
  );
}
