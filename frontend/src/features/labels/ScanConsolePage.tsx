import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ScanLine } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { InlineMessage } from "@/components/feedback";
import { cn } from "@/lib/utils";
import { normalizeLabelInput } from "./labelCode";

export function ScanConsolePage() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const labelCode = normalizeLabelInput(value);
      navigate(`/scan/${labelCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无效标签码");
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-6 text-foreground">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-5xl content-center gap-8">
        <header className="grid gap-2 border-b border-border pb-5">
          <p className="font-mono text-xs uppercase text-muted-foreground">CT-SCAN / CONSOLE</p>
          <h1 className="text-4xl font-semibold tracking-normal md:text-6xl">现场扫码</h1>
        </header>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase text-muted-foreground">label code</span>
            <div className="grid grid-cols-[1fr_auto] border border-border bg-card">
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className={cn(
                  "h-16 min-w-0 bg-transparent px-4 font-mono text-lg outline-none",
                  "placeholder:text-muted-foreground"
                )}
                placeholder="CT-L-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="inline-flex h-16 items-center gap-2 border-l border-border px-5 hover:bg-muted"
              >
                <ScanLine className="size-5" aria-hidden />
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </label>
          <InlineMessage tone="error" message={error ?? undefined} />
        </form>
      </div>
    </main>
  );
}
