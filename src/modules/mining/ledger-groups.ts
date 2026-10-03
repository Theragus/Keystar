/**
 * Groups a page of ledger rows by day and, optionally, by a second level within
 * each day (pilot, character or system) for the ledger table. Isomorphic.
 *
 * Rows arrive sorted by date (descending) and, when grouped, by group within the
 * day, so both levels are contiguous; grouping keeps that order. Totals come
 * from `getLedgerTotals`, not from the rows, because a day or group can straddle
 * pages.
 */
import type { LedgerGroupTotals, LedgerRow, LedgerTotals } from "./queries";

export interface LedgerSubgroup {
  key: string;
  rows: LedgerRow[];
  /** Totals over every entry of the group that day, not just the rows on this page. */
  totals: LedgerTotals;
}

export interface LedgerDayGroup {
  date: string;
  rows: LedgerRow[];
  /** Totals over every entry of the day, not just the rows on this page. */
  totals: LedgerTotals;
  /** The day's second-level groups, or null when the ledger is grouped by day only. */
  groups: LedgerSubgroup[] | null;
}

export function groupLedger(
  rows: readonly LedgerRow[],
  totals: { days: readonly LedgerTotals[]; groups: readonly LedgerGroupTotals[] },
  grouped: boolean,
): LedgerDayGroup[] {
  const dayTotals = new Map(totals.days.map((d) => [d.date, d]));
  const groupTotals = new Map(totals.groups.map((g) => [`${g.date}|${g.key}`, g]));
  return contiguous(rows, (r) => r.date).map((dayRows) => {
    const date = dayRows[0].date;
    return {
      date,
      rows: dayRows,
      totals: wholeOrPage(dayTotals.get(date), date, dayRows),
      groups: grouped
        ? contiguous(dayRows, (r) => r.groupKey ?? "").map((groupRows) => {
            const key = groupRows[0].groupKey ?? "";
            return { key, rows: groupRows, totals: wholeOrPage(groupTotals.get(`${date}|${key}`), date, groupRows) };
          })
        : null,
    };
  });
}

/** Splits rows into runs that share a key, in order. */
function contiguous(rows: readonly LedgerRow[], key: (r: LedgerRow) => string): LedgerRow[][] {
  const runs: LedgerRow[][] = [];
  for (const row of rows) {
    const run = runs.at(-1);
    if (run && key(run[0]) === key(row)) run.push(row);
    else runs.push([row]);
  }
  return runs;
}

// Without whole totals (e.g. a row synced between the two queries), fall back to the page's rows.
function wholeOrPage(totals: LedgerTotals | undefined, date: string, rows: readonly LedgerRow[]): LedgerTotals {
  if (totals && totals.entries >= rows.length) return totals;
  return {
    date,
    entries: rows.length,
    characters: new Set(rows.map((r) => r.characterId)).size,
    quantity: rows.reduce((s, r) => s + r.quantity, 0),
    volume: rows.reduce((s, r) => s + r.volume, 0),
    value: rows.reduce((s, r) => s + r.value, 0),
  };
}
