import "server-only";
import { feedHealth } from "@/modules/gatecheck/check";
import { killsInSystems, loadFeedStatus, typeGroups } from "@/modules/gatecheck/queries";
import { isMinorVictim } from "@/modules/gatecheck/tags";
import { getUniverse } from "@/modules/gatecheck/universe-data";
import type { GateCheck } from "./travel";

/** Player kills of ships at a stargate are what the map's travel check marks (not mobile depots or structures). */
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
  const atGates = kills.filter((k) => k.gateId !== null && !k.npc && destination.has(k.gateId));
  const groups = await typeGroups(atGates.map((k) => k.victimShipTypeId));
  const groupOf = (typeId: number) => groups.get(typeId)?.groupId;
  const categoryOf = (typeId: number) => groups.get(typeId)?.categoryId ?? undefined;
  return {
    systemId,
    checkedAt: now.toISOString(),
    complete: gates.length > 0 && feedHealth(feed, now) === "fresh",
    missingPositions: 0,
    kills: atGates
      .filter((k) => !isMinorVictim(k.victimShipTypeId, groupOf, categoryOf))
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
