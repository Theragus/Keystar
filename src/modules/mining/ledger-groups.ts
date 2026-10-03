/**
 * Groups a page of ledger rows by day for the ledger table. Isomorphic.
 *
 * Rows arrive sorted by date (descending), so a day's rows are contiguous;
 * grouping keeps that order. Day totals come from `getLedgerDayTotals`, not
 * from the rows, because a day can straddle pages.
 */
import type { LedgerDayTotals, LedgerRow } from "./queries";

export interface LedgerDayGroup {
  date: string;
  rows: LedgerRow[];
  /** Totals over every entry of the day, not just the rows on this page. */
  totals: LedgerDayTotals;
}

export function groupLedgerByDay(rows: readonly LedgerRow[], dayTotals: readonly LedgerDayTotals[]): LedgerDayGroup[] {
  const totalsByDate = new Map(dayTotals.map((d) => [d.date, d]));
  const groups: LedgerDayGroup[] = [];
  for (const row of rows) {
    let group = groups.at(-1);
    if (group?.date !== row.date) {
      group = { date: row.date, rows: [], totals: totalsByDate.get(row.date) ?? emptyTotals(row.date) };
      groups.push(group);
    }
    group.rows.push(row);
  }
  // Without whole-day totals (e.g. a row synced between the two queries), fall back to the page's rows.
  for (const g of groups) {
    if (g.totals.entries < g.rows.length) g.totals = sumRows(g.date, g.rows);
  }
  return groups;
}

function emptyTotals(date: string): LedgerDayTotals {
  return { date, entries: 0, characters: 0, quantity: 0, volume: 0, value: 0 };
}

function sumRows(date: string, rows: readonly LedgerRow[]): LedgerDayTotals {
  return {
    date,
    entries: rows.length,
    characters: new Set(rows.map((r) => r.characterId)).size,
    quantity: rows.reduce((s, r) => s + r.quantity, 0),
    volume: rows.reduce((s, r) => s + r.volume, 0),
    value: rows.reduce((s, r) => s + r.value, 0),
  };
}
