import type { ReactNode } from "react";

export function ModeButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
      className={[
        "inline-flex h-8 min-w-0 items-center justify-center gap-2 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60",
        props.active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

export function CheckboxRow(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex min-w-0 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
        aria-label={props.label}
        className="size-4 border border-border"
      />
      <span>{props.label}</span>
    </label>
  );
}

export function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`grid min-w-0 gap-2 ${props.className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type="text"
        value={props.value}
        required={props.required}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label={props.label}
        className="h-10 w-full min-w-0 border border-border bg-transparent px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function LabeledTextarea(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`grid min-w-0 gap-2 ${props.className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <textarea
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        rows={props.rows}
        aria-label={props.label}
        className="min-h-0 w-full min-w-0 resize-y border border-border bg-transparent px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function LabeledSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label={props.label}
        className="h-10 w-full min-w-0 border border-border bg-transparent px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {props.options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
