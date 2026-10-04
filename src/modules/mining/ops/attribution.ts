import type { MiningOpParticipation } from "../schema";

/**
 * Which mining counts for a mining op. Pure logic; ops/queries.ts loads the
 * inputs. ESI's personal ledger only has daily totals, so the ore comes from
 * measured activity windows (ledger growth between two syncs, see
 * activity.ts): a window inside the op counts in full, one that straddles its
 * start or end counts by the share of its duration inside. The precision is
 * the sync interval (~15 minutes).
 */

/** The ledger shows ore some minutes after it was mined, so the op's end is extended by this much. */
export const DEFAULT_END_GRACE_MS = 15 * 60_000;

export interface OpWindow {
  characterId: number;
  start: Date;
  end: Date;
  /** 0: recorded before Keystar kept the system (matches only ops without a system filter). */
  solarSystemId: number;
  typeId: number;
  quantity: number;
}

export interface TimeSpan {
  start: Date;
  /** null: still open. */
  end: Date | null;
}

export interface OpOverride {
  mode: "included" | "excluded";
  self: boolean;
}

export interface AttributionInput {
  startsAt: Date;
  /** null: running; counts up to `now`. */
  endsAt: Date | null;
  now: Date;
  graceMs?: number;
  solarSystemIds: number[];
  participation: MiningOpParticipation;
  /** Activity windows overlapping the op, already filtered by ore class. */
  windows: OpWindow[];
  /** fleet mode: when each character was in the linked fleet. */
  fleetSpans?: Map<number, TimeSpan[]>;
  /** calendar mode: characters that accepted the linked event. */
  accepted?: Set<number>;
  overrides?: Map<number, OpOverride>;
}

/** counted: in the split. excluded: taken out by an override. outside: mined in the op's time and place, but the participation mode leaves them out. */
export type ParticipantStatus = "counted" | "excluded" | "outside";

export interface AttributedPilot {
  characterId: number;
  status: ParticipantStatus;
  /** Why: the override (or "self" opt-out), or the participation rule. */
  reason: "override" | "self" | "mode" | null;
  /** Ore per type inside the op (prorated). */
  types: Map<number, number>;
}

/** The op's time frame with the end grace applied; `end` is never later than `now`. */
export function opInterval(i: { startsAt: Date; endsAt: Date | null; now: Date; graceMs?: number }): { start: number; end: number } {
  const start = i.startsAt.getTime();
  const end = i.endsAt ? i.endsAt.getTime() + (i.graceMs ?? DEFAULT_END_GRACE_MS) : i.now.getTime();
  return { start, end: Math.max(start, Math.min(end, i.now.getTime())) };
}

/** Share of [start, end) that lies inside the given intervals (which must not overlap). */
function insideShare(start: number, end: number, intervals: { start: number; end: number }[]): number {
  if (end <= start) return intervals.some((iv) => start >= iv.start && start < iv.end) ? 1 : 0;
  let inside = 0;
  for (const iv of intervals) inside += Math.max(0, Math.min(end, iv.end) - Math.max(start, iv.start));
  return Math.min(1, inside / (end - start));
}

/** Merges overlapping or touching intervals. */
function merge(intervals: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = intervals.filter((iv) => iv.end > iv.start).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

export function attributeOp(input: AttributionInput): AttributedPilot[] {
  const grace = input.graceMs ?? DEFAULT_END_GRACE_MS;
  const op = opInterval(input);
  const systems = new Set(input.solarSystemIds);
  const overrides = input.overrides ?? new Map<number, OpOverride>();

  // Fleet membership, clipped to the op. Leaving the fleet gets the same grace as the op's end.
  const fleetIntervals = new Map<number, { start: number; end: number }[]>();
  for (const [characterId, spans] of input.fleetSpans ?? []) {
    const clipped = spans.map((s) => ({
      start: Math.max(op.start, s.start.getTime()),
      end: Math.min(op.end, s.end ? s.end.getTime() + grace : op.end),
    }));
    fleetIntervals.set(characterId, merge(clipped));
  }

  // Ore inside the op's time and place, per character: once over the whole op, and once
  // limited to the character's time in the fleet (fleet mode).
  const whole = new Map<number, Map<number, number>>();
  const inFleet = new Map<number, Map<number, number>>();
  const add = (into: Map<number, Map<number, number>>, characterId: number, typeId: number, quantity: number) => {
    if (quantity <= 0) return;
    const types = into.get(characterId) ?? new Map<number, number>();
    types.set(typeId, (types.get(typeId) ?? 0) + quantity);
    into.set(characterId, types);
  };
  for (const w of input.windows) {
    if (systems.size && !systems.has(w.solarSystemId)) continue;
    const start = w.start.getTime();
    const end = w.end.getTime();
    add(whole, w.characterId, w.typeId, w.quantity * insideShare(start, end, [op]));
    const fleet = fleetIntervals.get(w.characterId);
    if (fleet) add(inFleet, w.characterId, w.typeId, w.quantity * insideShare(start, end, fleet));
  }

  const candidates = new Set<number>([...whole.keys(), ...overrides.keys()]);
  if (input.participation === "fleet") for (const id of fleetIntervals.keys()) candidates.add(id);
  if (input.participation === "calendar") for (const id of input.accepted ?? []) candidates.add(id);

  const out: AttributedPilot[] = [];
  for (const characterId of candidates) {
    const override = overrides.get(characterId);
    const all = whole.get(characterId) ?? new Map<number, number>();
    if (override?.mode === "excluded") {
      out.push({ characterId, status: "excluded", reason: override.self ? "self" : "override", types: all });
      continue;
    }
    if (override?.mode === "included") {
      out.push({ characterId, status: "counted", reason: "override", types: all });
      continue;
    }
    if (input.participation === "fleet") {
      const fleet = fleetIntervals.get(characterId);
      // Ore mined in the op but outside the fleet stays visible, so the organiser can pull a pilot in.
      if (fleet?.length) out.push({ characterId, status: "counted", reason: null, types: inFleet.get(characterId) ?? new Map() });
      else if (all.size) out.push({ characterId, status: "outside", reason: "mode", types: all });
      continue;
    }
    if (input.participation === "calendar") {
      if (input.accepted?.has(characterId)) out.push({ characterId, status: "counted", reason: null, types: all });
      else if (all.size) out.push({ characterId, status: "outside", reason: "mode", types: all });
      continue;
    }
    if (all.size) out.push({ characterId, status: "counted", reason: null, types: all });
  }
  return out.sort((a, b) => a.characterId - b.characterId);
}

/** Calendar events give a start and a length in minutes. */
export function calendarEventWindow(event: { eventDate: Date; durationMinutes: number }): { startsAt: Date; endsAt: Date } {
  const minutes = Math.max(0, event.durationMinutes);
  return { startsAt: event.eventDate, endsAt: new Date(event.eventDate.getTime() + minutes * 60_000) };
}

export type OpStatus = "planned" | "running" | "ended" | "finalized";

export function opStatus(op: { startsAt: Date; endsAt: Date | null; finalizedAt: Date | null }, now: Date): OpStatus {
  if (op.finalizedAt) return "finalized";
  if (now < op.startsAt) return "planned";
  if (!op.endsAt || now < op.endsAt) return "running";
  return "ended";
}
