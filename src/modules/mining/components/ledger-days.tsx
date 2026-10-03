"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Collapsible day groups for the mining ledger. Rows are rendered on the
 * server and passed in; only the open/closed state lives here. Days start
 * expanded; the page re-keys the provider so each page and filter change does too.
 */
interface DaysContextValue {
  isCollapsed(date: string): boolean;
  toggle(date: string): void;
  setAll(collapsed: boolean): void;
  /** True when every day on this page is collapsed. */
  everyCollapsed: boolean;
}

const DaysContext = createContext<DaysContextValue | null>(null);

function useDays(): DaysContextValue {
  const ctx = useContext(DaysContext);
  if (!ctx) throw new Error("LedgerDay must be inside LedgerDaysProvider");
  return ctx;
}

export function LedgerDaysProvider({ dates, children }: { dates: string[]; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const isCollapsed = (date: string) => collapsed.has(date);
  const value: DaysContextValue = {
    isCollapsed,
    toggle: (date) =>
      setCollapsed((c) => {
        const next = new Set(c);
        if (!next.delete(date)) next.add(date);
        return next;
      }),
    setAll: (all) => setCollapsed(new Set(all ? dates : [])),
    everyCollapsed: dates.length > 0 && dates.every(isCollapsed),
  };
  return <DaysContext value={value}>{children}</DaysContext>;
}

export function LedgerDaysToggleAll() {
  const { t } = useI18n();
  const { everyCollapsed, setAll } = useDays();
  const Icon = everyCollapsed ? ChevronsUpDown : ChevronsDownUp;
  return (
    <button
      type="button"
      onClick={() => setAll(!everyCollapsed)}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-3 transition hover:bg-white/6 hover:text-ink"
    >
      <Icon className="size-3.5" aria-hidden />
      {everyCollapsed ? t.mining.ledger.expandAll : t.mining.ledger.collapseAll}
    </button>
  );
}

/**
 * One day: a header row (the label spans the descriptive columns, `totals` are
 * the remaining cells) and its entry rows, hidden while collapsed.
 */
export function LedgerDay({
  date,
  label,
  span,
  totals,
  children,
}: {
  date: string;
  label: ReactNode;
  span: number;
  totals: ReactNode;
  children: ReactNode;
}) {
  const { isCollapsed, toggle } = useDays();
  const collapsed = isCollapsed(date);
  // Collapsed rows stay in the table, flattened and invisible (see `.ks-table [data-collapsed]`), so they keep
  // sizing the columns: dropping them would reflow every column when all days are closed.
  return (
    <tbody data-collapsed={collapsed || undefined}>
      {/* The whole row is a click target for the mouse; the button is the keyboard and screen-reader control. */}
      <tr className="ks-group-row cursor-pointer" onClick={() => toggle(date)}>
        <th scope="rowgroup" colSpan={span}>
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation();
              toggle(date);
            }}
            className="flex w-full items-center gap-2 rounded text-left"
          >
            <ChevronDown
              className={cn("size-4 shrink-0 text-ink-3 transition-transform", collapsed && "-rotate-90")}
              aria-hidden
            />
            {label}
          </button>
        </th>
        {totals}
      </tr>
      {children}
    </tbody>
  );
}
