import type { ReactNode } from "react";

export function Modal(props: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md border border-border bg-card p-4 shadow-sm"
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

export function ModalFooter(props: {
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: ReactNode;
  confirmDisabled?: boolean;
}) {
  const confirmDisabled = props.loading || props.confirmDisabled;

  return (
    <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={props.onCancel}
        disabled={props.loading}
        className="h-9 border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        取消
      </button>
      <button
        type="button"
        onClick={props.onConfirm}
        disabled={confirmDisabled}
        className="inline-flex h-9 items-center justify-center bg-foreground px-3 text-sm text-background disabled:opacity-50"
      >
        {props.confirmLabel}
      </button>
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        readOnly={props.readOnly}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 border border-border bg-background px-3 outline-none focus:border-foreground read-only:text-muted-foreground"
      />
    </label>
  );
}

export function CheckboxField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex h-10 items-center gap-2 border border-border px-3 text-sm">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}
