"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/client";

/** Small inline button that copies a value (e.g. a fitting's ship DNA). */
export function CopyChip({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
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
      title={state === "failed" ? t.common.copy.failedHint : label}
      aria-label={label}
      className="inline-grid size-5 place-items-center rounded text-ink-3 hover:bg-surface-contrast/10 hover:text-ink"
    >
      {state === "copied" ? <Check className="size-3 text-good-text" aria-hidden /> : <Copy className="size-3" aria-hidden />}
    </button>
  );
}
