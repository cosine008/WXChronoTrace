import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  quickCaptureNote,
  searchWorkbench,
  uploadMaterial,
  type WorkbenchItem,
  type WorkbenchItemType,
} from "@/api/workbench";
import { useNotification } from "@/components/notifications";
import { workbenchKeys } from "@/features/workbench/useWorkbenchQueries";
import { validateMaterialFile } from "@/features/workbench/materialMeta";
import { extractApiError } from "@/lib/api";
import { formatApiErrorDetail } from "@/lib/apiErrorFormat";
import {
  PendingWorkbenchItems,
  WorkbenchMaterialUploadSection,
  WorkbenchQuickNoteSection,
  WorkbenchSearchSection,
} from "./SchemaWorkbenchPanelSections";

interface SchemaWorkbenchPanelProps {
  disabled?: boolean;
  pendingItems: WorkbenchItem[];
  onBusyChange: (busy: boolean) => void;
  onTogglePendingItem: (item: WorkbenchItem, enabled: boolean) => void;
  onRemovePendingItem: (id: number) => void;
}

export function SchemaWorkbenchPanel(props: SchemaWorkbenchPanelProps) {
  const notify = useNotification();
  const queryClient = useQueryClient();
  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const saveBusyCountRef = useRef(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | WorkbenchItemType>("all");
  const [submitted, setSubmitted] = useState(false);
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [quickNoteError, setQuickNoteError] = useState("");
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialSensitive, setMaterialSensitive] = useState(false);
  const [materialError, setMaterialError] = useState("");
  const pendingItemIds = useMemo(
    () => new Set(props.pendingItems.map((item) => item.id)),
    [props.pendingItems]
  );
  const searchMutation = useMutation({
    mutationFn: (payload: { q: string; type?: WorkbenchItemType }) => searchWorkbench(payload),
  });
  const quickNoteMutation = useMutation({
    mutationFn: (content: string) => quickCaptureNote({ content }),
    onSuccess: async (response) => {
      setQuickNoteContent("");
      setQuickNoteError("");
      props.onTogglePendingItem(response.item, true);
      notify.success({
        title: "工作台笔记已暂存",
        message: `${response.item.title} 将在建表成功后自动关联`,
      });
      if (response.warning) {
        notify.info({ title: "已保存，但有提示", message: response.warning });
      }
      await queryClient.invalidateQueries({ queryKey: workbenchKeys.all });
    },
    onError: (error) => {
      const apiError = extractApiError(error);
      notify.error({
        title: "快速记录失败",
        message: apiError.message,
        code: apiError.code,
        detail: formatApiErrorDetail(apiError.details),
      });
    },
  });
  const materialMutation = useMutation({
    mutationFn: async () => {
      if (!materialFile) throw new Error("missing material file");
      const formData = new FormData();
      formData.append("file", materialFile);
      if (materialTitle.trim()) formData.append("title", materialTitle.trim());
      if (materialDescription.trim()) {
        formData.append("summary", materialDescription.trim());
        formData.append("description", materialDescription.trim());
      }
      formData.append("is_sensitive", String(materialSensitive));
      return uploadMaterial(formData);
    },
    onSuccess: async (item) => {
      resetMaterialDraft();
      props.onTogglePendingItem(item, true);
      notify.success({
        title: "材料已上传",
        message: `${item.is_sensitive ? `敏感材料 #${item.id}` : item.title} 将在建表成功后自动关联`,
      });
      await queryClient.invalidateQueries({ queryKey: workbenchKeys.all });
    },
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

  function resetSearchDraft() {
    setSubmitted(false);
    searchMutation.reset();
  }

  function handleSearch() {
    const keyword = query.trim();
    if (!keyword || props.disabled) return;
    setSubmitted(true);
    searchMutation.mutate({
      q: keyword,
      type: filter === "all" ? undefined : filter,
    });
  }

  function handleQuickNoteSubmit() {
    const content = quickNoteContent.trim();
    if (!content) {
      setQuickNoteError("请输入要记录的内容。");
      return;
    }
    setQuickNoteError("");
    const finishBusy = startBusyTracking();
    quickNoteMutation.mutate(content, {
      onSettled: finishBusy,
    });
  }

  function handleMaterialSubmit() {
    if (!materialFile) {
      setMaterialError("请选择要上传的材料文件。");
      return;
    }
    const fileError = validateMaterialFile(materialFile);
    if (fileError) {
      setMaterialError(fileError);
      return;
    }
    setMaterialError("");
    const finishBusy = startBusyTracking();
    materialMutation.mutate(undefined, {
      onSettled: finishBusy,
    });
  }

  function resetMaterialDraft() {
    setMaterialFile(null);
    setMaterialTitle("");
    setMaterialDescription("");
    setMaterialSensitive(false);
    setMaterialError("");
    if (materialInputRef.current) materialInputRef.current.value = "";
  }

  function startBusyTracking() {
    saveBusyCountRef.current += 1;
    props.onBusyChange(true);
    return () => {
      saveBusyCountRef.current = Math.max(0, saveBusyCountRef.current - 1);
      props.onBusyChange(saveBusyCountRef.current > 0);
    };
  }

  return (
    <aside className="grid gap-4 xl:sticky xl:top-6 xl:self-start">
      <section
        className="nd-interactive-surface grid gap-4 border border-border bg-background p-4"
        data-testid="schema-wizard-workbench-panel"
      >
        <div className="grid gap-1">
          <div className="text-sm font-semibold text-foreground">工作台关联</div>
          <p className="text-xs leading-5 text-muted-foreground">
            这里只保存待关联内容。建表成功后会自动补链，不参与字段生成或公式推断。
          </p>
        </div>

        <PendingWorkbenchItems
          disabled={props.disabled}
          items={props.pendingItems}
          onRemove={props.onRemovePendingItem}
        />
        <WorkbenchSearchSection
          disabled={props.disabled}
          query={query}
          filter={filter}
          submitted={submitted}
          pending={searchMutation.isPending}
          results={searchMutation.data?.results ?? []}
          selectedIds={pendingItemIds}
          errorMessage={searchMutation.isError ? extractApiError(searchMutation.error).message : ""}
          onQueryChange={(value) => {
            setQuery(value);
            resetSearchDraft();
          }}
          onFilterChange={(value) => {
            setFilter(value);
            resetSearchDraft();
          }}
          onSubmit={handleSearch}
          onToggleItem={props.onTogglePendingItem}
        />
        <WorkbenchQuickNoteSection
          disabled={props.disabled}
          pending={quickNoteMutation.isPending}
          content={quickNoteContent}
          error={quickNoteError}
          onContentChange={(value) => {
            setQuickNoteContent(value);
            if (quickNoteError) setQuickNoteError("");
          }}
          onSubmit={handleQuickNoteSubmit}
        />
        <WorkbenchMaterialUploadSection
          disabled={props.disabled}
          pending={materialMutation.isPending}
          file={materialFile}
          title={materialTitle}
          description={materialDescription}
          isSensitive={materialSensitive}
          error={materialError}
          inputRef={materialInputRef}
          onFileChange={(event) => {
            setMaterialFile(event.target.files?.[0] ?? null);
            setMaterialError("");
            event.target.value = "";
          }}
          onTitleChange={setMaterialTitle}
          onDescriptionChange={setMaterialDescription}
          onSensitiveChange={setMaterialSensitive}
          onSubmit={handleMaterialSubmit}
        />
      </section>
    </aside>
  );
}
