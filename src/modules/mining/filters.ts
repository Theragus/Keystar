import { isOreClass, type OreClass } from "@/core/eve/ore";
import { addDays, daysBetween, isoDate, isValidIsoDate } from "@/lib/dates";

export { addDays, DATE_PRESETS, daysBetween, isoDate, isValidIsoDate, type DatePreset } from "@/lib/dates";

/**
 * Mining dashboard filters, kept in the URL so views are shareable and the
 * server can render them. Isomorphic.
 */
export type MiningSource = "all" | "personal" | "observer";
export type MiningMetric = "value" | "volume" | "quantity";
export type MiningGroupBy = "user" | "character";
/** Whose mining a viewer with corporation access looks at; everyone else always sees their own. */
export type MiningView = "corp" | "own";

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
  view: MiningView;
  page: number;
}

/** Options in display order; labels and hints live in the dictionaries (`t.mining.sources`, `t.mining.metrics`). */
export const MINING_SOURCES: readonly MiningSource[] = ["all", "personal", "observer"];

export const MINING_METRICS: readonly MiningMetric[] = ["value", "volume", "quantity"];

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
  if (!isValidIsoDate(from)) from = addDays(today, -29);
  if (!isValidIsoDate(to)) to = today;
  if (from > to) [from, to] = [to, from];
  // Keep queries bounded: at most ~3 years per view.
  if (daysBetween(from, to) > 1100) from = addDays(to, -1099);

  const source = first(params.source);
  const metric = first(params.metric);
  const groupBy = first(params.by);
  const view = first(params.view);
  const classes = (first(params.classes) ?? "").split(",").filter(isOreClass);
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(first(params.page))) || 1));

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
    view: view === "own" ? "own" : "corp",
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
  if (v.view !== "corp") p.set("view", v.view);
  if (v.page > 1) p.set("page", String(v.page));
  return p.toString();
}
