import { DECAY_HALF_LIFE_DAYS } from "../constants";

export const DAY_MS = 86_400_000;

/** Weight of an event `ageMs` old: 1 now, ½ after one half-life, ¼ after two … */
export function decayWeight(ageMs: number, halfLifeDays: number = DECAY_HALF_LIFE_DAYS): number {
  if (!(ageMs > 0)) return 1;
  return 0.5 ** (ageMs / (halfLifeDays * DAY_MS));
}

/** Weight of an event at `time` as seen at `now`. */
export function weightAt(time: Date | string, now: Date, halfLifeDays: number = DECAY_HALF_LIFE_DAYS): number {
  const t = typeof time === "string" ? Date.parse(time) : time.getTime();
  return decayWeight(now.getTime() - t, halfLifeDays);
}

/** Saturating curve: 0 at 0, about 63 at `scale`, approaching 100. */
export function saturate(x: number, scale: number): number {
  if (!(x > 0) || !(scale > 0)) return 0;
  return 100 * (1 - Math.exp(-x / scale));
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
