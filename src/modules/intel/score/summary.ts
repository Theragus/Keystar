import { hullClass, HULL_CLASS_LABELS, isCombatHull, type HullClass } from "../hulls";
import type { PilotProfile, PilotScore, Standing, Tier } from "../types";
import { DAY_MS } from "./decay";

/**
 * The group view of a scan: how many pilots per tier, what they are likely
 * flying, which of them fly together, and where they come from. Friendly
 * pilots are left out.
 */
export interface GroupPilot {
  characterId: number;
  corporationId: number | null;
  allianceId: number | null;
  standing: Standing;
  score: PilotScore | null;
  profile: PilotProfile | null;
}

export interface GroupSummary {
  hostiles: number;
  tiers: Record<Tier | "unknown", number>;
  reds: number;
  /** Threat total: the sum of composite scores (a rough "how much trouble"). */
  threat: number;
  comp: { cls: HullClass; label: string; pilots: number }[];
  roles: { cyno: number; logi: number; capital: number; tackle: number; hunter: number };
  /** Pasted pilots who share kills, largest group first. */
  clusters: number[][];
  groups: { allianceId: number | null; corporationId: number | null; pilots: number }[];
}

export function dominantClass(profile: PilotProfile, now: Date): HullClass | null {
  const recent = profile.hulls.filter((h) => isCombatHull(h.groupId) && (!h.lastAt || now.getTime() - Date.parse(h.lastAt) <= 7 * DAY_MS));
  const pool = recent.length ? recent : profile.hulls.filter((h) => isCombatHull(h.groupId));
  if (!pool.length) return null;
  const byClass = new Map<HullClass, number>();
  for (const h of pool) byClass.set(hullClass(h.groupId), (byClass.get(hullClass(h.groupId)) ?? 0) + h.weight);
  return [...byClass.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function groupSummary(pilots: GroupPilot[], now: Date): GroupSummary {
  const hostile = pilots.filter((p) => !p.score?.excluded && p.standing.cls !== "own" && p.standing.cls !== "blue");
  const tiers: GroupSummary["tiers"] = { low: 0, moderate: 0, high: 0, extreme: 0, unknown: 0 };
  const comp = new Map<HullClass, number>();
  const roles = { cyno: 0, logi: 0, capital: 0, tackle: 0, hunter: 0 };
  const groups = new Map<string, { allianceId: number | null; corporationId: number | null; pilots: number }>();
  let threat = 0;
  for (const p of hostile) {
    tiers[p.score?.tier ?? "unknown"]++;
    threat += p.score?.composite ?? 0;
    if (p.profile) {
      const cls = dominantClass(p.profile, now);
      if (cls) comp.set(cls, (comp.get(cls) ?? 0) + 1);
    }
    for (const t of p.score?.tags ?? []) {
      if (t.key === "cyno") roles.cyno++;
      if (t.key === "logi") roles.logi++;
      if (t.key === "capital") roles.capital++;
      if (t.key === "tackle") roles.tackle++;
      if (t.key === "hunter") roles.hunter++;
    }
    const key = p.allianceId ? `a${p.allianceId}` : `c${p.corporationId ?? 0}`;
    const g = groups.get(key) ?? { allianceId: p.allianceId, corporationId: p.allianceId ? null : p.corporationId, pilots: 0 };
    g.pilots++;
    groups.set(key, g);
  }

  // Connected groups of pasted pilots that share at least two kills.
  const ids = new Set(hostile.map((p) => p.characterId));
  const parent = new Map<number, number>([...ids].map((id) => [id, id]));
  const find = (x: number): number => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  for (const p of hostile) {
    for (const a of p.profile?.associates ?? []) {
      if (a.sharedKills >= 2 && ids.has(a.characterId)) parent.set(find(p.characterId), find(a.characterId));
    }
  }
  const clusters = new Map<number, number[]>();
  for (const id of ids) {
    const root = find(id);
    clusters.set(root, [...(clusters.get(root) ?? []), id]);
  }

  return {
    hostiles: hostile.length,
    tiers,
    reds: hostile.filter((p) => p.standing.cls === "red").length,
    threat: Math.round(threat),
    comp: [...comp.entries()].sort((a, b) => b[1] - a[1]).map(([cls, n]) => ({ cls, label: HULL_CLASS_LABELS[cls], pilots: n })),
    roles,
    clusters: [...clusters.values()].filter((c) => c.length >= 2).sort((a, b) => b.length - a.length),
    groups: [...groups.values()].sort((a, b) => b.pilots - a.pilots).slice(0, 8),
  };
}
