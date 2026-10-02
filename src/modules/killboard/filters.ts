import type { Locale } from "@/i18n/config";
import { addDays, daysBetween, isoDate, isValidIsoDate } from "@/lib/dates";

/**
 * Killboard period and comparison windows, kept in the URL. Isomorphic.
 *
 * The headline numbers cover the selected period. Week-over-week figures
 * compare the last 7 *complete* EVE days of that period with the 7 days
 * before, so they don't jump around while today is still in progress.
 */
export interface DateRange {
  from: string;
  to: string;
}

export interface KillboardWindows {
  period: DateRange;
  week: DateRange;
  prevWeek: DateRange;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const DEFAULT_DAYS = 90;

export function parseKillboardFilters(params: RawParams, today: string = isoDate(new Date())): DateRange {
  let from = first(params.from);
  let to = first(params.to);
  if (!isValidIsoDate(from)) from = addDays(today, -(DEFAULT_DAYS - 1));
  if (!isValidIsoDate(to)) to = today;
  if (from > to) [from, to] = [to, from];
  if (to > today) to = today;
  if (from > to) from = to;
  if (daysBetween(from, to) > 1100) from = addDays(to, -1099);
  return { from, to };
}

export function weekEnding(to: string): { week: DateRange; prevWeek: DateRange } {
  return {
    week: { from: addDays(to, -6), to },
    prevWeek: { from: addDays(to, -13), to: addDays(to, -7) },
  };
}

export function killboardWindows(period: DateRange, today: string): KillboardWindows {
  // Today is still running; a past period's last day is complete.
  const weekTo = period.to >= today ? addDays(today, -1) : period.to;
  return { period, ...weekEnding(weekTo) };
}

/**
 * The 7-day window a situation report covers at `now`: up to the last
 * complete EVE day, with a 2-hour grace period so zKillboard has caught up
 * on killmails from the final hours.
 */
export function reportWindow(now: Date): { week: DateRange; prevWeek: DateRange } {
  const to = isoDate(new Date(now.getTime() - 26 * 3600 * 1000));
  return weekEnding(to);
}

/** The smallest range covering all the given ones. */
export function spanOf(...ranges: DateRange[]): DateRange {
  return {
    from: ranges.reduce((m, r) => (r.from < m ? r.from : m), ranges[0].from),
    to: ranges.reduce((m, r) => (r.to > m ? r.to : m), ranges[0].to),
  };
}

const RANGE_LOCALE: Record<Locale, string> = { en: "en-US", de: "de-DE" };

/**
 * "Sep 25 – Oct 1" / "25. Sept. – 1. Okt." in EVE time. English unless a
 * locale is given: the stored situation report uses it and stays English.
 */
export function rangeLabel(r: DateRange, locale: Locale = "en"): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(RANGE_LOCALE[locale], { day: "numeric", month: "short", timeZone: "UTC" });
  return r.from === r.to ? fmt(r.from) : `${fmt(r.from)} – ${fmt(r.to)}`;
}

export function killboardQueryString(r: DateRange): string {
  return new URLSearchParams({ from: r.from, to: r.to }).toString();
}

/** EVE's in-universe year (YC) for a calendar date. */
export function ycYear(date: string): number {
  return Number(date.slice(0, 4)) - 1898;
}
