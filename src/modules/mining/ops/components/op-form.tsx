"use client";

import { X } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/glass";
import { SystemPicker } from "@/components/ui/system-picker";
import type { ValuationSource } from "@/core/db/schema/eve";
import { isOreClass } from "@/core/eve/ore";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { OpFormState } from "@/app/(app)/mining/ops/actions";
import { CHART_CLASSES, chartClassOf } from "../../class-colors";
import type { MiningOpParticipation, MiningOpSplitMode } from "../../schema";

export interface OpFormValues {
  id?: string;
  name: string;
  /** datetime-local value in EVE time ("2026-10-02T19:00"). */
  startsAt: string;
  endsAt: string;
  systems: { id: number; name: string }[];
  oreClasses: string[];
  participation: MiningOpParticipation;
  fleetId: number | null;
  calendarEventId: number | null;
  valuationSource: ValuationSource;
  ratePct: number;
  corpCutPct: number;
  splitMode: MiningOpSplitMode;
  notes: string;
}

const inputClass = "glass-inset h-9 w-full rounded-lg px-3 text-sm text-ink placeholder:text-ink-3";
const VALUATION_SOURCES: ValuationSource[] = ["jita_buy", "jita_sell", "jita_split", "esi_average"];
const PARTICIPATION: MiningOpParticipation[] = ["anyone", "fleet", "calendar"];
const SPLIT_MODES: MiningOpSplitMode[] = ["contribution", "equal"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs text-ink-3">
      <span>{label}</span>
      {children}
      {hint && <span className="block text-2xs text-ink-3">{hint}</span>}
    </label>
  );
}

function Choice({
  name,
  value,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange?: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 ring-1 ring-surface-contrast/10 transition-colors",
        checked ? "bg-accent/10 ring-accent/30" : "hover:bg-surface-contrast/5",
      )}
    >
      <input type="radio" name={name} value={value} defaultChecked={checked} onChange={onChange} className="mt-0.5 accent-(--accent)" />
      <span className="space-y-0.5">
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-2xs text-ink-3">{hint}</span>
      </span>
    </label>
  );
}

/** Create and edit form for a mining op (times in EVE time). */
export function OpForm({
  action,
  values,
  fleets,
  events,
  cancelHref,
}: {
  action: (prev: OpFormState, formData: FormData) => Promise<OpFormState>;
  values: OpFormValues;
  fleets: { fleetId: number; label: string }[];
  events: { eventId: number; label: string }[];
  cancelHref: string;
}) {
  const { t, f } = useI18n();
  const m = t.ops.form;
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [systems, setSystems] = useState(values.systems);
  const [participation, setParticipation] = useState(values.participation);
  const [split, setSplit] = useState(values.splitMode);

  return (
    <form
      className="space-y-4"
      // Dispatched by hand rather than through `action`, so a validation error doesn't reset what was typed.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={m.basics}>
          <div className="space-y-3">
            <Field label={m.name}>
              <input name="name" defaultValue={values.name} placeholder={m.namePlaceholder} maxLength={80} required className={inputClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={m.start}>
                <input type="datetime-local" name="startsAt" defaultValue={values.startsAt} required className={inputClass} />
              </Field>
              <Field label={m.end} hint={m.endHint}>
                <input type="datetime-local" name="endsAt" defaultValue={values.endsAt} className={inputClass} />
              </Field>
            </div>
            <Field label={m.notes}>
              <textarea
                name="notes"
                defaultValue={values.notes}
                placeholder={m.notesPlaceholder}
                maxLength={2000}
                rows={3}
                className="glass-inset w-full rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-3"
              />
            </Field>
          </div>
        </Panel>

        <Panel title={m.where}>
          <div className="space-y-4">
            <div className="space-y-1.5 text-xs text-ink-3">
              <span>{m.systems}</span>
              {systems.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {systems.map((s) => (
                    <li key={s.id} className="glass-chip flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs text-ink">
                      <input type="hidden" name="systems" value={s.id} />
                      {s.name}
                      <button
                        type="button"
                        aria-label={m.removeSystem(s.name)}
                        onClick={() => setSystems((list) => list.filter((x) => x.id !== s.id))}
                        className="rounded p-0.5 text-ink-3 hover:bg-surface-contrast/10 hover:text-ink"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <SystemPicker
                placeholder={m.systemPlaceholder}
                className="w-full"
                onPick={(o) => setSystems((list) => (list.some((x) => x.id === o[0]) ? list : [...list, { id: o[0], name: o[1] }]))}
              />
              <span className="block text-2xs">{m.systemsHint}</span>
            </div>
            <fieldset className="space-y-1.5 text-xs text-ink-3">
              <legend className="mb-1.5">{m.oreClasses}</legend>
              <div className="flex flex-wrap gap-1.5">
                {/* Moon ore is one choice: which rarity the moon gives doesn't decide what counts. */}
                {CHART_CLASSES.filter((c) => c.id !== "other").map(({ id }) => (
                  <label key={id} className="glass-chip flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink">
                    <input
                      type="checkbox"
                      name="classes"
                      value={id}
                      defaultChecked={values.oreClasses.some((c) => isOreClass(c) && chartClassOf(c) === id)}
                      className="accent-(--accent)"
                    />
                    {t.mining.chartClasses[id]}
                  </label>
                ))}
              </div>
              <span className="block text-2xs">{m.oreClassesHint}</span>
            </fieldset>
          </div>
        </Panel>

        <Panel title={m.who}>
          <div className="space-y-3">
            <div className="grid gap-2">
              {PARTICIPATION.map((p) => (
                <Choice
                  key={p}
                  name="participation"
                  value={p}
                  checked={participation === p}
                  onChange={() => setParticipation(p)}
                  label={t.ops.participation[p].label}
                  hint={t.ops.participation[p].hint}
                />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={m.fleet} hint={m.fleetHint}>
                <select name="fleetId" defaultValue={values.fleetId ?? ""} className={inputClass}>
                  <option value="">{m.fleetNone}</option>
                  {fleets.map((fl) => (
                    <option key={fl.fleetId} value={fl.fleetId}>
                      {fl.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={m.event}>
                <select name="calendarEventId" defaultValue={values.calendarEventId ?? ""} className={inputClass}>
                  <option value="">{m.eventNone}</option>
                  {events.map((e) => (
                    <option key={e.eventId} value={e.eventId}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title={m.payout}>
          <div className="space-y-3">
            <Field label={m.valuation}>
              <select name="valuationSource" defaultValue={values.valuationSource} className={inputClass}>
                {VALUATION_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t.eve.valuationSources[s]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={m.rate} hint={m.rateHint}>
                <span className="flex items-center gap-2">
                  <input name="ratePct" defaultValue={f.number(values.ratePct, Number.isInteger(values.ratePct) ? 0 : 1)} inputMode="decimal" className={inputClass} />
                  <span className="text-sm text-ink-2">%</span>
                </span>
              </Field>
              <Field label={m.corpCut} hint={m.corpCutHint}>
                <span className="flex items-center gap-2">
                  <input
                    name="corpCutPct"
                    defaultValue={f.number(values.corpCutPct, Number.isInteger(values.corpCutPct) ? 0 : 1)}
                    inputMode="decimal"
                    className={inputClass}
                  />
                  <span className="text-sm text-ink-2">%</span>
                </span>
              </Field>
            </div>
            <div className="space-y-1.5 text-xs text-ink-3">
              <span>{m.split}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {SPLIT_MODES.map((s) => (
                  <Choice
                    key={s}
                    name="splitMode"
                    value={s}
                    checked={split === s}
                    onChange={() => setSplit(s)}
                    label={t.ops.splitModes[s].label}
                    hint={t.ops.splitModes[s].hint}
                  />
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical-text ring-1 ring-critical/30">
          {m.errors[state.error]}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {values.id ? m.save : m.create}
        </Button>
        <ButtonLink href={cancelHref} variant="ghost">
          {m.cancel}
        </ButtonLink>
      </div>
    </form>
  );
}
