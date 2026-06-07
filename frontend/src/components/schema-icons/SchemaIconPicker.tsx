import { useState, type FormEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Box,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  Gauge,
  Image,
  Landmark,
  Layers3,
  Package,
  ShieldCheck,
  ShoppingCart,
  Table2,
  Tags,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";

import { uploadSchemaIcon } from "@/api/schemas";
import { extractApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type IconSource = "built-in" | "url" | "upload";

type SchemaIconOption = {
  value: string;
  label: string;
  Icon: LucideIcon;
};

type SchemaIconGroup = {
  code: string;
  title: string;
  options: SchemaIconOption[];
};

const SCHEMA_ICON_GROUPS: SchemaIconGroup[] = [
  {
    code: "ASSET",
    title: "资产 / 物料",
    options: [
      { value: "boxes", label: "资产", Icon: Boxes },
      { value: "package", label: "物料", Icon: Package },
      { value: "warehouse", label: "仓储", Icon: Warehouse },
    ],
  },
  {
    code: "ORG",
    title: "组织 / 人员",
    options: [
      { value: "building-2", label: "组织", Icon: Building2 },
      { value: "users", label: "人员", Icon: Users },
      { value: "briefcase-business", label: "业务", Icon: BriefcaseBusiness },
    ],
  },
  {
    code: "FIN",
    title: "财务 / 采购",
    options: [
      { value: "landmark", label: "财务", Icon: Landmark },
      { value: "shopping-cart", label: "采购", Icon: ShoppingCart },
      { value: "bar-chart-3", label: "统计", Icon: BarChart3 },
      { value: "gauge", label: "指标", Icon: Gauge },
    ],
  },
  {
    code: "PLAN",
    title: "项目 / 计划",
    options: [
      { value: "folder-kanban", label: "项目", Icon: FolderKanban },
      { value: "calendar-clock", label: "计划", Icon: CalendarClock },
      { value: "clipboard-list", label: "清单", Icon: ClipboardList },
    ],
  },
  {
    code: "OPS",
    title: "合规 / 运维",
    options: [
      { value: "shield-check", label: "合规", Icon: ShieldCheck },
      { value: "wrench", label: "运维", Icon: Wrench },
      { value: "tags", label: "分类", Icon: Tags },
    ],
  },
  {
    code: "CORE",
    title: "通用",
    options: [
      { value: "table", label: "表格", Icon: Table2 },
      { value: "database", label: "数据", Icon: Database },
      { value: "file-text", label: "文档", Icon: FileText },
      { value: "image", label: "图片", Icon: Image },
      { value: "layers-3", label: "层级", Icon: Layers3 },
      { value: "box", label: "通用", Icon: Box },
    ],
  },
];

const SCHEMA_ICON_OPTIONS = SCHEMA_ICON_GROUPS.flatMap((group) => group.options);

export function SchemaIconPicker(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [source, setSource] = useState<IconSource>(() => sourceFromValue(props.value));
  const [urlDraft, setUrlDraft] = useState(isHttpImageUrl(props.value) ? props.value : "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const payload = await uploadSchemaIcon(file);
      props.onChange(payload.url);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setUploading(false);
    }
  }

  function applyUrl(event: FormEvent) {
    event.preventDefault();
    const value = urlDraft.trim();
    if (!isHttpImageUrl(value)) return setError("请输入 http(s) 图片链接");
    setError(null);
    props.onChange(value);
  }

  return (
    <div className={cn("grid min-w-0 gap-3 text-sm", props.className)}>
      <Header value={props.value} />
      <SourceTabs value={source} disabled={props.disabled} onChange={setSource} />
      {source === "built-in" ? (
        <BuiltInGrid value={props.value} disabled={props.disabled} onChange={props.onChange} />
      ) : source === "url" ? (
        <UrlPanel
          value={urlDraft}
          disabled={props.disabled}
          error={error}
          onChange={setUrlDraft}
          onSubmit={applyUrl}
        />
      ) : (
        <UploadPanel
          value={props.value}
          disabled={props.disabled || uploading}
          error={error}
          uploading={uploading}
          onUpload={(file) => void handleUpload(file)}
        />
      )}
    </div>
  );
}

export function SchemaIcon(props: { value: string; className?: string }) {
  const [failedValue, setFailedValue] = useState<string | null>(null);
  const customImage = failedValue !== props.value && isImageIconValue(props.value);
  const option = findSchemaIcon(props.value);
  const Icon = option?.Icon ?? Database;

  if (customImage) {
    return (
      <img
        src={props.value}
        alt=""
        aria-hidden
        onError={() => setFailedValue(props.value)}
        className={cn("object-cover", props.className)}
      />
    );
  }
  return <Icon className={props.className} aria-hidden />;
}

function Header({ value }: { value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center border border-border bg-background text-muted-foreground">
          <SchemaIcon value={value} className="size-5" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">ICON</span>
          <span className="truncate text-sm font-medium text-foreground">{iconLabel(value)}</span>
        </span>
      </div>
      <span className="min-w-0 truncate border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
        {iconValueLabel(value)}
      </span>
    </div>
  );
}

function SourceTabs(props: {
  value: IconSource;
  disabled?: boolean;
  onChange: (value: IconSource) => void;
}) {
  return (
    <div className="inline-grid w-fit grid-cols-3 border border-border">
      <SourceButton
        label="内置"
        value="built-in"
        active={props.value === "built-in"}
        disabled={props.disabled}
        onChange={props.onChange}
      />
      <SourceButton
        label="链接"
        value="url"
        active={props.value === "url"}
        disabled={props.disabled}
        onChange={props.onChange}
      />
      <SourceButton
        label="上传"
        value="upload"
        active={props.value === "upload"}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </div>
  );
}

function SourceButton(props: {
  label: string;
  value: IconSource;
  active: boolean;
  disabled?: boolean;
  onChange: (value: IconSource) => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onChange(props.value)}
      className={cn(
        "h-8 border-r border-border px-3 text-xs last:border-r-0 hover:bg-accent disabled:opacity-50",
        props.active && "bg-foreground text-background hover:bg-foreground"
      )}
      aria-pressed={props.active}
    >
      {props.label}
    </button>
  );
}

function BuiltInGrid(props: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="grid gap-3"
      role="radiogroup"
      aria-label="数据表图标"
    >
      {SCHEMA_ICON_GROUPS.map((group) => (
        <section key={group.code} className="grid gap-2 border border-border bg-card/40 p-2">
          <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border pb-2">
            <span className="truncate text-xs font-medium text-foreground">{group.title}</span>
            <span className="shrink-0 border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {group.code}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {group.options.map((option) => (
              <IconChoice
                key={option.value}
                option={option}
                active={option.value === props.value}
                disabled={props.disabled}
                onSelect={props.onChange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function UrlPanel(props: {
  value: string;
  disabled?: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <SourcePanelShell code="URL" title="网页图标链接">
      <form onSubmit={props.onSubmit} className="grid gap-2">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <input
            value={props.value}
            disabled={props.disabled}
            placeholder="https://example.com/icon.png"
            onChange={(event) => props.onChange(event.target.value)}
            className="h-10 min-w-0 flex-1 border border-border bg-background px-3 outline-none focus:border-foreground disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={props.disabled || !isHttpImageUrl(props.value.trim())}
            className="h-10 shrink-0 bg-foreground px-4 text-sm text-background disabled:opacity-40"
          >
            应用链接
          </button>
        </div>
        <StatusText error={props.error} value="网页链接会在表清单和建表预览中显示。" />
      </form>
    </SourcePanelShell>
  );
}

function UploadPanel(props: {
  value: string;
  disabled?: boolean;
  uploading: boolean;
  error: string | null;
  onUpload: (file: File) => void;
}) {
  return (
    <SourcePanelShell code="UPLOAD" title="上传图片图标">
      <div className="grid gap-2">
        <label className="flex min-h-10 min-w-0 flex-col gap-2 border border-border bg-background px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={props.disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) props.onUpload(file);
            }}
            className="min-w-0 flex-1 text-xs file:mr-3 file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-background disabled:opacity-50"
          />
          {isUploadedIcon(props.value) && <span className="text-xs text-muted-foreground">已上传</span>}
        </label>
        <StatusText
          error={props.error}
          value={props.uploading ? "上传中..." : "支持 png、jpg、jpeg、gif、webp，最大 1MB。"}
        />
      </div>
    </SourcePanelShell>
  );
}

function SourcePanelShell(props: { code: string; title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border border-dashed border-border bg-muted/20 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="truncate text-xs font-medium text-foreground">{props.title}</span>
        <span className="shrink-0 border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {props.code}
        </span>
      </div>
      {props.children}
    </div>
  );
}

function StatusText(props: { error: string | null; value: string }) {
  return (
    <span
      className={cn(
        "min-h-4 text-xs",
        props.error ? "text-[var(--color-status-error)]" : "text-muted-foreground"
      )}
    >
      {props.error ?? props.value}
    </span>
  );
}

function IconChoice(props: {
  option: SchemaIconOption;
  active: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  const Icon = props.option.Icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.active}
      title={props.option.label}
      disabled={props.disabled}
      onClick={() => props.onSelect(props.option.value)}
      className={cn(
        "grid h-14 min-w-0 grid-cols-[3px_2rem_minmax(0,1fr)] items-center gap-2 border border-border bg-background px-2 text-left text-muted-foreground transition-colors",
        "hover:border-foreground hover:bg-accent hover:text-foreground focus-visible:border-foreground focus-visible:outline-none",
        props.active && "border-foreground bg-accent text-foreground",
        props.disabled && "cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground"
      )}
    >
      <span
        className={cn("h-9 w-px justify-self-start bg-border", props.active && "w-[3px] bg-foreground")}
        aria-hidden
      />
      <span
        className={cn(
          "grid size-8 place-items-center border border-border bg-card text-muted-foreground",
          props.active && "border-foreground text-foreground"
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-xs font-medium">{props.option.label}</span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">{props.option.value}</span>
      </span>
    </button>
  );
}

function iconLabel(value: string) {
  const option = findSchemaIcon(value);
  if (option) return option.label;
  if (isUploadedIcon(value)) return "已上传图片";
  if (isHttpImageUrl(value)) return "网页链接";
  return value;
}

function iconValueLabel(value: string) {
  const option = findSchemaIcon(value);
  if (option) return option.value;
  if (isUploadedIcon(value)) return "uploaded";
  if (isHttpImageUrl(value)) return value;
  return value || "unset";
}

function sourceFromValue(value: string): IconSource {
  if (isUploadedIcon(value)) return "upload";
  if (isHttpImageUrl(value)) return "url";
  return "built-in";
}

function isImageIconValue(value: string) {
  return isUploadedIcon(value) || isHttpImageUrl(value);
}

function isUploadedIcon(value: string) {
  return value.startsWith("/api/v1/schema-icons/");
}

function isHttpImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function findSchemaIcon(value: string) {
  return SCHEMA_ICON_OPTIONS.find((option) => option.value === value);
}
