/**
 * Calendar-date helpers shared by dashboards. Dates are EVE (UTC) days in
 * YYYY-MM-DD form. Isomorphic.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, 2026-99-99, …). */
export function isValidIsoDate(value: string | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export interface DatePreset {
  id: string;
  label: string;
  range: (today: string) => { from: string; to: string };
}

export const DATE_PRESETS: DatePreset[] = [
  { id: "7d", label: "7 days", range: (t) => ({ from: addDays(t, -6), to: t }) },
  { id: "30d", label: "30 days", range: (t) => ({ from: addDays(t, -29), to: t }) },
  { id: "90d", label: "90 days", range: (t) => ({ from: addDays(t, -89), to: t }) },
  { id: "mtd", label: "This month", range: (t) => ({ from: `${t.slice(0, 7)}-01`, to: t }) },
  {
    id: "lm",
    label: "Last month",
    range: (t) => {
      const firstThis = `${t.slice(0, 7)}-01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    },
  },
  { id: "ytd", label: "Year to date", range: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) },
];

export type DateBucket = "day" | "week" | "month";

/** Monday of the ISO week containing `date`. */
export function startOfIsoWeek(date: string): string {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

/** First day of the day/week/month bucket containing `date`. */
export function bucketStart(date: string, bucket: DateBucket): string {
  if (bucket === "week") return startOfIsoWeek(date);
  if (bucket === "month") return `${date.slice(0, 7)}-01`;
  return date;
}

/** Last day (inclusive) of the bucket starting at `start`. */
export function bucketEnd(start: string, bucket: DateBucket): string {
  if (bucket === "week") return addDays(start, 6);
  if (bucket === "month") {
    const d = new Date(`${start}T00:00:00Z`);
    return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  }
  return start;
}

/** Half-open UTC bounds of a day range as ISO strings (raw Dates aren't valid SQL parameters here). */
export function utcDayBounds(from: string, to: string): { start: string; end: string } {
  return { start: `${from}T00:00:00Z`, end: `${addDays(to, 1)}T00:00:00Z` };
}
