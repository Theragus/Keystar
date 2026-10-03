import type { DateBucket } from "@/lib/dates";
import { isoDate, parseMiningFilters, type MiningFilters } from "../filters";
import type { ExpenseStatus } from "./categories";

/**
 * Mining P&L filters, kept in the URL like the mining dashboards. Isomorphic.
 */
export type StatusFilter = "mining" | ExpenseStatus;

export interface PnlFilters {
  from: string;
  to: string;
  /** Own characters to include (empty = all of them). */
  characters: number[];
  bucket: DateBucket;
  /** Expenses page: which purchases to list ("mining" = counted, suggested and excluded). */
  status: StatusFilter;
  page: number;
}

export const PNL_BUCKETS: { value: DateBucket; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "mining", label: "Mining costs" },
  { value: "suggested", label: "Suggested" },
  { value: "counted", label: "Counted" },
  { value: "excluded", label: "Excluded" },
  { value: "untagged", label: "Other purchases" },
];

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parsePnlFilters(params: RawParams, today: string = isoDate(new Date())): PnlFilters {
  const base = parseMiningFilters(params, today);
  const bucket = first(params.bucket);
  const status = first(params.status);
  return {
    from: base.from,
    to: base.to,
    characters: base.characters,
    bucket: bucket === "week" || bucket === "month" ? bucket : "day",
    status: STATUS_FILTERS.some((s) => s.value === status) ? (status as StatusFilter) : "mining",
    page: base.page,
  };
}

/** Serialises filters back into a query string, omitting defaults. */
export function pnlQueryString(f: PnlFilters, overrides: Partial<PnlFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  p.set("from", v.from);
  p.set("to", v.to);
  if (v.characters.length) p.set("chars", v.characters.join(","));
  if (v.bucket !== "day") p.set("bucket", v.bucket);
  if (v.status !== "mining") p.set("status", v.status);
  if (v.page > 1) p.set("page", String(v.page));
  return p.toString();
}

/** Mining-ledger filters for the P&L: all sources (de-duplicated), no type/system/class filters. */
export function pnlLedgerFilters(range: { from: string; to: string }, characters: number[]): MiningFilters {
  return {
    from: range.from,
    to: range.to,
    characters,
    types: [],
    classes: [],
    systems: [],
    source: "all",
    metric: "value",
    groupBy: "character",
    page: 1,
  };
}
