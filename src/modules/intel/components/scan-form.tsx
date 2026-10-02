"use client";

import { Radar } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ScanFormState } from "@/app/(app)/intel/actions";

const PLACEHOLDER = `Paste the local member list (select all in the member list, Ctrl+C),
a fleet composition, chat lines or names, one per line:

Pilot One
Pilot Two
Another Pilot`;

export function ScanForm({
  action,
  defaultSystem = "",
}: {
  action: (state: ScanFormState, formData: FormData) => Promise<ScanFormState>;
  defaultSystem?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="sr-only">Pilots</span>
        <textarea
          name="pilots"
          required
          placeholder={PLACEHOLDER}
          spellCheck={false}
          autoFocus
          className="glass-inset block h-64 w-full resize-y rounded-lg px-4 py-3 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-3"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Current system
          <input
            name="system"
            defaultValue={defaultSystem}
            placeholder="optional, e.g. Amamake"
            autoComplete="off"
            spellCheck={false}
            className="glass-inset h-9 w-48 rounded-lg px-3 text-sm text-ink placeholder:text-ink-3"
          />
        </label>
        <Button type="submit" variant="primary" disabled={pending} className="ml-auto">
          <Radar className="size-4" aria-hidden />
          {pending ? "Scanning…" : "Scan pilots"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-critical-text">{state.error}</p>}
      <p className="text-xs text-ink-3">
        Corporations, standings and fights with us show up immediately. Threat scores follow from zKillboard as the
        worker reads each pilot (about a second per pilot, highest priority first); recent kills come in after that.
        The current system makes kills nearby count more.
      </p>
    </form>
  );
}
