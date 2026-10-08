"use client";

import { Check, ChevronDown, Minus, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { familiesOf, groupEntries, partlyPicked, selectedFamilyLabel } from "./option-families";
import { Popover } from "./popover";

export interface MultiOption {
  value: number | string;
  label: string;
  group?: string;
  hint?: string;
  leading?: ReactNode;
  /** Options sharing a family fold under one row (an ore and its grades) that expands to list them. */
  family?: { key: string; label: string };
  /** Label inside an expanded family, e.g. "II-Grade" for Scordite II-Grade. */
  shortLabel?: string;
}

function CheckBox({ state, small }: { state: boolean | "mixed"; small?: boolean }) {
  const Icon = state === "mixed" ? Minus : Check;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center ring-1",
        small ? "size-3.5 rounded-[4px]" : "size-4 rounded-[5px]",
        state ? "bg-accent ring-accent" : "ring-surface-contrast/25",
      )}
    >
      {state && <Icon className={cn("text-space-950", small ? "size-2.5" : "size-3")} strokeWidth={3} aria-hidden />}
    </span>
  );
}

/**
 * Searchable, grouped multi-select. Selection is staged locally and applied
 * when the popover closes, so picking five ores triggers one reload, not five.
 */
export function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onApply,
  icon,
}: {
  label: string;
  allLabel: string;
  options: MultiOption[];
  selected: (number | string)[];
  onApply: (values: (number | string)[]) => void;
  icon?: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<number | string>>(new Set(selected));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const families = useMemo(() => familiesOf(options), [options]);

  const openPopover = () => {
    setDraft(new Set(selected));
    setQuery("");
    // Open the families with only some options picked, so the picked ones stay in view.
    setExpanded(partlyPicked(families, selected));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    const next = [...draft];
    const changed = next.length !== selected.length || next.some((v) => !selected.includes(v));
    if (changed) onApply(next);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const groups = useMemo(() => groupEntries(filtered, families), [filtered, families]);

  const toggle = (v: number | string) =>
    setDraft((d) => {
      const n = new Set(d);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  const toggleFamily = (members: MultiOption[]) =>
    setDraft((d) => {
      const n = new Set(d);
      const all = members.every((o) => n.has(o.value));
      for (const o of members) {
        if (all) n.delete(o.value);
        else n.add(o.value);
      }
      return n;
    });
  const toggleExpanded = (key: string) =>
    setExpanded((e) => {
      const n = new Set(e);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? t.common.multiSelect.selected(1))
        : (selectedFamilyLabel(families, selected) ?? t.common.multiSelect.selected(selected.length));

  const optionRow = (o: MultiOption, nested = false) => {
    const checked = draft.has(o.value);
    return (
      <button
        key={o.value}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={nested ? o.label : undefined}
        onClick={() => toggle(o.value)}
        className={cn(
          "flex w-full items-center rounded-md text-left hover:bg-surface-contrast/6",
          nested ? "gap-2 py-1 pr-2 pl-8 text-xs" : "gap-2.5 px-2 py-1.5 text-sm",
        )}
      >
        <CheckBox state={checked} small={nested} />
        {nested ? o.leading && <span className="flex shrink-0 *:size-4!">{o.leading}</span> : o.leading}
        <span className={cn("min-w-0 flex-1 truncate", nested ? "text-ink-2" : "text-ink")}>{nested ? (o.shortLabel ?? o.label) : o.label}</span>
        {o.hint && <span className="shrink-0 text-2xs text-ink-3">{o.hint}</span>}
      </button>
    );
  };

  return (
    <Popover
      open={open}
      onClose={close}
      className="w-[320px]"
      trigger={
        <button
          type="button"
          onClick={() => (open ? close() : openPopover())}
          aria-expanded={open}
          className={cn(
            "glass-chip flex h-8 items-center gap-2 rounded-lg pr-3 pl-3.5 text-xs transition hover:bg-surface-contrast/10",
            selected.length > 0 && "ring-1 ring-accent/40",
          )}
        >
          {icon}
          <span className="text-ink-3">{label}</span>
          <span className="max-w-[150px] truncate font-medium text-ink">{summary}</span>
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
        </button>
      }
    >
      <div className="p-3">
        <div className="glass-inset field-focus flex items-center gap-2 rounded-lg px-3">
          <Search className="size-3.5 text-ink-3" aria-hidden />
          <input
            // Not on touch screens: the keyboard would cover the list it filters.
            autoFocus={typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.common.multiSelect.search(label)}
            className="h-8 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-2xs">
          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => setDraft(new Set(filtered.map((o) => o.value)))}>
            {query ? t.common.multiSelect.selectMatches : t.common.multiSelect.selectAll}
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink" onClick={() => setDraft(new Set())}>
            <X className="size-3" aria-hidden /> {t.common.multiSelect.clear}
          </button>
        </div>
        <div className="mt-1 max-h-[320px] overflow-y-auto overscroll-contain pr-1">
          {groups.length === 0 && <div className="px-2 py-6 text-center text-xs text-ink-3">{t.common.multiSelect.noMatches}</div>}
          {groups.map(([group, items]) => (
            <div key={group} className="py-1">
              {group && <div className="eve-label px-2 pt-2 pb-1 text-2xs text-ink-3">{group}</div>}
              {items.map((e) => {
                if (e.kind === "option") return optionRow(e.option);
                const picked = e.options.filter((o) => draft.has(o.value)).length;
                const state = picked === 0 ? false : picked === e.options.length ? true : "mixed";
                const unfolded = expanded.has(e.key);
                const foldLabel = unfolded ? t.common.multiSelect.hideVariants(e.label) : t.common.multiSelect.showVariants(e.label);
                return (
                  <div key={`family:${e.key}`}>
                    <div className="flex items-center rounded-md hover:bg-surface-contrast/6">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={state}
                        onClick={() => toggleFamily(e.options)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-2 text-left text-sm"
                      >
                        <CheckBox state={state} />
                        {e.options[0].leading}
                        <span className="min-w-0 flex-1 truncate text-ink">{e.label}</span>
                        <span className="shrink-0 text-2xs text-ink-3">{t.common.multiSelect.variants(e.options.length)}</span>
                      </button>
                      <button
                        type="button"
                        aria-expanded={unfolded}
                        aria-label={foldLabel}
                        title={foldLabel}
                        onClick={() => toggleExpanded(e.key)}
                        className="mx-1 grid size-6 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-contrast/8 hover:text-ink"
                      >
                        <ChevronDown className={cn("size-3.5 transition-transform", unfolded && "rotate-180")} aria-hidden />
                      </button>
                    </div>
                    {unfolded && e.options.map((o) => optionRow(o, true))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-end border-t border-surface-contrast/8 pt-2.5">
          <button type="button" onClick={close} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-space-950">
            {t.common.multiSelect.apply(draft.size)}
          </button>
        </div>
      </div>
    </Popover>
  );
}
