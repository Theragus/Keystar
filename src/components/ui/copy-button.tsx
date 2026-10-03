"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/client";

export function CopyField({ value }: { value: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="glass-inset flex items-center gap-2 rounded-lg py-1 pr-1 pl-4">
      <code className="min-w-0 flex-1 truncate text-xs text-ink-2">{value}</code>
      <button
        type="button"
        onClick={async () => {
          // The Clipboard API needs a secure context (https or localhost) and permission.
          const ok = await navigator.clipboard?.writeText(value).then(
            () => true,
            () => false,
          );
          setState(ok ? "copied" : "failed");
          setTimeout(() => setState("idle"), ok ? 1500 : 3000);
        }}
        title={state === "failed" ? t.common.copy.failedHint : undefined}
        className="glass-chip inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs hover:bg-white/10"
      >
        {state === "copied" ? (
          <Check className="size-3.5 text-good-text" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {state === "copied" ? t.common.copy.copied : state === "failed" ? t.common.copy.failed : t.common.copy.copy}
      </button>
    </div>
  );
}
