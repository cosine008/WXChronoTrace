import { useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";

import type { DataSchema } from "@/api/schemas";
import { formatFileSize } from "@/features/current-view/fileAssets";
import {
  CheckboxRow,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
} from "@/features/workbench/NoteFormControls";
import {
  MATERIAL_ACCEPT,
  MATERIAL_ALLOWED_LABEL,
  MATERIAL_MAX_FILE_SIZE_LABEL,
  validateMaterialFile,
} from "@/features/workbench/materialMeta";

export interface MaterialUploadValues {
  file: File;
  title: string;
  description: string;
  tagsText: string;
  isSensitive: boolean;
  linkedSchemaId: number | null;
}

interface MaterialUploaderProps {
  schemas: DataSchema[];
  schemasLoading: boolean;
  schemasError: string | null;
  pending: boolean;
  onSubmit: (values: MaterialUploadValues) => Promise<void>;
  onRetrySchemas: () => void;
}

export function MaterialUploader(props: MaterialUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [linkedSchemaId, setLinkedSchemaId] = useState("");
  const [isSensitive, setIsSensitive] = useState(false);
  const [localError, setLocalError] = useState("");

  const schemaOptions = useMemo<ReadonlyArray<readonly [string, string]>>(
    () => [
      ["", props.schemasLoading ? "加载 Schema 中..." : "不关联数据表"] as const,
      ...props.schemas.map(
        (schema) => [String(schema.id), schema.name.trim() || schema.schema_code] as const
      ),
    ],
    [props.schemas, props.schemasLoading]
  );

  function resetForm() {
    setFile(null);
    setTitle("");
    setDescription("");
    setTagsText("");
    setLinkedSchemaId("");
    setIsSensitive(false);
    setLocalError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setLocalError("请选择要上传的文件。");
      return;
    }
    const fileError = validateMaterialFile(file);
    if (fileError) {
      setLocalError(fileError);
      return;
    }

    setLocalError("");
    try {
      await props.onSubmit({
        file,
        title,
        description,
        tagsText,
        isSensitive,
        linkedSchemaId: linkedSchemaId ? Number(linkedSchemaId) : null,
      });
      resetForm();
    } catch {
      // Error toast is handled by the page mutation.
    }
  }

  return (
    <form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
      <div className="grid min-w-0 gap-1">
        <h3 className="text-sm font-semibold text-foreground">上传材料</h3>
        <p className="text-xs text-muted-foreground">
          文件上传成功后会进入材料列表；若选择关联 Schema，会在上传后补建关联。
        </p>
      </div>

      <section className="grid min-w-0 gap-3 border border-border p-4">
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span>支持格式：{MATERIAL_ALLOWED_LABEL}</span>
          <span>单个文件：{MATERIAL_MAX_FILE_SIZE_LABEL}</span>
        </div>

        <label className="grid min-w-0 gap-2">
          <span className="text-xs text-muted-foreground">文件</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={MATERIAL_ACCEPT}
            disabled={props.pending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setLocalError("");
              event.target.value = "";
            }}
            aria-label="上传文件"
            className="block w-full min-w-0 text-sm file:mr-3 file:h-9 file:border-0 file:bg-foreground file:px-3 file:text-background disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        {file && (
          <div className="grid gap-1 border border-border px-3 py-2">
            <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
            <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
          </div>
        )}

        {localError && (
          <p className="text-xs text-[var(--color-status-error)]" aria-live="polite">
            {localError}
          </p>
        )}
      </section>

      <section className="grid min-w-0 gap-4 border border-border p-4">
        <LabeledInput
          label="标题覆盖（可选）"
          value={title}
          disabled={props.pending}
          placeholder="留空时使用原文件名"
          onChange={setTitle}
        />
        <LabeledTextarea
          label="说明"
          value={description}
          disabled={props.pending}
          rows={4}
          onChange={setDescription}
        />
        <LabeledInput
          label="标签"
          value={tagsText}
          disabled={props.pending}
          placeholder="用逗号、中文逗号或换行分隔"
          onChange={setTagsText}
        />
        <LabeledSelect
          label="关联 Schema"
          value={linkedSchemaId}
          disabled={props.pending || props.schemasLoading || Boolean(props.schemasError)}
          onChange={setLinkedSchemaId}
          options={schemaOptions}
        />

        {props.schemasError && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--color-status-warning)]/40 px-3 py-2 text-xs text-muted-foreground">
            <span>Schema 列表加载失败，当前仍可上传材料，但暂时不能建立关联。</span>
            <button
              type="button"
              onClick={props.onRetrySchemas}
              disabled={props.pending}
              className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              重试
            </button>
          </div>
        )}

        <CheckboxRow
          label="敏感材料"
          checked={isSensitive}
          disabled={props.pending}
          onChange={setIsSensitive}
        />

        <p className="text-xs text-muted-foreground">
          若关联失败，材料本体会保留，并通过提示消息告知你稍后补链。
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={resetForm}
          disabled={props.pending}
          className="inline-flex h-10 items-center justify-center border border-border px-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          清空
        </button>
        <button
          type="submit"
          disabled={props.pending}
          className="inline-flex h-10 items-center justify-center gap-2 border border-foreground bg-foreground px-4 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          上传材料
        </button>
      </div>
    </form>
  );
}
