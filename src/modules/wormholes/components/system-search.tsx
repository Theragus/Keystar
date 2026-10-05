"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type Ref } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { shortClass, type SystemSummary } from "../static";
import { ClassBadge } from "./class-badge";

const DEBOUNCE_MS = 150;

/**
 * Typeahead over every system Keystar knows (J-codes with or without the J,
 * k-space names). Asks /api/wormholes/systems and drops stale answers.
 */
export function SystemSearch({
  onSelect,
  placeholder,
  label,
  inputRef,
  autoFocus,
  className,
  exclude,
}: {
  onSelect: (system: SystemSummary) => void;
  placeholder?: string;
  label: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  className?: string;
  /** System ids not to offer (already on the map). */
  exclude?: ReadonlySet<number>;
}) {
  const { t } = useI18n();
  const tw = t.wormholes;
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SystemSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    abort.current?.abort();
    if (q.length < 2) return;
    const controller = new AbortController();
    abort.current = controller;
    const settle = (systems: SystemSummary[]) => {
      // A response that resolved after the query changed belongs to the old query.
      if (controller.signal.aborted) return;
      setResults(systems);
      setActive(0);
      setSearched(true);
    };
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/wormholes/systems?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        settle(res.ok ? ((await res.json()) as { systems: SystemSummary[] }).systems : []);
      } catch {
        // Offline: show nothing rather than the previous query's results; the next keystroke tries again.
        settle([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const shown = query.trim().length >= 2 ? results.filter((r) => !exclude?.has(r.id)) : [];

  const choose = (system: SystemSummary) => {
    onSelect(system);
    setQuery("");
    setResults([]);
    setSearched(false);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <label className="glass-inset flex h-9 items-center gap-2 rounded-lg px-3">
        <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span className="sr-only">{label}</span>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].id}` : undefined}
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder ?? tw.lookup.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          onChange={(e) => {
            setQuery(e.target.value);
            // Results belong to the previous text until the new search answers.
            setResults([]);
            setSearched(false);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && shown[active]) {
              e.preventDefault();
              choose(shown[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </label>
      {open && query.trim().length >= 2 && (shown.length > 0 || searched) && (
        <ul
          id={listId}
          role="listbox"
          className="glass absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-lg bg-space-800/95 p-1"
        >
          {shown.length === 0 && <li className="px-3 py-2 text-xs text-ink-3">{tw.lookup.noResults}</li>}
          {shown.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${s.id}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                i === active ? "bg-surface-contrast/10" : "hover:bg-surface-contrast/6",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(s)}
            >
              <ClassBadge cls={s.cls} sec={s.sec} />
              <span className="font-medium text-ink">{s.name}</span>
              <span className="truncate text-2xs text-ink-3">{s.region}</span>
              {s.statics.length > 0 && (
                <span className="ml-auto font-mono text-3xs text-ink-2">
                  {s.statics.map((st) => `${shortClass(st.dest)}·${st.code}`).join(" ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
