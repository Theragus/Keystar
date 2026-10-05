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
  const keepQuery = new URLSearchParams(keep).toString();
  const [text, setText] = useState(value);
  const [sent, setSent] = useState(value);
  const [rendered, setRendered] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The debounced search runs after later renders; it reads the page state from
  // here, so a filter clicked while typing is kept instead of being undone.
  const latest = useRef({ keepQuery, sent, text });
  useEffect(() => {
    latest.current = { keepQuery, sent, text };
  }, [keepQuery, sent, text]);

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

  // A link clicked while a search is still waiting (a filter tile, say) would
  // be overridden by that search firing with the old state. Hold the search
  // back instead, and apply it on top of the state the link lands on.
  const resend = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (timer.current === undefined || !(e.target instanceof Element)) return;
      const link = e.target.closest("a[href]");
      if (!link || form.current?.contains(link)) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      resend.current = true;
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const search = (term: string) => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const q = term.trim();
    if (q === latest.current.sent) return;
    latest.current.sent = q;
    setSent(q);
    const params = new URLSearchParams(latest.current.keepQuery);
    if (q) params.set(param, q);
    navigate(params.toString(), { replace: true });
  };

  useEffect(() => {
    if (!resend.current) return;
    resend.current = false;
    search(latest.current.text);
    // Runs once the clicked link's page state has rendered; `search` reads everything else from `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepQuery, value]);

  return (
    <form
      ref={form}
      role="search"
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        search(text);
      }}
    >
      <label className="glass-inset field-focus flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-3">
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
            // Dropped if the box was overwritten meanwhile (back button, a link).
            timer.current = setTimeout(() => latest.current.text === next && search(next), DEBOUNCE_MS);
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none [&::-webkit-search-cancel-button]:hidden"
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
