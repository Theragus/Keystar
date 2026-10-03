"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePendingNavigation } from "@/components/ui/pending";

const DEBOUNCE_MS = 300;

/**
 * Search box that keeps its term in the URL (`?q=` by default) and searches as
 * you type, so large lists are filtered and paged on the server. `keep` is the
 * rest of the page state (filters, not the page number, which a new search
 * resets). Needs a PendingProvider.
 */
export function SearchField({
  value,
  keep = {},
  label,
  placeholder,
  clearLabel,
  param = "q",
  maxLength = 100,
}: {
  /** The term the page was rendered with. */
  value: string;
  keep?: Record<string, string>;
  label: string;
  placeholder: string;
  clearLabel: string;
  param?: string;
  maxLength?: number;
}) {
  const { navigate, isPending } = usePendingNavigation();
  const [text, setText] = useState(value);
  const [sent, setSent] = useState(value);
  const [rendered, setRendered] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Follow the URL when it changes from elsewhere (back button, a link), but
  // not when it is just catching up with what was typed.
  if (value !== rendered) {
    setRendered(value);
    if (value !== sent) {
      setText(value);
      setSent(value);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (term: string) => {
    clearTimeout(timer.current);
    const q = term.trim();
    if (q === sent) return;
    setSent(q);
    const params = new URLSearchParams(keep);
    if (q) params.set(param, q);
    navigate(params.toString(), { replace: true });
  };

  return (
    <form
      role="search"
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        search(text);
      }}
    >
      <label className="glass-inset flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-3">
        {isPending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" aria-hidden />
        ) : (
          <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
        )}
        <span className="sr-only">{label}</span>
        <input
          type="search"
          name={param}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => search(next), DEBOUNCE_MS);
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </label>
      {text && (
        <button
          type="button"
          title={clearLabel}
          onClick={() => {
            setText("");
            search("");
          }}
          className="glass-chip grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">{clearLabel}</span>
        </button>
      )}
    </form>
  );
}
