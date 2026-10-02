import { isOreClass, type OreClass } from "@/core/eve/ore";

/**
 * Mining dashboard filters, kept in the URL so views are shareable and the
 * server can render them. Isomorphic.
 */
export type MiningSource = "all" | "personal" | "observer";
export type MiningMetric = "value" | "volume" | "quantity";
export type MiningGroupBy = "user" | "character";

export interface MiningFilters {
  from: string;
  to: string;
  characters: number[];
  types: number[];
  classes: OreClass[];
  systems: number[];
  source: MiningSource;
  metric: MiningMetric;
  groupBy: MiningGroupBy;
  page: number;
}

export const MINING_SOURCES: { value: MiningSource; label: string; hint: string }[] = [
  { value: "all", label: "Combined", hint: "Member ledgers plus observer entries not already covered by them" },
  { value: "personal", label: "Member ledgers", hint: "Personal ledgers of registered characters (all mining)" },
  { value: "observer", label: "Refineries", hint: "Moon mining recorded by corporation refineries (anyone)" },
];

export const MINING_METRICS: { value: MiningMetric; label: string }[] = [
  { value: "value", label: "ISK" },
  { value: "volume", label: "m³" },
  { value: "quantity", label: "Units" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function idList(v: string | string[] | undefined): number[] {
  const raw = Array.isArray(v) ? v.join(",") : (v ?? "");
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  ].slice(0, 500);
}

export function parseMiningFilters(params: RawParams, today: string = isoDate(new Date())): MiningFilters {
  let from = first(params.from);
  let to = first(params.to);
  if (!from || !DATE_RE.test(from)) from = addDays(today, -29);
  if (!to || !DATE_RE.test(to)) to = today;
  if (from > to) [from, to] = [to, from];
  // Keep queries bounded: at most ~3 years per view.
  if (daysBetween(from, to) > 1100) from = addDays(to, -1099);

  const source = first(params.source);
  const metric = first(params.metric);
  const groupBy = first(params.by);
  const classes = (first(params.classes) ?? "").split(",").filter(isOreClass);
  const page = Math.max(1, Math.min(10_000, Number(first(params.page)) || 1));

  return {
    from,
    to,
    characters: idList(params.chars),
    types: idList(params.types),
    classes,
    systems: idList(params.systems),
    source: source === "personal" || source === "observer" ? source : "all",
    metric: metric === "volume" || metric === "quantity" ? metric : "value",
    groupBy: groupBy === "character" ? "character" : "user",
    page,
  };
}

/** Serialises filters back into a query string, omitting defaults. */
export function miningQueryString(f: MiningFilters, overrides: Partial<MiningFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  p.set("from", v.from);
  p.set("to", v.to);
  if (v.characters.length) p.set("chars", v.characters.join(","));
  if (v.types.length) p.set("types", v.types.join(","));
  if (v.classes.length) p.set("classes", v.classes.join(","));
  if (v.systems.length) p.set("systems", v.systems.join(","));
  if (v.source !== "all") p.set("source", v.source);
  if (v.metric !== "value") p.set("metric", v.metric);
  if (v.groupBy !== "user") p.set("by", v.groupBy);
  if (v.page > 1) p.set("page", String(v.page));
  return p.toString();
}
