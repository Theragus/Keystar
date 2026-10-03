"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { ScanFormState } from "@/app/(app)/intel/actions";

function Submit({ label }: { label: string }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button size="sm" type="submit" disabled={pending}>
      {pending ? t.intel.buttons.matching : label}
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
  const { t } = useI18n();
  const [state, formAction] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="scanId" value={scanId} />
      <textarea
        name="dscan"
        required
        placeholder={t.intel.dscan.placeholder}
        spellCheck={false}
        className="glass-inset block h-24 w-full resize-y rounded-lg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3"
      />
      <div className="flex items-center gap-3">
        <Submit label={replace ? t.intel.buttons.replaceDscan : t.intel.buttons.matchDscan} />
        {state.error && <span className="text-xs text-critical-text">{state.error}</span>}
      </div>
    </form>
  );
}

export function ReadDscanButton({ scanId, action, claude }: { scanId: string; action: (formData: FormData) => Promise<void>; claude: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <ReadSubmit claude={claude} />
    </form>
  );
}

function ReadSubmit({ claude }: { claude: boolean }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      {pending ? t.intel.buttons.reading : claude ? t.intel.buttons.askClaude : t.intel.buttons.summarize}
    </Button>
  );
}
