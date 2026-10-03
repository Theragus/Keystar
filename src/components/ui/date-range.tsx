"use client";

import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Popover } from "./popover";

export interface RangePreset {
  id: string;
  label: string;
  from: string;
  to: string;
}

/** Preset rows first (nobody fights a calendar for "last 30 days"), custom range in the footer. */
export function DateRangePicker({
  from,
  to,
  presets,
  onChange,
}: {
  from: string;
  to: string;
  presets: RangePreset[];
  onChange: (range: { from: string; to: string }) => void;
}) {
  const { t, f } = useI18n();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const active = presets.find((p) => p.from === from && p.to === to);

  const choose = (range: { from: string; to: string }) => {
    setOpen(false);
    if (range.from !== from || range.to !== to) onChange(range);
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      className="w-[280px]"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setCustomFrom(from);
            setCustomTo(to);
            setOpen((o) => !o);
          }}
          className="glass-chip flex h-8 items-center gap-2 rounded-lg pr-3 pl-3.5 text-xs transition hover:bg-surface-contrast/10"
        >
          <CalendarRange className="size-3.5 text-accent" aria-hidden />
          <span className="font-medium text-ink">{active ? active.label : `${f.shortDate(from)} – ${f.shortDate(to)}`}</span>
          {active && (
            <span className="text-ink-3">
              {f.shortDate(from)} – {f.shortDate(to)}
            </span>
          )}
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
        </button>
      }
    >
      <div className="p-2">
        {presets.map((p) => {
          const selected = p.id === active?.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-contrast/6"
            >
              <span className="w-4">{selected && <Check className="size-4 text-accent" strokeWidth={3} aria-hidden />}</span>
              <span className={cn("flex-1", selected ? "font-semibold text-ink" : "text-ink-2")}>{p.label}</span>
            </button>
          );
        })}
        <div className="mt-1 border-t border-surface-contrast/8 px-2 pt-3 pb-1">
          <div className="eve-label mb-2 text-2xs text-ink-3">{t.common.dateRange.custom}</div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="glass-inset h-8 min-w-0 flex-1 rounded-lg px-2 text-xs text-ink [color-scheme:dark]"
              aria-label={t.common.dateRange.from}
            />
            <span className="text-ink-3">–</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="glass-inset h-8 min-w-0 flex-1 rounded-lg px-2 text-xs text-ink [color-scheme:dark]"
              aria-label={t.common.dateRange.to}
            />
          </div>
          <button
            type="button"
            disabled={!customFrom || !customTo}
            onClick={() => choose({ from: customFrom, to: customTo })}
            className="mt-2.5 w-full rounded-md bg-accent py-1.5 text-xs font-semibold text-space-950 disabled:opacity-40"
          >
            {t.common.dateRange.apply}
          </button>
        </div>
      </div>
    </Popover>
  );
}
