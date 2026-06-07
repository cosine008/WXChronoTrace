import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStep } from "./schemaWizardState";

interface Props {
  current: WizardStep;
  errorStep?: WizardStep | null;
  onSelect: (step: WizardStep) => void;
}

export function WizardStepper({ current, errorStep, onSelect }: Props) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === current);

  return (
    <nav className="grid gap-2 md:grid-cols-5" aria-label="建表步骤">
      {WIZARD_STEPS.map((step, index) => {
        const active = step.id === current;
        const complete = index < currentIndex;
        const hasError = step.id === errorStep;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(step.id)}
            className={cn(
              "flex h-11 items-center gap-2 border px-3 text-left text-sm transition-colors",
              "rounded-sm hover:border-foreground",
              active && "border-foreground bg-foreground text-background",
              !active && "border-border bg-card text-muted-foreground",
              complete && !active && !hasError && "text-foreground",
              hasError && !active && "border-[var(--color-status-error)] text-[var(--color-status-error)]"
            )}
          >
            <span
              className={cn(
                "grid size-5 place-items-center border text-[11px] font-mono",
                active ? "border-background" : "border-current"
              )}
            >
              {complete ? <Check className="size-3" aria-hidden /> : index + 1}
            </span>
            <span className="truncate">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
