import { addDays, bucketEnd, bucketStart, type DateBucket } from "@/lib/dates";
import type { DailyFlowRow, DivisionRow } from "./queries";
import { WALLET_DIVISIONS } from "./divisions";

/**
 * Turns the daily journal sums into the corporation wallet overview: totals, day/week/month buckets and one line
 * per division. Transfers between the corporation's own divisions are reported separately and never count as
 * income or expenses. Isomorphic.
 */
export interface WalletBucket {
  start: string;
  end: string;
  income: number;
  expenses: number;
  net: number;
  /** The bucket reaches outside the selected range. */
  partial: boolean;
}

export interface DivisionSummary {
  division: number;
  name: string | null;
  balance: number | null;
  balanceAt: Date | null;
  income: number;
  expenses: number;
  net: number;
  /** Moved in from other divisions minus moved out to them. */
  transfersNet: number;
}

export interface WalletReport {
  totals: {
    /** Current balance of the selected divisions (null when no balance was read yet). */
    balance: number | null;
    income: number;
    expenses: number;
    net: number;
    /** ISK moved into the selected divisions from other divisions. */
    transfers: number;
  };
  buckets: WalletBucket[];
  divisions: DivisionSummary[];
}

export function buildWalletReport(input: {
  from: string;
  to: string;
  bucket: DateBucket;
  /** Selected divisions; empty = all. */
  selected: number[];
  flows: DailyFlowRow[];
  divisions: DivisionRow[];
}): WalletReport {
  const { from, to, bucket, flows } = input;
  const selected = input.selected.length ? input.selected : [...WALLET_DIVISIONS];

  const buckets = new Map<string, WalletBucket>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const start = bucketStart(d, bucket);
    if (!buckets.has(start)) {
      const end = bucketEnd(start, bucket);
      buckets.set(start, { start, end, income: 0, expenses: 0, net: 0, partial: start < from || end > to });
    }
  }

  const known = new Map(input.divisions.map((d) => [d.division, d]));
  const byDivision = new Map<number, DivisionSummary>(
    selected.map((division) => {
      const d = known.get(division);
      return [
        division,
        {
          division,
          name: d?.name ?? null,
          balance: d?.balance ?? null,
          balanceAt: d?.balanceAt ?? null,
          income: 0,
          expenses: 0,
          net: 0,
          transfersNet: 0,
        },
      ];
    }),
  );

  const totals = { balance: null as number | null, income: 0, expenses: 0, net: 0, transfers: 0 };
  for (const r of flows) {
    const div = byDivision.get(r.division);
    if (!div) continue;
    div.income += r.income;
    div.expenses += r.expenses;
    div.transfersNet += r.transfersIn - r.transfersOut;
    totals.income += r.income;
    totals.expenses += r.expenses;
    totals.transfers += r.transfersIn;
    const b = buckets.get(bucketStart(r.date, bucket));
    if (b) {
      b.income += r.income;
      b.expenses += r.expenses;
    }
  }
  totals.net = totals.income - totals.expenses;
  for (const b of buckets.values()) b.net = b.income - b.expenses;
  for (const d of byDivision.values()) {
    d.net = d.income - d.expenses;
    if (d.balance !== null) totals.balance = (totals.balance ?? 0) + d.balance;
  }

  return { totals, buckets: [...buckets.values()], divisions: [...byDivision.values()] };
}
