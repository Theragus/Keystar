import { addDays, daysBetween, isoDate, isValidIsoDate, type DateBucket } from "@/lib/dates";
import { isJournalCategory, type JournalCategory } from "./classify";

/**
 * Corporation wallet filters, kept in the URL like the mining dashboards. Isomorphic.
 */
export type JournalFlowFilter = "all" | "income" | "expense" | "transfer";

export const JOURNAL_FLOWS: JournalFlowFilter[] = ["all", "income", "expense", "transfer"];

export const WALLET_BUCKETS: DateBucket[] = ["day", "week", "month"];

export interface CorpWalletFilters {
  from: string;
  to: string;
  /** Wallet divisions to include (empty = all). */
  divisions: number[];
  bucket: DateBucket;
  /** Journal page only (empty = all). */
  categories: JournalCategory[];
  flow: JournalFlowFilter;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseCorpWalletFilters(params: RawParams, today: string = isoDate(new Date())): CorpWalletFilters {
  let from = first(params.from);
  let to = first(params.to);
  if (!isValidIsoDate(from)) from = addDays(today, -29);
  if (!isValidIsoDate(to)) to = today;
  if (from > to) [from, to] = [to, from];
  // Keep queries bounded: at most ~3 years per view.
  if (daysBetween(from, to) > 1100) from = addDays(to, -1099);

  const divisions = [
    ...new Set(
      (first(params.divisions) ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7),
    ),
  ].sort((a, b) => a - b);
  const bucket = first(params.bucket);
  const flow = first(params.flow);
  return {
    from,
    to,
    divisions,
    bucket: bucket === "week" || bucket === "month" ? bucket : "day",
    categories: [...new Set((first(params.categories) ?? "").split(",").filter(isJournalCategory))],
    flow: (JOURNAL_FLOWS as string[]).includes(flow ?? "") ? (flow as JournalFlowFilter) : "all",
    page: Math.max(1, Math.min(10_000, Math.floor(Number(first(params.page))) || 1)),
  };
}

/** Serialises filters back into a query string, omitting defaults. */
export function corpWalletQueryString(f: CorpWalletFilters, overrides: Partial<CorpWalletFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  p.set("from", v.from);
  p.set("to", v.to);
  if (v.divisions.length) p.set("divisions", v.divisions.join(","));
  if (v.bucket !== "day") p.set("bucket", v.bucket);
  if (v.categories.length) p.set("categories", v.categories.join(","));
  if (v.flow !== "all") p.set("flow", v.flow);
  if (v.page > 1) p.set("page", String(v.page));
  return p.toString();
}
