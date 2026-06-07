import { useState, type KeyboardEvent } from "react";
import { Eye, PencilLine } from "lucide-react";

import type { FieldConfig } from "@/api/schemas";
import { SafeMarkdown } from "@/components/markdown/SafeMarkdown";
import { cn } from "@/lib/utils";
import { stringifyCell } from "./currentViewUtils";

interface Props {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  id: string;
  name: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

export function FieldValueInput({
  field,
  value,
  onChange,
  id,
  name,
  disabled = false,
  placeholder,
  autoFocus = false,
  compact = false,
  className,
  onKeyDown,
}: Props) {
  const baseClass = cn(
    "w-full border border-border bg-background px-2 text-foreground outline-none disabled:opacity-50",
    compact ? "min-h-8 text-xs" : "min-h-9 text-sm",
    className
  );
  const options = fieldOptions(field);

  if (field.type === "longtext") {
    return (
      <textarea
        id={id}
        name={name}
        autoFocus={autoFocus}
        disabled={disabled}
        value={stringifyCell(value)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(baseClass, "min-h-20 py-2")}
      />
    );
  }

  if (field.type === "markdown") {
    return (
      <MarkdownValueInput
        id={id}
        name={name}
        autoFocus={autoFocus}
        disabled={disabled}
        value={stringifyCell(value)}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        baseClass={baseClass}
        compact={compact}
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        id={id}
        name={name}
        type="number"
        autoFocus={autoFocus}
        disabled={disabled}
        value={inputValue(value)}
        min={numberAttr(field, "min") ?? (field.validators?.positive_only === true ? 0 : undefined)}
        max={numberAttr(field, "max")}
        step={numberStep(field)}
        onChange={(event) => onChange(numberValue(event.target.value))}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={baseClass}
      />
    );
  }

  if (field.type === "date") {
    return (
      <input
        id={id}
        name={name}
        type="date"
        autoFocus={autoFocus}
        disabled={disabled}
        value={dateValue(value)}
        min={stringAttr(field, "min_date")}
        max={stringAttr(field, "max_date")}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className={baseClass}
      />
    );
  }

  if (field.type === "datetime") {
    return (
      <input
        id={id}
        name={name}
        type="datetime-local"
        autoFocus={autoFocus}
        disabled={disabled}
        value={dateTimeLocalValue(value)}
        onChange={(event) => onChange(dateTimeUtcValue(event.target.value))}
        onKeyDown={onKeyDown}
        className={baseClass}
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <select
        id={id}
        name={name}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value === true ? "true" : value === false ? "false" : ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? "" : event.target.value === "true")
        }
        onKeyDown={onKeyDown}
        className={baseClass}
      >
        <option value="">未选择</option>
        <option value="true">是</option>
        <option value="false">否</option>
      </select>
    );
  }

  if (field.type === "enum" && options.length > 0) {
    return (
      <select
        id={id}
        name={name}
        autoFocus={autoFocus}
        disabled={disabled}
        value={stringifyCell(value)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className={baseClass}
      >
        <option value="">未选择</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multi-enum" && options.length > 0) {
    const selected = arrayValue(value);
    return (
      <div
        className={cn(
          "grid gap-1 border border-border bg-background p-2",
          compact ? "text-xs" : "text-sm",
          disabled && "opacity-50",
          className
        )}
      >
        {options.map((option) => (
          <label key={option} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(option)}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option)
                );
              }}
              className="size-4 accent-foreground"
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "person" || field.type === "reference") {
    return (
      <input
        id={id}
        name={name}
        type="number"
        autoFocus={autoFocus}
        disabled={disabled}
        value={inputValue(value)}
        onChange={(event) => onChange(integerValue(event.target.value))}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? (field.type === "person" ? "用户 ID" : "实体 ID")}
        className={baseClass}
      />
    );
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      autoFocus={autoFocus}
      disabled={disabled || field.type === "auto-number"}
      value={stringifyCell(value)}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? (field.type === "auto-number" ? "自动编号" : undefined)}
      className={baseClass}
    />
  );
}

function MarkdownValueInput({
  id,
  name,
  autoFocus,
  disabled,
  value,
  onChange,
  onKeyDown,
  placeholder,
  baseClass,
  compact,
}: {
  id: string;
  name: string;
  autoFocus: boolean;
  disabled: boolean;
  value: string;
  onChange: (value: unknown) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  placeholder?: string;
  baseClass: string;
  compact: boolean;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const buttonClass = (active: boolean) =>
    cn(
      "inline-flex h-7 items-center gap-1 px-2 text-xs",
      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="grid min-w-0 gap-1" data-testid="markdown-field-input">
      <div className="inline-flex w-fit items-center border border-border bg-background p-0.5">
        <button
          type="button"
          aria-pressed={mode === "edit"}
          data-testid="markdown-mode-edit"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMode("edit")}
          className={buttonClass(mode === "edit")}
        >
          <PencilLine className="size-3.5" aria-hidden />
          编辑
        </button>
        <button
          type="button"
          aria-pressed={mode === "preview"}
          data-testid="markdown-mode-preview"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMode("preview")}
          className={buttonClass(mode === "preview")}
        >
          <Eye className="size-3.5" aria-hidden />
          预览
        </button>
      </div>
      {mode === "edit" ? (
        <textarea
          id={id}
          name={name}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          data-testid="markdown-source-input"
          className={cn(baseClass, compact ? "min-h-24 py-2" : "min-h-36 py-2")}
        />
      ) : (
        <div
          className={cn(
            baseClass,
            "overflow-auto p-2",
            compact ? "max-h-44 min-h-24" : "max-h-80 min-h-36"
          )}
          data-testid="markdown-live-preview"
          tabIndex={0}
        >
          {value.trim() ? (
            <SafeMarkdown value={value} compact={compact} />
          ) : (
            <span className="text-muted-foreground">暂无 Markdown 内容</span>
          )}
        </div>
      )}
    </div>
  );
}

function fieldOptions(field: FieldConfig) {
  const options = field.validators?.options;
  return Array.isArray(options) ? options.filter((item): item is string => typeof item === "string") : [];
}

function inputValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function arrayValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[,\t、]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function numberValue(raw: string) {
  if (raw === "") return "";
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}

function integerValue(raw: string) {
  if (raw === "") return "";
  const value = Number(raw);
  return Number.isInteger(value) ? value : raw;
}

function dateValue(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function dateTimeLocalValue(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimeUtcValue(raw: string) {
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function numberAttr(field: FieldConfig, key: "min" | "max") {
  const value = field.validators?.[key];
  return typeof value === "number" ? value : undefined;
}

function stringAttr(field: FieldConfig, key: "min_date" | "max_date") {
  const value = field.validators?.[key];
  return typeof value === "string" ? value.slice(0, 10) : undefined;
}

function numberStep(field: FieldConfig) {
  const decimals = field.validators?.decimals;
  if (decimals === 0) return 1;
  if (typeof decimals === "number" && decimals > 0) return Number(`0.${"0".repeat(decimals - 1)}1`);
  return "any";
}
