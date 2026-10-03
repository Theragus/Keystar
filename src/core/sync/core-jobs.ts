import { eq, inArray, lt, sql } from "drizzle-orm";
import {
  characterCorpRoles,
  characters,
  corporationMembers,
  esiCache,
  eveSystems,
  workerHeartbeats,
} from "@/core/db";
import { purgeExpiredSessions } from "@/core/auth/session";
import { fetchAffiliations } from "@/core/eve/affiliation";
import { recentPriceInterest, syncPrices } from "@/core/eve/prices";
import { ensureNames, ensureSystems, refreshCorporations } from "@/core/eve/resolver";
import { isListedSystem } from "@/core/eve/systems";
import { setSetting } from "@/core/settings";
import { trackedCorporations } from "./scheduler";
import type { JobDefinition, PriceInterestProvider } from "./types";

export const serverStatusJob: JobDefinition = {
  key: "core.server-status",
  label: (t) => t.core.jobs.serverStatus,
  module: "core",
  owner: "global",
  intervalSeconds: 300,
  async run({ esi }) {
    const res = await esi.get<{ players: number; server_version: string; start_time: string }>("/status");
    await setSetting("eve.serverStatus", {
      players: res.data.players,
      serverVersion: res.data.server_version,
      startTime: res.data.start_time,
      checkedAt: new Date().toISOString(),
    });
    return { summary: `${res.data.players.toLocaleString("en-US")} pilots online`, nextRunAt: res.expiresAt };
  },
};

export const affiliationsJob: JobDefinition = {
  key: "core.affiliations",
  label: (t) => t.core.jobs.affiliations,
  module: "core",
  owner: "global",
  intervalSeconds: 3600,
  async run({ esi, db }) {
    const rows = await db.select({ id: characters.characterId }).from(characters);
    const ids = rows.map((r) => r.id);
    let changed = 0;
    const corpIds = new Set<number>(await trackedCorporations());
    const allianceIds = new Set<number>();
    for (const a of await fetchAffiliations(esi, ids)) {
      corpIds.add(a.corporationId);
      if (a.allianceId) allianceIds.add(a.allianceId);
      const updated = await db
        .update(characters)
        .set({
          corporationId: a.corporationId,
          allianceId: a.allianceId,
          affiliationUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          sql`${characters.characterId} = ${a.characterId} AND (${characters.corporationId} <> ${a.corporationId} OR ${characters.allianceId} IS DISTINCT FROM ${a.allianceId})`,
        )
        .returning({ id: characters.characterId });
      changed += updated.length;
    }
    await refreshCorporations(corpIds);
    await ensureNames([...corpIds, ...allianceIds]);
    return { summary: `${ids.length} characters checked, ${changed} changed corporation` };
  },
};

export const characterRolesJob: JobDefinition = {
  key: "core.character-roles",
  label: (t) => t.core.jobs.characterRoles,
  module: "core",
  owner: "character",
  requiredScopes: ["esi-characters.read_corporation_roles.v1"],
  intervalSeconds: 3600,
  async run({ esi, db, characterId }) {
    const res = await esi.get<{ roles?: string[] }>(`/characters/${characterId}/roles`, { characterId: characterId! });
    const roles = res.data.roles ?? [];
    await db
      .insert(characterCorpRoles)
      .values({ characterId: characterId!, roles, updatedAt: new Date() })
      .onConflictDoUpdate({ target: characterCorpRoles.characterId, set: { roles, updatedAt: new Date() } });
    return { summary: roles.length ? roles.join(", ") : "No corporation roles", nextRunAt: res.expiresAt };
  },
};

export const corporationMembersJob: JobDefinition = {
  key: "core.corporation-members",
  label: (t) => t.core.jobs.corporationMembers,
  module: "core",
  owner: "corporation",
  requiredScopes: ["esi-corporations.read_corporation_membership.v1"],
  intervalSeconds: 3600,
  async run({ esi, db, ownerId, characterId }) {
    const res = await esi.get<number[]>(`/corporations/${ownerId}/members`, { characterId: characterId! });
    if (!res.notModified) {
      await db.transaction(async (tx) => {
        await tx.delete(corporationMembers).where(eq(corporationMembers.corporationId, ownerId));
        if (res.data.length) {
          await tx
            .insert(corporationMembers)
            .values(res.data.map((id) => ({ corporationId: ownerId, characterId: id, updatedAt: new Date() })));
        }
      });
      await ensureNames(res.data);
    }
    return { summary: `${res.data.length} members`, nextRunAt: res.expiresAt };
  },
};

export function marketPricesJob(providers: PriceInterestProvider[]): JobDefinition {
  return {
    key: "core.market-prices",
    label: (t) => t.core.jobs.marketPrices,
    module: "core",
    owner: "global",
    intervalSeconds: 3600,
    async run({ esi, db }) {
      const ids = new Set<number>();
      for (const provider of providers) for (const id of await provider(db)) ids.add(id);
      // Types appraised or estimated recently stay fresh too; older ones are priced again on demand.
      for (const id of await recentPriceInterest(db)) ids.add(id);
      const result = await syncPrices(db, esi, [...ids]);
      // What was priced is written; failing the run makes the scheduler wait for the limit to lift.
      if (result.rateLimited) throw result.rateLimited;
      return { summary: result.summary };
    },
  };
}

/** Systems fetched per run while the list fills; the first full load spreads over a couple of hours. */
const SYSTEMS_PER_RUN = 500;
/** New systems are rare (a handful per decade); unknown names are still looked up on demand. */
const SYSTEMS_RECHECK_MS = 30 * 24 * 3600 * 1000;
/** A batch that resolved nothing (ESI trouble) waits this long before the next try. */
const SYSTEMS_STALLED_MS = 6 * 3600 * 1000;

/** Every known-space and wormhole system, so the system picker can offer them all. */
export const universeSystemsJob: JobDefinition = {
  key: "core.universe-systems",
  label: (t) => t.core.jobs.universeSystems,
  module: "core",
  owner: "global",
  // A floor only: while systems are missing the job runs again a minute later, then nextRunAt spaces it out.
  intervalSeconds: 60,
  async run({ esi, db }) {
    const res = await esi.get<number[]>("/universe/systems");
    const listed = res.data.filter(isListedSystem);
    const known = new Set((await db.select({ id: eveSystems.systemId }).from(eveSystems)).map((r) => r.id));
    const missing = listed.filter((id) => !known.has(id));
    if (!missing.length) {
      return { summary: `All ${listed.length} systems known`, nextRunAt: new Date(Date.now() + SYSTEMS_RECHECK_MS) };
    }
    const batch = missing.slice(0, SYSTEMS_PER_RUN);
    await ensureSystems(batch);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eveSystems)
      .where(inArray(eveSystems.systemId, batch));
    const remaining = missing.length - count;
    return {
      summary: `Loaded ${count} systems, ${remaining} remaining`,
      nextRunAt: count === 0 ? new Date(Date.now() + SYSTEMS_STALLED_MS) : null,
    };
  },
};

export const housekeepingJob: JobDefinition = {
  key: "core.housekeeping",
  label: (t) => t.core.jobs.housekeeping,
  module: "core",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const sessions = await purgeExpiredSessions();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const cache = await db.delete(esiCache).where(lt(esiCache.expiresAt, weekAgo)).returning({ key: esiCache.key });
    await db.delete(workerHeartbeats).where(lt(workerHeartbeats.lastBeatAt, new Date(Date.now() - 24 * 3600 * 1000)));
    return { summary: `Purged ${sessions} sessions, ${cache.length} cache entries` };
  },
};
