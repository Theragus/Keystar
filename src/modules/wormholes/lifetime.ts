/**
 * Wormhole lifetime maths. EVE's "Show Info" only gives bands (more than a
 * day, less than a day, less than 4 hours …), and nobody knows when a hole
 * spawned, so Keystar keeps an upper bound of its remaining life:
 *
 *   expiresBy = min(firstSeenAt + type lifetime, lifeSetAt + upper end of the band)
 *
 * Both terms are fixed timestamps, so the bound is stored on the connection
 * and only recomputed when it is edited; the worker never needs type data.
 */

export const LIFE_STATES = ["fresh", "lt1d", "lt4h", "lt1h", "closing"] as const;
export type LifeState = (typeof LIFE_STATES)[number];

export const MASS_STATES = ["stable", "reduced", "critical"] as const;
export type MassState = (typeof MASS_STATES)[number];

/** Upper end of each band in hours (fresh: no upper end of its own). */
export const BAND_UPPER_H: Record<LifeState, number> = {
  fresh: Infinity,
  lt1d: 24,
  lt4h: 4,
  lt1h: 1,
  closing: 0,
};

/** Lifetime assumed when the type is unknown (K162 on both sides): the longest any wormhole lives. */
export const MAX_LIFETIME_H = 48;

/** How long a collapsed connection stays on the map (faded) before housekeeping removes it. */
export const COLLAPSE_GRACE_MS = 60 * 60 * 1000;

const HOUR = 3_600_000;

export interface LifetimeInput {
  firstSeenAt: Date;
  lifeState: LifeState;
  lifeSetAt: Date;
}

export function expiresBy(input: LifetimeInput, typeLifeH: number | null): Date {
  const byType = input.firstSeenAt.getTime() + (typeLifeH ?? MAX_LIFETIME_H) * HOUR;
  const band = BAND_UPPER_H[input.lifeState];
  const byBand = Number.isFinite(band) ? input.lifeSetAt.getTime() + band * HOUR : Infinity;
  return new Date(Math.min(byType, byBand));
}

/** Milliseconds left at most (0 once the bound has passed). */
export function timeLeft(expires: Date | string, now: Date): number {
  return Math.max(0, new Date(expires).getTime() - now.getTime());
}

export function isCollapsed(expires: Date | string, now: Date): boolean {
  return new Date(expires).getTime() <= now.getTime();
}

/**
 * The band the hole is in by now, judging by its upper bound: a hole marked
 * "less than a day" twenty hours ago is drawn as end of life. The bound
 * includes the type's lifetime on purpose: a 16-hour type can't have more
 * than a day left, so the game never shows it as "more than a day" either.
 */
export function displayBand(state: LifeState, expires: Date | string, now: Date): LifeState {
  const leftH = timeLeft(expires, now) / HOUR;
  const byTime: LifeState = leftH <= 0 ? "closing" : leftH <= 1 ? "lt1h" : leftH <= 4 ? "lt4h" : leftH <= 24 ? "lt1d" : "fresh";
  return LIFE_STATES.indexOf(byTime) > LIFE_STATES.indexOf(state) ? byTime : state;
}
