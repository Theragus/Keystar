import { DEFAULT_PACE, DEFAULT_WINDOW, MAX_AVOID, PACES, WINDOWS, type Pace, type WindowHours } from "./constants";
import { PREFERENCES, type RoutePreference } from "./route";
import { findSystem, type Universe, type UniverseSystem } from "./universe";

/** The gate check's form, kept in the URL (`/gatecheck?from=Jita&to=Amamake&pref=safer`). Pure. */
export interface GatecheckQuery {
  from: string;
  to: string;
  preference: RoutePreference;
  /** Avoided systems as typed (names, comma separated). */
  avoid: string;
  windowHours: WindowHours;
  pace: Pace;
  /** "" for now, else an EVE time (UTC) as "YYYY-MM-DDTHH:MM". */
  depart: string;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : (v?.[0] ?? "")).slice(0, 400);

export function parseQuery(params: Params): GatecheckQuery {
  const pref = one(params.pref);
  const window = Number(one(params.window));
  const pace = one(params.pace);
  const depart = one(params.depart).trim();
  return {
    from: one(params.from).trim(),
    to: one(params.to).trim(),
    preference: (PREFERENCES as readonly string[]).includes(pref) ? (pref as RoutePreference) : "shortest",
    avoid: one(params.avoid).trim(),
    windowHours: (WINDOWS as readonly number[]).includes(window) ? (window as WindowHours) : DEFAULT_WINDOW,
    pace: pace in PACES ? (pace as Pace) : DEFAULT_PACE,
    depart: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(depart) ? depart : "",
  };
}

/** When the trip starts: now, or the EVE time asked for (never in the past, at most a week ahead). */
export function departureTime(depart: string, now: Date): Date {
  if (!depart) return now;
  const t = Date.parse(`${depart}:00Z`);
  if (!Number.isFinite(t) || t <= now.getTime()) return now;
  return new Date(Math.min(t, now.getTime() + 7 * 86_400_000));
}

export interface ResolvedQuery {
  from: UniverseSystem | null;
  to: UniverseSystem | null;
  avoid: UniverseSystem[];
  /** Avoid entries that are no known-space system with stargates. */
  unknownAvoid: string[];
}

export function resolveQuery(u: Universe, q: GatecheckQuery): ResolvedQuery {
  const avoid: UniverseSystem[] = [];
  const unknownAvoid: string[] = [];
  for (const name of q.avoid
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_AVOID)) {
    const s = findSystem(u, name);
    if (s) {
      if (!avoid.some((a) => a.id === s.id)) avoid.push(s);
    } else unknownAvoid.push(name);
  }
  return {
    from: findSystem(u, q.from),
    to: findSystem(u, q.to),
    avoid,
    unknownAvoid,
  };
}

/** The URL of a gate check with some fields changed (avoid one more system, another preference …). */
export function gatecheckHref(q: GatecheckQuery, change: Partial<GatecheckQuery> = {}): string {
  const next = { ...q, ...change };
  const params = new URLSearchParams();
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.preference !== "shortest") params.set("pref", next.preference);
  if (next.avoid) params.set("avoid", next.avoid);
  if (next.windowHours !== DEFAULT_WINDOW) params.set("window", String(next.windowHours));
  if (next.pace !== DEFAULT_PACE) params.set("pace", next.pace);
  if (next.depart) params.set("depart", next.depart);
  const query = params.toString();
  return query ? `/gatecheck?${query}` : "/gatecheck";
}
