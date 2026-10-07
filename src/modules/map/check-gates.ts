import "server-only";
import { feedHealth } from "@/modules/gatecheck/check";
import { killsInSystems, loadFeedStatus } from "@/modules/gatecheck/queries";
import { getUniverse } from "@/modules/gatecheck/universe-data";
import type { GateCheck } from "./travel";

/** Player kills at a stargate are what the map's travel check marks. */
const WINDOW_MS = 2 * 3600_000;

export const hasGates = (systemId: number) => getUniverse().gates.has(systemId);

/**
 * Kills at the system's gates in the last two hours, from the gate check's
 * table (filled from zKillboard's live feed by the worker), so checking a
 * route never calls zKillboard. Complete only while the feed is up to date.
 */
export async function checkGates(systemId: number): Promise<GateCheck> {
  const now = new Date();
  const [feed, kills] = await Promise.all([loadFeedStatus(), killsInSystems([systemId], new Date(now.getTime() - WINDOW_MS))]);
  const gates = getUniverse().gates.get(systemId) ?? [];
  const destination = new Map(gates.map((g) => [g.id, g.destinationId]));
  return {
    systemId,
    checkedAt: now.toISOString(),
    complete: gates.length > 0 && feedHealth(feed, now) === "fresh",
    missingPositions: 0,
    kills: kills
      .filter((k) => k.gateId !== null && !k.npc && destination.has(k.gateId))
      .sort((a, b) => b.killmailTime.getTime() - a.killmailTime.getTime())
      .map((k) => ({
        id: k.killmailId,
        time: k.killmailTime.toISOString(),
        gateId: k.gateId!,
        destinationId: destination.get(k.gateId!)!,
        distanceKm: k.gateDistanceM === null ? null : k.gateDistanceM / 1000,
        shipTypeId: k.victimShipTypeId,
      })),
  };
}
