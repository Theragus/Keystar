import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { eveConstellations, eveCorporations, eveEntities, eveSystems, getDb, intelPilots } from "@/core/db";
import { env } from "@/core/env";
import { getEsi } from "@/core/esi";
import { fetchAffiliations } from "@/core/eve/affiliation";
import { ensureConstellations, ensureNames, ensureSystems, refreshCorporations } from "@/core/eve/resolver";
import { createLogger, errorMessage } from "@/core/logger";
import { AFFILIATION_TTL_MS } from "./constants";

/**
 * Turns pasted names into characters with their current corporation and
 * alliance. Runs in the server action, so it is kept to a few batched ESI
 * calls; corporations it could not name in time are named by the worker.
 */
const log = createLogger("intel-resolve");

/** Corporations named synchronously per scan; the worker names the rest. */
const SYNC_CORPORATIONS = 40;

export interface ResolvedPilot {
  characterId: number;
  name: string;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
}

/** Demo instances have no real ESI access: resolve from local data only. */
const localOnly = () => env().KEYSTAR_DEMO_MODE;

/** Character ids for names: known names from the local cache, the rest from ESI /universe/ids. */
export async function resolvePilotNames(names: string[]): Promise<{ found: { characterId: number; name: string }[]; unresolved: string[] }> {
  const db = getDb();
  const byLower = new Map<string, { characterId: number; name: string }>();
  const lower = [...new Set(names.map((n) => n.toLowerCase()))];
  for (let i = 0; i < lower.length; i += 1000) {
    const rows = await db
      .select({ id: eveEntities.id, name: eveEntities.name })
      .from(eveEntities)
      .where(and(eq(eveEntities.category, "character"), inArray(sql`lower(${eveEntities.name})`, lower.slice(i, i + 1000))));
    for (const r of rows) byLower.set(r.name.toLowerCase(), { characterId: r.id, name: r.name });
  }

  const unknown = names.filter((n) => !byLower.has(n.toLowerCase()));
  if (unknown.length && !localOnly()) {
    const learned: { id: number; name: string }[] = [];
    for (let i = 0; i < unknown.length; i += 500) {
      try {
        const res = await getEsi().post<{ characters?: { id: number; name: string }[] }>("/universe/ids", unknown.slice(i, i + 500));
        for (const c of res.data.characters ?? []) {
          byLower.set(c.name.toLowerCase(), { characterId: c.id, name: c.name });
          learned.push(c);
        }
      } catch (err) {
        log.warn("Could not resolve pilot names", { error: errorMessage(err) });
      }
    }
    if (learned.length) {
      await db
        .insert(eveEntities)
        .values(learned.map((c) => ({ id: c.id, name: c.name, category: "character" })))
        .onConflictDoUpdate({ target: eveEntities.id, set: { name: sql`excluded.name`, updatedAt: new Date() } });
    }
  }

  const found: { characterId: number; name: string }[] = [];
  const unresolved: string[] = [];
  const seenIds = new Set<number>();
  for (const n of names) {
    const hit = byLower.get(n.toLowerCase());
    if (!hit) unresolved.push(n);
    else if (!seenIds.has(hit.characterId)) {
      seenIds.add(hit.characterId);
      found.push(hit);
    }
  }
  return { found, unresolved };
}

/**
 * Current affiliation of the pilots (cached for an hour in intel_pilots),
 * which also marks them as recently requested.
 */
export async function refreshAffiliations(pilots: { characterId: number; name: string }[]): Promise<Map<number, ResolvedPilot>> {
  const db = getDb();
  const ids = pilots.map((p) => p.characterId);
  const out = new Map<number, ResolvedPilot>();
  if (!ids.length) return out;
  const now = new Date();

  const fresh = await db
    .select()
    .from(intelPilots)
    .where(and(inArray(intelPilots.characterId, ids), gt(intelPilots.affiliationAt, new Date(now.getTime() - AFFILIATION_TTL_MS))));
  for (const r of fresh) {
    out.set(r.characterId, {
      characterId: r.characterId,
      name: r.name,
      corporationId: r.corporationId,
      allianceId: r.allianceId,
      factionId: r.factionId,
    });
  }

  const stale = pilots.filter((p) => !out.has(p.characterId));
  const fetched = new Map<number, ResolvedPilot>();
  if (stale.length && !localOnly()) {
    try {
      for (const a of await fetchAffiliations(getEsi(), stale.map((p) => p.characterId))) {
        fetched.set(a.characterId, { ...a, name: "" });
      }
    } catch (err) {
      log.warn("Could not refresh affiliations", { error: errorMessage(err) });
    }
  }

  // Keep what we knew before for pilots ESI could not answer (or in demo mode).
  const previous = stale.length
    ? await db.select().from(intelPilots).where(inArray(intelPilots.characterId, stale.map((p) => p.characterId)))
    : [];
  const prevById = new Map(previous.map((r) => [r.characterId, r]));
  for (const p of stale) {
    const a = fetched.get(p.characterId);
    const prev = prevById.get(p.characterId);
    out.set(p.characterId, {
      characterId: p.characterId,
      name: p.name,
      corporationId: a?.corporationId ?? prev?.corporationId ?? null,
      allianceId: a ? a.allianceId : (prev?.allianceId ?? null),
      factionId: a ? a.factionId : (prev?.factionId ?? null),
    });
  }

  const rows = pilots.map((p) => {
    const r = out.get(p.characterId)!;
    return {
      characterId: p.characterId,
      name: p.name,
      corporationId: r.corporationId,
      allianceId: r.allianceId,
      factionId: r.factionId,
      affiliationAt: fetched.has(p.characterId) ? now : undefined,
      lastRequestedAt: now,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(intelPilots)
      .values(rows.slice(i, i + 500).map((r) => ({ ...r, affiliationAt: r.affiliationAt ?? null })))
      .onConflictDoUpdate({
        target: intelPilots.characterId,
        set: {
          name: sql`excluded.name`,
          corporationId: sql`excluded.corporation_id`,
          allianceId: sql`excluded.alliance_id`,
          factionId: sql`excluded.faction_id`,
          affiliationAt: sql`COALESCE(excluded.affiliation_at, ${intelPilots.affiliationAt})`,
          lastRequestedAt: sql`excluded.last_requested_at`,
        },
      });
  }

  await nameAffiliations([...out.values()], SYNC_CORPORATIONS);
  return out;
}

/** Tickers for corporations and names for alliances; at most `maxCorporations` corporation lookups. */
export async function nameAffiliations(pilots: Pick<ResolvedPilot, "corporationId" | "allianceId">[], maxCorporations: number): Promise<void> {
  if (localOnly()) return;
  const db = getDb();
  const corpIds = [...new Set(pilots.map((p) => p.corporationId).filter((id): id is number => !!id))];
  if (corpIds.length) {
    const known = await db.select({ id: eveCorporations.corporationId }).from(eveCorporations).where(inArray(eveCorporations.corporationId, corpIds));
    const knownSet = new Set(known.map((r) => r.id));
    await refreshCorporations(corpIds.filter((id) => !knownSet.has(id)).slice(0, maxCorporations));
  }
  await ensureNames(pilots.map((p) => p.allianceId).filter((id): id is number => !!id));
}

export interface SystemContext {
  systemId: number;
  name: string;
  securityStatus: number;
  constellationId: number | null;
  regionId: number | null;
}

/** A solar system by name (case-insensitive) with its constellation and region. */
export async function resolveSystem(name: string): Promise<SystemContext | null> {
  const wanted = name.trim();
  if (!wanted) return null;
  const db = getDb();
  const find = async () => {
    const [row] = await db
      .select({
        systemId: eveSystems.systemId,
        name: eveSystems.name,
        securityStatus: eveSystems.securityStatus,
        constellationId: eveSystems.constellationId,
      })
      .from(eveSystems)
      .where(sql`lower(${eveSystems.name}) = ${wanted.toLowerCase()}`);
    return row ?? null;
  };
  let row = await find();
  if (!row && !localOnly()) {
    try {
      const res = await getEsi().post<{ systems?: { id: number; name: string }[] }>("/universe/ids", [wanted]);
      const hit = res.data.systems?.[0];
      if (hit) {
        await ensureSystems([hit.id]);
        row = await find();
      }
    } catch (err) {
      log.warn("Could not resolve system", { name: wanted, error: errorMessage(err) });
    }
  }
  if (!row) return null;
  return { ...row, regionId: await regionOf(row.constellationId) };
}

/** System context by id (for scans that stored one). */
export async function systemContext(systemId: number | null): Promise<SystemContext | null> {
  if (!systemId) return null;
  const db = getDb();
  const [row] = await db
    .select({
      systemId: eveSystems.systemId,
      name: eveSystems.name,
      securityStatus: eveSystems.securityStatus,
      constellationId: eveSystems.constellationId,
    })
    .from(eveSystems)
    .where(eq(eveSystems.systemId, systemId));
  if (!row) return null;
  return { ...row, regionId: await regionOf(row.constellationId) };
}

async function regionOf(constellationId: number | null): Promise<number | null> {
  if (!constellationId) return null;
  const db = getDb();
  const lookup = async () =>
    (await db.select({ regionId: eveConstellations.regionId }).from(eveConstellations).where(eq(eveConstellations.constellationId, constellationId)))[0];
  let row = await lookup();
  if (!row && !localOnly()) {
    await ensureConstellations([constellationId]);
    row = await lookup();
  }
  return row?.regionId ?? null;
}
