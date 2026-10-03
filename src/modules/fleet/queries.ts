import { and, desc, eq, gt, inArray, isNull, lte, not, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { eveEntities, eveGroups, eveSystems, eveTypes, fleetMembers, fleets, fleetTrackers, getDb } from "@/core/db";
import { env } from "@/core/env";

/** A fleet counts as live while its boss was read within this window. */
export const LIVE_WINDOW_MS = 2 * 60_000;

// Demo mode has no worker reading fleets, so the seeded open fleet stays live.
const liveSince = (now: Date) => (env().KEYSTAR_DEMO_MODE ? new Date(0) : new Date(now.getTime() - LIVE_WINDOW_MS));
const isLive = (now: Date) => and(isNull(fleets.endedAt), gt(fleets.lastSeenAt, liveSince(now)));

const boss = alias(eveEntities, "boss");

export async function getTrackers(characterIds: number[]) {
  if (!characterIds.length) return [];
  return getDb().select().from(fleetTrackers).where(inArray(fleetTrackers.characterId, characterIds));
}

const fleetColumns = {
  fleetId: fleets.fleetId,
  bossCharacterId: fleets.bossCharacterId,
  bossName: boss.name,
  motd: fleets.motd,
  isFreeMove: fleets.isFreeMove,
  wings: fleets.wings,
  firstSeenAt: fleets.firstSeenAt,
  /** When the fleet formed: the earliest join time ESI reported, or when tracking first saw it. */
  startedAt: sql<Date>`LEAST(${fleets.firstSeenAt}, (SELECT MIN(m.join_time) FROM fleet_members m WHERE m.fleet_id = ${fleets.fleetId}))`.mapWith(
    fleets.firstSeenAt,
  ),
  lastSeenAt: fleets.lastSeenAt,
  endedAt: fleets.endedAt,
  participants: sql<number>`(SELECT COUNT(*)::int FROM fleet_members m WHERE m.fleet_id = ${fleets.fleetId})`,
};

export async function getLiveFleets(now = new Date()) {
  return getDb()
    .select(fleetColumns)
    .from(fleets)
    .leftJoin(boss, eq(boss.id, fleets.bossCharacterId))
    .where(isLive(now))
    .orderBy(desc(fleets.firstSeenAt));
}

export type FleetSummary = Awaited<ReturnType<typeof getLiveFleets>>[number];

export async function getPastFleets(limit = 20, now = new Date()) {
  return getDb()
    .select(fleetColumns)
    .from(fleets)
    .leftJoin(boss, eq(boss.id, fleets.bossCharacterId))
    .where(or(not(isNull(fleets.endedAt)), lte(fleets.lastSeenAt, liveSince(now))))
    .orderBy(desc(fleets.firstSeenAt))
    .limit(limit);
}

/** Members of the given fleets with names, ship and system resolved. */
export async function getFleetMembers(fleetIds: number[], opts: { currentOnly?: boolean } = {}) {
  if (!fleetIds.length) return [];
  const conditions = [inArray(fleetMembers.fleetId, fleetIds)];
  if (opts.currentOnly) conditions.push(isNull(fleetMembers.leftAt));
  return getDb()
    .select({
      fleetId: fleetMembers.fleetId,
      characterId: fleetMembers.characterId,
      name: eveEntities.name,
      role: fleetMembers.role,
      wingId: fleetMembers.wingId,
      squadId: fleetMembers.squadId,
      shipTypeId: fleetMembers.shipTypeId,
      shipName: eveTypes.name,
      shipGroupId: eveTypes.groupId,
      shipGroupName: eveGroups.name,
      solarSystemId: fleetMembers.solarSystemId,
      systemName: eveSystems.name,
      securityStatus: eveSystems.securityStatus,
      joinTime: fleetMembers.joinTime,
      firstSeenAt: fleetMembers.firstSeenAt,
      lastSeenAt: fleetMembers.lastSeenAt,
      leftAt: fleetMembers.leftAt,
    })
    .from(fleetMembers)
    .leftJoin(eveEntities, eq(eveEntities.id, fleetMembers.characterId))
    .leftJoin(eveTypes, eq(eveTypes.typeId, fleetMembers.shipTypeId))
    .leftJoin(eveGroups, eq(eveGroups.groupId, eveTypes.groupId))
    .leftJoin(eveSystems, eq(eveSystems.systemId, fleetMembers.solarSystemId))
    .where(and(...conditions));
}

export type FleetMemberRow = Awaited<ReturnType<typeof getFleetMembers>>[number];
