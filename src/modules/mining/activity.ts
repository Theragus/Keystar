import { addDays, isoDate } from "@/lib/dates";

/**
 * Mining activity from ledger growth. ESI's personal mining ledger only has
 * daily totals, so the ledger sync compares each fresh snapshot with the
 * stored one: when a character's quantities grew, it was mining between the
 * previous observation and this one. The union of those windows gives active
 * hours (precision ≈ the sync interval). Pure logic; the ledger job persists
 * the result.
 */

/** Longer than this between observations and growth can't be placed in time (outage, paused sync, new token). */
export const MAX_OBSERVATION_GAP_MS = 40 * 60_000;
/** Growth this soon after the previous growth continues the same session (the ledger lags or a short pause). */
export const BRIDGE_MS = 35 * 60_000;
/** Last-Modified older than this is a "last changed" date rather than a snapshot time. */
const MAX_SNAPSHOT_AGE_MS = 15 * 60_000;

export interface LedgerQuantity {
  date: string;
  solarSystemId: number;
  typeId: number;
  quantity: number;
}

export interface ActivityCoverage {
  /** First observation: activity is known from here on. */
  since: Date;
  lastObservedAt: Date;
  /** End of the latest window with growth (null after a gap). */
  lastGrowthAt: Date | null;
}

export interface ActivityDelta {
  date: string;
  typeId: number;
  quantity: number;
}

export interface ActivityPlan {
  coverage: ActivityCoverage;
  window: { start: Date; end: Date } | null;
  deltas: ActivityDelta[];
}

/** When the snapshot was taken: ESI's Last-Modified if it is a plausible snapshot time, else now. */
export function observationTime(lastModified: Date | null, now: Date): Date {
  if (!lastModified) return now;
  const age = now.getTime() - lastModified.getTime();
  return age >= -60_000 && age <= MAX_SNAPSHOT_AGE_MS ? new Date(Math.min(lastModified.getTime(), now.getTime())) : now;
}

/**
 * Compares the stored ledger (`before`) with a fresh snapshot (`after`) taken
 * at `observedAt`. Returns null when the snapshot is not newer than the last
 * observation (nothing to record).
 */
export function planActivity(input: {
  before: LedgerQuantity[];
  after: LedgerQuantity[];
  coverage: ActivityCoverage | null;
  observedAt: Date;
}): ActivityPlan | null {
  const { before, after, coverage, observedAt } = input;
  if (!coverage) {
    return { coverage: { since: observedAt, lastObservedAt: observedAt, lastGrowthAt: null }, window: null, deltas: [] };
  }
  const now = observedAt.getTime();
  if (now <= coverage.lastObservedAt.getTime()) return null;
  if (now - coverage.lastObservedAt.getTime() > MAX_OBSERVATION_GAP_MS) {
    return { coverage: { ...coverage, lastObservedAt: observedAt, lastGrowthAt: null }, window: null, deltas: [] };
  }

  const bridged = coverage.lastGrowthAt !== null && now - coverage.lastGrowthAt.getTime() <= BRIDGE_MS;
  const start = bridged ? coverage.lastGrowthAt! : coverage.lastObservedAt;
  // Late corrections to old days and the 30-day backlog are not activity.
  const firstDate = addDays(isoDate(start), -1);
  const lastDate = isoDate(observedAt);

  const previous = new Map(before.map((r) => [`${r.date}|${r.solarSystemId}|${r.typeId}`, r.quantity]));
  const grown = new Map<string, ActivityDelta>();
  for (const r of after) {
    if (r.date < firstDate || r.date > lastDate) continue;
    const delta = r.quantity - (previous.get(`${r.date}|${r.solarSystemId}|${r.typeId}`) ?? 0);
    if (delta <= 0) continue;
    const key = `${r.date}|${r.typeId}`;
    const d = grown.get(key) ?? { date: r.date, typeId: r.typeId, quantity: 0 };
    d.quantity += delta;
    grown.set(key, d);
  }
  const deltas = [...grown.values()].sort((a, b) => a.date.localeCompare(b.date) || a.typeId - b.typeId);
  if (!deltas.length) {
    return { coverage: { ...coverage, lastObservedAt: observedAt }, window: null, deltas };
  }
  return {
    coverage: { ...coverage, lastObservedAt: observedAt, lastGrowthAt: observedAt },
    window: { start, end: observedAt },
    deltas,
  };
}
