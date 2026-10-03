"use client";

import { ScanEye } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SystemPicker } from "@/components/ui/system-picker";
import { useI18n } from "@/i18n/client";
import type { ScanFormState } from "@/app/(app)/intel/actions";

export function ScanForm({
  action,
  defaultSystem = "",
}: {
  action: (state: ScanFormState, formData: FormData) => Promise<ScanFormState>;
  defaultSystem?: string;
}) {
  const { t } = useI18n();
  const s = t.intel.form;
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="sr-only">{s.pilots}</span>
        <textarea
          name="pilots"
          required
          placeholder={s.placeholder}
          spellCheck={false}
          autoFocus
          className="glass-inset block h-64 w-full resize-y rounded-lg px-4 py-3 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-3"
        />
      </label>
      <details className="group">
        <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">{s.addDscan}</summary>
        <label className="mt-2 block">
          <span className="sr-only">{s.dscan}</span>
          <textarea
            name="dscan"
            placeholder={s.dscanPlaceholder}
            spellCheck={false}
            className="glass-inset block h-32 w-full resize-y rounded-lg px-4 py-3 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-3"
          />
        </label>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          {s.system}
          <SystemPicker name="system" defaultValue={defaultSystem} placeholder={s.systemPlaceholder} />
        </label>
        <Button type="submit" variant="primary" disabled={pending} className="ml-auto">
          <ScanEye className="size-4" aria-hidden />
          {pending ? s.submitting : s.submit}
        </Button>
      </div>
      {state.error && <p className="text-sm text-critical-text">{state.error}</p>}
      <p className="text-xs text-ink-3">{s.hint}</p>
    </form>
  );
}
