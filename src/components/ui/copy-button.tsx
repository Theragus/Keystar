"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="glass-inset flex items-center gap-2 rounded-lg py-1 pr-1 pl-4">
      <code className="min-w-0 flex-1 truncate text-xs text-ink-2">{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="glass-chip inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs hover:bg-white/10"
      >
        {copied ? <Check className="size-3.5 text-good-text" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
