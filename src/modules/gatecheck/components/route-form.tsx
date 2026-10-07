"use client";

import { Route } from "lucide-react";
import Form from "next/form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SystemPicker } from "@/components/ui/system-picker";
import { useI18n } from "@/i18n/client";
import { PACES, WINDOWS, type Pace } from "../constants";
import type { GatecheckQuery } from "../params";
import { PREFERENCES, type RoutePreference } from "../route";

const field = "glass-inset h-9 rounded-lg px-3 text-sm text-ink";

/** The route form. A GET form: the check lives in the URL, so reloading or sharing it checks again. */
export function RouteForm({ query }: { query: GatecheckQuery }) {
  const { t } = useI18n();
  const s = t.gatecheck.form;
  const [preference, setPreference] = useState<RoutePreference>(query.preference);
  return (
    <Form action="/gatecheck" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          {s.from}
          <SystemPicker name="from" defaultValue={query.from} placeholder={s.fromPlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          {s.to}
          <SystemPicker name="to" defaultValue={query.to} placeholder={s.toPlaceholder} />
        </label>
        <div className="flex flex-col gap-1 text-xs text-ink-3">
          <span>{s.preference}</span>
          <Segmented
            label={s.preference}
            value={preference}
            onChange={setPreference}
            options={PREFERENCES.map((p) => ({
              value: p,
              label: s.preferences[p],
              title: s.preferenceHints[p],
            }))}
          />
          <input type="hidden" name="pref" value={preference} />
        </div>
        <Button type="submit" variant="primary" className="ml-auto">
          <Route className="size-4" aria-hidden />
          {s.submit}
        </Button>
      </div>
      <details className="group" open={!!(query.avoid || query.depart || query.pace !== "normal")}>
        <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">
          {s.avoid} · {s.window} · {s.departure} · {s.pace}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            {s.avoid}
            <input
              name="avoid"
              defaultValue={query.avoid}
              placeholder={s.avoidPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            {s.window}
            <select name="window" defaultValue={String(query.windowHours)} className={field}>
              {WINDOWS.map((h) => (
                <option key={h} value={h}>
                  {s.windowOption(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            {s.departure}
            <input type="datetime-local" name="depart" defaultValue={query.depart} step={60} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            {s.pace}
            <select name="pace" defaultValue={query.pace} className={field}>
              {(Object.keys(PACES) as Pace[]).map((p) => (
                <option key={p} value={p}>
                  {s.paces[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-3">{s.departureHint}</p>
      </details>
    </Form>
  );
}
