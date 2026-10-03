import { eq } from "drizzle-orm";
import { ensureNames, ensureSystems, ensureTypes } from "@/core/eve/resolver";
import { fleetTrackers, type FleetTrackerStatus } from "@/core/db";
import { EsiError, EsiForbiddenError } from "@/core/esi/client";
import type { JobDefinition, JobResult } from "@/core/sync/types";
import { FLEET_JOB_KEY, FLEET_SCOPE, type EsiCharacterFleet, type EsiFleet, type EsiFleetMember, type EsiFleetWing } from "./logic";
import { closeFleet, recordFleetSnapshot } from "./sync";

/** How often a fleet boss's fleet is read. ESI caches the member list for 5 seconds. */
export const FLEET_POLL_SECONDS = 15;
/** While the tracked character is in a fleet but not its boss. */
const NOT_BOSS_POLL_SECONDS = 60;
/** Characters without an active tracker only get a cheap database check. */
const IDLE_SECONDS = 24 * 3600;

const after = (now: Date, seconds: number) => new Date(now.getTime() + seconds * 1000);

/**
 * Reads the fleet of every character whose owner started tracking on the
 * fleet page. Only the fleet boss can read members and wings, so other
 * characters are just re-checked every minute in case they get boss.
 */
export const fleetLiveJob: JobDefinition = {
  key: FLEET_JOB_KEY,
  label: (t) => t.fleet.module.jobs.live,
  module: "fleet",
  owner: "character",
  requiredScopes: [FLEET_SCOPE],
  intervalSeconds: FLEET_POLL_SECONDS,
  async run({ esi, db, characterId }): Promise<JobResult> {
    const id = characterId!;
    const now = new Date();
    const [tracker] = await db.select().from(fleetTrackers).where(eq(fleetTrackers.characterId, id));
    if (!tracker || (tracker.status !== "tracking" && tracker.status !== "not_boss")) {
      return { summary: "Not tracking", nextRunAt: after(now, IDLE_SECONDS) };
    }

    const setTracker = (status: FleetTrackerStatus, fleetId: number | null) =>
      db.update(fleetTrackers).set({ status, fleetId, checkedAt: now }).where(eq(fleetTrackers.characterId, id));

    let membership: EsiCharacterFleet;
    try {
      membership = (await esi.get<EsiCharacterFleet>(`/characters/${id}/fleet`, { characterId: id })).data;
    } catch (err) {
      if (!(err instanceof EsiError) || err.status !== 404) throw err;
      // Not in a fleet (any more): stop polling until the owner starts tracking again.
      if (tracker.fleetId && tracker.status === "tracking") await closeFleet(db, tracker.fleetId, now);
      await setTracker("no_fleet", tracker.fleetId);
      return { summary: "Not in a fleet, tracking stopped", nextRunAt: after(now, IDLE_SECONDS) };
    }

    const fleetId = membership.fleet_id;
    if (tracker.fleetId && tracker.fleetId !== fleetId && tracker.status === "tracking") {
      await closeFleet(db, tracker.fleetId, now);
    }
    if (membership.fleet_boss_id !== id) {
      await setTracker("not_boss", fleetId);
      return { summary: `In fleet ${fleetId}, not the boss`, nextRunAt: after(now, NOT_BOSS_POLL_SECONDS) };
    }

    let fleet: EsiFleet, members: EsiFleetMember[], wings: EsiFleetWing[];
    try {
      const opts = { characterId: id };
      [fleet, members, wings] = await Promise.all([
        esi.get<EsiFleet>(`/fleets/${fleetId}`, opts).then((r) => r.data),
        esi.get<EsiFleetMember[]>(`/fleets/${fleetId}/members`, opts).then((r) => r.data),
        esi.get<EsiFleetWing[]>(`/fleets/${fleetId}/wings`, opts).then((r) => r.data),
      ]);
    } catch (err) {
      // Boss was passed on (or the fleet closed) since the cached membership check.
      if (err instanceof EsiForbiddenError || (err instanceof EsiError && err.status === 404)) {
        await setTracker("not_boss", fleetId);
        return { summary: `Lost access to fleet ${fleetId}`, nextRunAt: after(now, NOT_BOSS_POLL_SECONDS) };
      }
      throw err;
    }

    await recordFleetSnapshot(db, { fleetId, bossCharacterId: id, fleet, members, wings }, now);
    await setTracker("tracking", fleetId);
    await Promise.all([
      ensureNames(members.map((m) => m.character_id)),
      ensureTypes(members.map((m) => m.ship_type_id)),
      ensureSystems(members.map((m) => m.solar_system_id)),
    ]);
    return { summary: `${members.length} members in fleet ${fleetId}` };
  },
};

export const fleetJobs: JobDefinition[] = [fleetLiveJob];
