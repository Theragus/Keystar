import type { PilotHistory, Standing } from "./types";

/** NPC corporations (starter, faction and school corps) have ids in this range. */
export function isNpcCorporation(corporationId: number | null): boolean {
  return !!corporationId && corporationId >= 1_000_000 && corporationId < 2_000_000;
}

/**
 * Order in which pilots get their zKillboard statistics, from what is known
 * instantly: reds and pilots who recently killed us first.
 */
export function priorPriority(p: {
  standing: Standing;
  history: PilotHistory | null;
  corporationId: number | null;
  allianceId: number | null;
  now: Date;
}): number {
  let score = 0;
  if (p.standing.cls === "red") score += 50;
  else if (p.standing.cls === "orange") score += 25;
  if (p.history) {
    const recent = p.history.lastAt && p.now.getTime() - Date.parse(p.history.lastAt) < 90 * 86_400_000;
    if (p.history.killsOnUs > 0 && recent) score += 30;
    else if (p.history.killsOnUs + p.history.lossesToUs > 0) score += 10;
  }
  if (p.allianceId || (p.corporationId && !isNpcCorporation(p.corporationId))) score += 5;
  return score;
}
