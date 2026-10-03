"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ScanFormState } from "@/app/(app)/intel/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button size="sm" type="submit" disabled={pending}>
      {pending ? "Matching…" : label}
    </Button>
  );
}

/** Paste (or replace) the d-scan of a scan. */
export function DscanForm({
  scanId,
  action,
  replace,
}: {
  scanId: string;
  action: (state: ScanFormState, formData: FormData) => Promise<ScanFormState>;
  replace: boolean;
}) {
  const [state, formAction] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="scanId" value={scanId} />
      <textarea
        name="dscan"
        required
        placeholder="Paste the directional scanner (select all, Ctrl+C)."
        spellCheck={false}
        className="glass-inset block h-24 w-full resize-y rounded-lg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3"
      />
      <div className="flex items-center gap-3">
        <Submit label={replace ? "Replace d-scan" : "Match d-scan"} />
        {state.error && <span className="text-xs text-critical-text">{state.error}</span>}
      </div>
    </form>
  );
}

export function ReadDscanButton({ scanId, action, label }: { scanId: string; action: (formData: FormData) => Promise<void>; label: string }) {
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <ReadSubmit label={label} />
    </form>
  );
}

function ReadSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      {pending ? "Reading…" : label}
    </Button>
  );
}
