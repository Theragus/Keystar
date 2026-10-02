"use client";

import { Scale } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { AppraisalFormState } from "@/app/(app)/trade/appraisal/actions";

const PLACEHOLDER = `Paste anything from EVE, for example:

Tritanium\t12,000\tMineral
[Rifter, Roam fit]
200mm AutoCannon II, EMP S
Warrior II x5
Nanite Repair Paste x 50
10 Cap Booster 800`;

export function AppraisalForm({
  action,
  defaultInput = "",
  defaultPercent = 100,
}: {
  action: (state: AppraisalFormState, formData: FormData) => Promise<AppraisalFormState>;
  defaultInput?: string;
  defaultPercent?: number;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="sr-only">Items to appraise</span>
        <textarea
          name="input"
          required
          defaultValue={defaultInput}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="glass-inset block h-72 w-full resize-y rounded-lg px-4 py-3 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-3"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Price at
          <input
            type="number"
            name="percent"
            min={1}
            max={200}
            defaultValue={defaultPercent}
            className="glass-inset h-9 w-20 rounded-lg px-3 text-right text-sm text-ink tabular-nums"
          />
          % of Jita
        </label>
        <Button type="submit" variant="primary" disabled={pending} className="ml-auto">
          <Scale className="size-4" aria-hidden />
          {pending ? "Appraising…" : "Appraise"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-critical-text">{state.error}</p>}
      <p className="text-xs text-ink-3">
        Prices: Jita 4-4 best buy and sell orders, refreshed from ESI when older than two hours. Items appraised for the
        first time take a moment to price.
      </p>
    </form>
  );
}
