import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import {
  eveConstellations,
  eveSystems,
  eveTypes,
  intelPilotKillmails,
  intelPilots,
  intelQueue,
  intelScanPilots,
  intelScans,
  type Db,
} from "@/core/db";
import type { EsiClient } from "@/core/esi/client";
import { ensureConstellations, ensureNames, ensureSystems, ensureTypes } from "@/core/eve/resolver";
import type { Logger } from "@/core/logger";
import { errorMessage } from "@/core/logger";
import { getSetting } from "@/core/settings";
import { ZkillError } from "@/modules/killboard/zkill";
import {
  BRIEF_TOP,
  CORP_HISTORY_TTL_MS,
  DEEP_MAX_PAGES,
  DEEP_TARGET_DAYS,
  DEEP_TTL_MS,
  MAX_ATTEMPTS,
  PROFILE_VERSION,
  RESCORE_WINDOW_MS,
  STATS_TTL_MS,
  WORKER_BUDGET_MS,
} from "./constants";
import { toDigestRow } from "./digest";
import { nameAffiliations, systemContext, type SystemContext } from "./resolve";
import { scorePilot } from "./score/composite";
import { DAY_MS } from "./score/decay";
import { buildProfile, type DigestRow } from "./score/profile";
import type { QueueStage } from "./schema";
import type { IntelSource } from "./source";
import { loadStandings, standingOf, type StandingsContext } from "./standings";
import { normalizeStats } from "./stats";
import type { CorpHistoryEntry, NormalizedStats, PilotProfile } from "./types";

/**
 * The zKillboard side of threat intel. Works through the queue in stages —
 * statistics for every pilot first, then each pilot's newest killmails
 * (highest quick score first), then older pages only where needed — and
 * rescores every recent scan a pilot is in as their data arrives.
 */

type QueueRow = typeof intelQueue.$inferSelect;
type PilotRow = typeof intelPilots.$inferSelect;

export interface WorkerContext {
  db: Db;
  esi: EsiClient;
  log: Logger;
}

export interface WorkerOptions {
  source: IntelSource;
  /** No ESI lookups (demo instances resolve everything locally). */
  offline?: boolean;
  budgetMs?: number;
  now?: () => Date;
}

export interface WorkerOutcome {
  processed: number;
  remaining: number;
  /** When there is nothing due: the earliest time a retry becomes due. */
  nextDueAt: Date | null;
  readyScans: string[];
}

const fresh = (at: Date | null | undefined, ttl: number, now: Date) => !!at && now.getTime() - at.getTime() < ttl;

export async function runScanWorker(ctx: WorkerContext, opts: WorkerOptions): Promise<WorkerOutcome> {
  const { db, log } = ctx;
  const now = opts.now ?? (() => new Date());
  const started = Date.now();
  const budget = opts.budgetMs ?? WORKER_BUDGET_MS;
  const standings = await loadStandings();
  const historyAvailable = !!(await getSetting("corp.homeCorporationId"));
  const systemCache = new Map<number, SystemContext | null>();
  const touched = new Set<string>();
  let processed = 0;

  const state: RunState = { ctx, opts, now, standings, historyAvailable, systemCache, touched };

  while (Date.now() - started < budget) {
    const [item] = await db
      .select()
      .from(intelQueue)
      .where(lte(intelQueue.notBefore, now()))
      .orderBy(asc(intelQueue.stage), desc(intelQueue.priority), asc(intelQueue.requestedAt))
      .limit(1);
    if (!item) break;
    try {
      await processItem(state, item);
    } catch (err) {
      // A blocked User-Agent or IP affects every pilot: stop and let the job back off.
      if (err instanceof ZkillError && err.status === 403) throw err;
      await failItem(state, item, err);
      log.warn("Intel item failed", { characterId: item.characterId, stage: item.stage, error: errorMessage(err) });
    }
    processed++;
  }

  if (touched.size) {
    await db.update(intelScans).set({ updatedAt: now() }).where(inArray(intelScans.id, [...touched]));
    if (!opts.offline) await nameScanCorporations(db, [...touched]);
  }
  const readyScans = await finalizeScans(db, now());

  const [{ due, next }] = await db
    .select({
      due: sql<number>`count(*) FILTER (WHERE ${intelQueue.notBefore} <= ${now().toISOString()}::timestamptz)::int`,
      next: sql<Date | null>`min(${intelQueue.notBefore})`,
    })
    .from(intelQueue);
  return { processed, remaining: Number(due), nextDueAt: next ? new Date(next) : null, readyScans };
}

interface RunState {
  ctx: WorkerContext;
  opts: WorkerOptions;
  now: () => Date;
  standings: StandingsContext;
  historyAvailable: boolean;
  systemCache: Map<number, SystemContext | null>;
  touched: Set<string>;
}

async function getPilot(db: Db, characterId: number): Promise<PilotRow> {
  const [row] = await db.select().from(intelPilots).where(eq(intelPilots.characterId, characterId));
  if (row) return row;
  // Queued without a cached row (should not happen; scans create it): start an empty one.
  const [created] = await db.insert(intelPilots).values({ characterId, name: String(characterId) }).returning();
  return created;
}

async function advance(db: Db, characterId: number, stage: QueueStage, page = 1, priority?: number) {
  await db
    .update(intelQueue)
    .set({ stage, page, attempts: 0, lastError: null, ...(priority === undefined ? {} : { priority }) })
    .where(eq(intelQueue.characterId, characterId));
}

const done = (db: Db, characterId: number) => db.delete(intelQueue).where(eq(intelQueue.characterId, characterId));

async function processItem(s: RunState, item: QueueRow): Promise<void> {
  const { db } = s.ctx;
  const id = item.characterId;
  let pilot = await getPilot(db, id);
  const now = s.now();

  if (item.stage === 1) {
    if (!fresh(pilot.statsAt, STATS_TTL_MS, now) || !pilot.statsStatus || pilot.statsStatus === "error") {
      const res = await s.opts.source.stats(id);
      const stats = res.kind === "ok" ? normalizeStats(res.stats) : null;
      const birthday = stats?.info.birthday ? new Date(stats.info.birthday) : null;
      await db
        .update(intelPilots)
        .set({
          stats,
          statsStatus: stats ? "ok" : "none",
          statsAt: now,
          statsError: null,
          ...(birthday && !Number.isNaN(birthday.getTime()) ? { birthday } : {}),
          ...(stats?.info.securityStatus !== null && stats?.info.securityStatus !== undefined ? { securityStatus: stats.info.securityStatus } : {}),
        })
        .where(eq(intelPilots.characterId, id));
    }
    if (!s.opts.offline && !fresh(pilot.corpHistoryAt, CORP_HISTORY_TTL_MS, now)) {
      await refreshCorpHistory(s, id);
    }
    pilot = await getPilot(db, id);
    if (!s.opts.offline) {
      // Names for the pilot page: frequent wingmen and former corporations.
      await ensureNames([
        ...(pilot.stats?.associates.slice(0, 10).map((a) => a.characterId) ?? []),
        ...(pilot.corpHistory?.map((c) => c.corporationId) ?? []),
      ]).catch((err) => s.ctx.log.debug("Could not name associates", { error: errorMessage(err) }));
    }
    const profile = await rebuild(s, pilot);
    if (pilot.statsStatus === "none") {
      // zKillboard has never seen them: there are no killmails to read either.
      await db.update(intelPilots).set({ deepStatus: "complete", deepAt: now, deepReachedAt: new Date(0) }).where(eq(intelPilots.characterId, id));
      await done(db, id);
      return;
    }
    await advance(db, id, 2, 1, quickPriority(s, profile));
    return;
  }

  if (item.stage === 2 || item.stage === 3) {
    const page = item.stage === 2 ? 1 : item.page;
    if (page === 1 && pilot.deepStatus === "complete" && fresh(pilot.deepAt, DEEP_TTL_MS, now)) {
      // Read recently (by another scan): rescore here and stop, without another page of losses.
      if (pilot.profile && pilot.profileVersion === PROFILE_VERSION) await rescore(s, id, pilot.profile);
      else await rebuild(s, pilot);
      await done(db, id);
      return;
    }
    const kms = await s.opts.source.page(id, page);
    const rows = kms.map((km) => toDigestRow(km, id)).filter((r) => r !== null);
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 200) {
        await db.insert(intelPilotKillmails).values(rows.slice(i, i + 200)).onConflictDoNothing();
      }
      if (!s.opts.offline) await nameDigest(db, rows);
    }
    const full = kms.length >= 200;
    const oldest = kms.length ? new Date(Math.min(...kms.map((k) => Date.parse(k.killmail_time)))) : null;
    const reachedCursor = !!pilot.newestKillmailId && kms.some((k) => k.killmail_id === pilot.newestKillmailId);
    const previousCoverage = pilot.deepStatus === "complete" ? pilot.deepReachedAt : null;
    const coveredSince = !full
      ? new Date(0) // the whole history fits on the pages read so far
      : reachedCursor && previousCoverage
        ? previousCoverage
        : (oldest ?? now);
    const more =
      full && !reachedCursor && !!oldest && oldest.getTime() > now.getTime() - DEEP_TARGET_DAYS * DAY_MS && page < DEEP_MAX_PAGES;
    await db
      .update(intelPilots)
      .set({
        deepStatus: more ? "partial" : "complete",
        deepAt: now,
        deepPages: page,
        deepReachedAt: coveredSince,
        ...(page === 1 && kms.length ? { newestKillmailId: kms[0].killmail_id } : {}),
      })
      .where(eq(intelPilots.characterId, id));
    pilot = await getPilot(db, id);
    const profile = await rebuild(s, pilot);
    if (!s.opts.offline) {
      await ensureNames(profile.associates.slice(0, 12).map((a) => a.characterId)).catch((err) =>
        s.ctx.log.debug("Could not name wingmen", { error: errorMessage(err) }),
      );
    }
    if (more) {
      await advance(db, id, 3, page + 1);
      return;
    }
    await afterDeep(s, pilot, profile);
    return;
  }

  // Stage 4: one page of losses, for fits (cyno, cloak, tackle) of dangerous pilots who rarely die.
  const kms = await s.opts.source.page(id, 1, "losses");
  const rows = kms.map((km) => toDigestRow(km, id)).filter((r) => r !== null);
  if (rows.length) {
    await db.insert(intelPilotKillmails).values(rows).onConflictDoNothing();
    if (!s.opts.offline) await nameDigest(db, rows);
  }
  await rebuild(s, await getPilot(db, id));
  await done(db, id);
}

/** After the newest killmails: maybe one page of losses, otherwise done. */
async function afterDeep(s: RunState, pilot: PilotRow, profile: PilotProfile): Promise<void> {
  const { db } = s.ctx;
  const [{ losses }] = await db
    .select({ losses: sql<number>`count(*)::int` })
    .from(intelPilotKillmails)
    .where(and(eq(intelPilotKillmails.characterId, pilot.characterId), eq(intelPilotKillmails.isLoss, true)));
  const best = await bestScore(db, pilot.characterId);
  const knownCyno = !!(profile.fits.cyno || profile.fits.covertCyno || profile.fits.industrialCyno);
  const needsLosses = best >= 50 && Number(losses) < 5 && (pilot.stats?.losses ?? 0) >= 20 && !knownCyno;
  if (needsLosses) await advance(db, pilot.characterId, 4);
  else await done(db, pilot.characterId);
}

async function bestScore(db: Db, characterId: number): Promise<number> {
  const [row] = await db
    .select({ best: sql<number | null>`max(${intelScanPilots.score})` })
    .from(intelScanPilots)
    .where(eq(intelScanPilots.characterId, characterId));
  return Number(row?.best ?? 0);
}

/** Pilots with the highest quick score get their killmails read first. */
function quickPriority(s: RunState, profile: PilotProfile): number {
  const neutral = { cls: "neutral", value: null, source: null, via: null } as const;
  const score = scorePilot(profile, {
    now: s.now(),
    standing: neutral,
    history: null,
    historyAvailable: false,
    system: null,
    systemsInfo: new Map(),
  });
  return score.composite;
}

async function refreshCorpHistory(s: RunState, characterId: number): Promise<void> {
  try {
    const res = await s.ctx.esi.get<{ corporation_id: number; start_date: string; record_id: number }[]>(
      `/characters/${characterId}/corporationhistory`,
    );
    const history: CorpHistoryEntry[] = [...res.data]
      .sort((a, b) => Date.parse(b.start_date) - Date.parse(a.start_date))
      .slice(0, 20)
      .map((h) => ({ corporationId: h.corporation_id, startDate: h.start_date }));
    await s.ctx.db.update(intelPilots).set({ corpHistory: history, corpHistoryAt: s.now() }).where(eq(intelPilots.characterId, characterId));
  } catch (err) {
    s.ctx.log.debug("Corporation history unavailable", { characterId, error: errorMessage(err) });
  }
}

/** Names, hulls and systems the profile and the latest kills show. */
async function nameDigest(
  db: Db,
  rows: { shipTypeId: number | null; otherShipTypeId: number | null; fittedTypeIds: number[]; solarSystemId: number; otherCharacterId: number | null }[],
) {
  const types = new Set<number>();
  const systems = new Set<number>();
  const characters = new Set<number>();
  for (const r of rows) {
    if (r.shipTypeId) types.add(r.shipTypeId);
    if (r.otherShipTypeId) types.add(r.otherShipTypeId);
    r.fittedTypeIds.forEach((t) => types.add(t));
    systems.add(r.solarSystemId);
  }
  for (const r of rows.slice(0, 10)) if (r.otherCharacterId) characters.add(r.otherCharacterId);
  await ensureTypes(types);
  await ensureSystems(systems);
  const known = systems.size
    ? await db.select({ constellationId: eveSystems.constellationId }).from(eveSystems).where(inArray(eveSystems.systemId, [...systems]))
    : [];
  await ensureConstellations(known.map((c) => c.constellationId).filter((c): c is number => !!c));
  await ensureNames(characters);
}

/** Rebuilds the cached profile from stored data and rescores the pilot everywhere. */
async function rebuild(s: RunState, pilot: PilotRow): Promise<PilotProfile> {
  const { db } = s.ctx;
  const now = s.now();
  const digest = await db
    .select()
    .from(intelPilotKillmails)
    .where(eq(intelPilotKillmails.characterId, pilot.characterId))
    .orderBy(desc(intelPilotKillmails.killmailTime));
  const typeIds = new Set<number>();
  const systemIds = new Set<number>();
  for (const r of digest) {
    if (r.shipTypeId) typeIds.add(r.shipTypeId);
    r.fittedTypeIds.forEach((t) => typeIds.add(t));
    systemIds.add(r.solarSystemId);
  }
  const [types, systems] = await Promise.all([
    typeIds.size ? db.select({ id: eveTypes.typeId, groupId: eveTypes.groupId }).from(eveTypes).where(inArray(eveTypes.typeId, [...typeIds])) : [],
    systemIds.size
      ? db.select({ id: eveSystems.systemId, sec: eveSystems.securityStatus }).from(eveSystems).where(inArray(eveSystems.systemId, [...systemIds]))
      : [],
  ]);
  const profile = buildProfile({
    stats: (pilot.stats as NormalizedStats | null) ?? null,
    digest: digest.map((r): DigestRow => ({ ...r })),
    coveredSince: pilot.deepStatus === "none" ? null : (pilot.deepReachedAt ?? null),
    typeGroups: new Map(types.map((t) => [t.id, t.groupId])),
    systemSecurity: new Map(systems.map((x) => [x.id, x.sec])),
    corpHistory: pilot.corpHistory ?? null,
    birthday: pilot.birthday,
    securityStatus: pilot.securityStatus,
    corporationId: pilot.corporationId,
    now,
  });
  await db
    .update(intelPilots)
    .set({ profile, profileVersion: PROFILE_VERSION, profileAt: now })
    .where(eq(intelPilots.characterId, pilot.characterId));
  await rescore(s, pilot.characterId, profile);
  return profile;
}

/** Scores the pilot in every recent scan, each with its own system and history. */
async function rescore(s: RunState, characterId: number, profile: PilotProfile): Promise<void> {
  const { db } = s.ctx;
  const now = s.now();
  const rows = await db
    .select({
      scanId: intelScanPilots.scanId,
      corporationId: intelScanPilots.corporationId,
      allianceId: intelScanPilots.allianceId,
      factionId: intelScanPilots.factionId,
      history: intelScanPilots.history,
      systemId: intelScans.systemId,
    })
    .from(intelScanPilots)
    .innerJoin(intelScans, eq(intelScans.id, intelScanPilots.scanId))
    .where(and(eq(intelScanPilots.characterId, characterId), gt(intelScans.createdAt, new Date(now.getTime() - RESCORE_WINDOW_MS))));
  if (!rows.length) return;
  const systemsInfo = await systemsInfoFor(db, profile.systems.map((x) => x.systemId));
  for (const row of rows) {
    let system: SystemContext | null = null;
    if (row.systemId) {
      if (!s.systemCache.has(row.systemId)) s.systemCache.set(row.systemId, await systemContext(row.systemId));
      system = s.systemCache.get(row.systemId) ?? null;
    }
    const standing = standingOf({ characterId, corporationId: row.corporationId, allianceId: row.allianceId, factionId: row.factionId }, s.standings);
    const score = scorePilot(profile, {
      now,
      standing,
      history: row.history,
      historyAvailable: s.historyAvailable,
      system,
      systemsInfo,
    });
    await db
      .update(intelScanPilots)
      .set({ score: score.tier === "unknown" ? null : score.composite, tier: score.tier, scoreDetail: score, scoredAt: now })
      .where(and(eq(intelScanPilots.scanId, row.scanId), eq(intelScanPilots.characterId, characterId)));
    s.touched.add(row.scanId);
  }
}

export async function systemsInfoFor(db: Db, systemIds: number[]) {
  const out = new Map<number, { constellationId: number | null; regionId: number | null }>();
  if (!systemIds.length) return out;
  const rows = await db
    .select({ id: eveSystems.systemId, constellationId: eveSystems.constellationId, regionId: eveConstellations.regionId })
    .from(eveSystems)
    .leftJoin(eveConstellations, eq(eveConstellations.constellationId, eveSystems.constellationId))
    .where(inArray(eveSystems.systemId, systemIds));
  for (const r of rows) out.set(r.id, { constellationId: r.constellationId, regionId: r.regionId });
  return out;
}

async function failItem(s: RunState, item: QueueRow, err: unknown): Promise<void> {
  const { db } = s.ctx;
  const attempts = item.attempts + 1;
  const message = errorMessage(err).slice(0, 500);
  if (attempts < MAX_ATTEMPTS) {
    await db
      .update(intelQueue)
      .set({ attempts, lastError: message, notBefore: new Date(s.now().getTime() + 30_000 * 2 ** attempts) })
      .where(eq(intelQueue.characterId, item.characterId));
    return;
  }
  // Give up on this pilot for now; the scan shows "zKillboard unavailable" for them.
  if (item.stage === 1) {
    await db.update(intelPilots).set({ statsStatus: "error", statsError: message, statsAt: s.now() }).where(eq(intelPilots.characterId, item.characterId));
  } else {
    await db.update(intelPilots).set({ deepStatus: "error" }).where(eq(intelPilots.characterId, item.characterId));
  }
  await done(db, item.characterId);
  await rebuild(s, await getPilot(db, item.characterId));
}

/** Tickers for corporations of scanned pilots that the scan could not name in time. */
async function nameScanCorporations(db: Db, scanIds: string[]): Promise<void> {
  const rows = await db.execute<{ corporation_id: string; alliance_id: string | null }>(sql`
    SELECT DISTINCT sp.corporation_id, sp.alliance_id FROM intel_scan_pilots sp
    LEFT JOIN eve_corporations c ON c.corporation_id = sp.corporation_id
    WHERE sp.scan_id IN (${sql.join(scanIds.map((id) => sql`${id}`), sql`, `)}) AND sp.corporation_id IS NOT NULL AND c.corporation_id IS NULL
    LIMIT 50`);
  if (!rows.length) return;
  await nameAffiliations(
    rows.map((r) => ({ corporationId: Number(r.corporation_id), allianceId: r.alliance_id ? Number(r.alliance_id) : null })),
    50,
  );
}

/**
 * A scan is ready once every profiled pilot has statistics and its top pilots
 * have their newest killmails. Deeper pages keep improving it afterwards.
 */
export async function finalizeScans(db: Db, now: Date): Promise<string[]> {
  const running = await db
    .select({ id: intelScans.id })
    .from(intelScans)
    .where(and(eq(intelScans.status, "running"), gt(intelScans.createdAt, new Date(now.getTime() - RESCORE_WINDOW_MS))));
  const ready: string[] = [];
  for (const { id } of running) {
    const [blocking] = await db.execute<{ n: number }>(sql`
      WITH top AS (
        SELECT character_id FROM intel_scan_pilots
        WHERE scan_id = ${id} AND profiled
        ORDER BY score DESC NULLS LAST, position LIMIT ${BRIEF_TOP}
      )
      SELECT count(*)::int AS n FROM intel_queue q
      WHERE (q.stage = 1 AND q.character_id IN (SELECT character_id FROM intel_scan_pilots WHERE scan_id = ${id} AND profiled))
         OR (q.stage = 2 AND q.character_id IN (SELECT character_id FROM top))`);
    if (Number(blocking?.n ?? 0) === 0) {
      await db.update(intelScans).set({ status: "ready", readyAt: now, updatedAt: now }).where(eq(intelScans.id, id));
      ready.push(id);
    }
  }
  return ready;
}
