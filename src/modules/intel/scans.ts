import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  eveCorporations,
  eveEntities,
  getDb,
  intelPilots,
  intelScanPilots,
  intelScans,
  type Db,
} from "@/core/db";
import { getSetting } from "@/core/settings";
import { triggerJobs } from "@/core/sync/scheduler";
import { shareId } from "@/lib/share-id";
import { MAX_INPUT_CHARS, MAX_PILOTS, MAX_PROFILED, SCAN_RATE_LIMIT, SCAN_RATE_WINDOW_MS } from "./constants";
import { encountersWithUs, engagementsWithUs, summarizeHistory } from "./history";
import { scanEntityIds, type NamingWork } from "./names";
import { parsePilotList } from "./parse";
import { priorPriority } from "./priority";
import { enqueuePilots } from "./queue";
import { refreshAffiliations, resolvePilotNames, resolveSystem } from "./resolve";
import { isFriendly, loadStandings, standingOf } from "./standings";
import type { DscanEntry, Engagement, PilotHistory } from "./types";

export const SCAN_WORKER_JOB = "intel.scan-worker";

export interface StartScanInput {
  text: string;
  systemName?: string;
  /** Used when no system name is given (rescans). */
  systemId?: number | null;
  dscan?: DscanEntry[] | null;
  userId: string;
  userName: string | null;
  aiAllowed: boolean;
  rescanOf?: string | null;
}

/** `naming`: ids the new scan shows that may still need names (see nameScanEntities). */
export type StartScanResult = { ok: true; id: string; naming: NamingWork } | { ok: false; error: string };

/**
 * Creates a scan from a paste: resolves names, affiliations and history with
 * us right away, then queues zKillboard work for the worker.
 */
export async function startScan(input: StartScanInput, deps: { now?: Date; db?: Db } = {}): Promise<StartScanResult> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  if (input.text.length > MAX_INPUT_CHARS) return { ok: false, error: "That paste is too long (100,000 characters at most)." };

  const parsed = parsePilotList(input.text);
  if (!parsed.names.length) {
    return {
      ok: false,
      error: parsed.dscanLines
        ? "That looks like a d-scan. Paste it into the d-scan box and add the pilots from local."
        : "No pilot names found. Paste the local member list, a fleet composition or names, one per line.",
    };
  }
  if (parsed.names.length > MAX_PILOTS) {
    return {
      ok: false,
      error: `That list has ${parsed.names.length.toLocaleString("en-US")} pilots; scan at most ${MAX_PILOTS} at a time.`,
    };
  }

  const [recent] = await db
    .select({ n: count() })
    .from(intelScans)
    .where(and(eq(intelScans.createdBy, input.userId), gt(intelScans.createdAt, new Date(now.getTime() - SCAN_RATE_WINDOW_MS))));
  if ((recent?.n ?? 0) >= SCAN_RATE_LIMIT) {
    return { ok: false, error: "That is a lot of scans in a short time. Give zKillboard a few minutes." };
  }

  let systemId: number | null = input.systemId ?? null;
  if (input.systemName?.trim()) {
    const system = await resolveSystem(input.systemName);
    if (!system) return { ok: false, error: `Unknown solar system "${input.systemName.trim()}".` };
    systemId = system.systemId;
  }

  const { found, unresolved } = await resolvePilotNames(parsed.names);
  if (!found.length) return { ok: false, error: "None of these names are EVE characters." };
  const affiliations = await refreshAffiliations(found);
  const standings = await loadStandings();
  const home = await getSetting("corp.homeCorporationId");
  let histories = new Map<number, PilotHistory>();
  let engagements: Engagement[] = [];
  if (home) {
    const ids = found.map((p) => p.characterId);
    const encounters = await encountersWithUs(home, ids, db);
    histories = summarizeHistory(encounters, now);
    engagements = await engagementsWithUs(home, encounters, ids, { db });
  }

  const pilots = found.map((p, position) => {
    const a = affiliations.get(p.characterId);
    const affiliated = {
      characterId: p.characterId,
      corporationId: a?.corporationId ?? null,
      allianceId: a?.allianceId ?? null,
      factionId: a?.factionId ?? null,
    };
    const standing = standingOf(affiliated, standings);
    const history = histories.get(p.characterId) ?? null;
    return {
      ...affiliated,
      name: p.name,
      position,
      history,
      friendly: isFriendly(standing),
      priority: priorPriority({ standing, history, corporationId: affiliated.corporationId, allianceId: affiliated.allianceId, now }),
    };
  });

  // Profile the most interesting non-friendly pilots; the rest can be profiled on request.
  const profiled = new Set(
    pilots
      .filter((p) => !p.friendly)
      .sort((a, b) => b.priority - a.priority || a.position - b.position)
      .slice(0, MAX_PROFILED)
      .map((p) => p.characterId),
  );

  const id = shareId();
  await db.transaction(async (tx) => {
    await tx.insert(intelScans).values({
      id,
      createdBy: input.userId,
      createdByName: input.userName,
      createdAt: now,
      updatedAt: now,
      names: parsed.names,
      unresolved,
      skipped: parsed.skipped,
      dscan: input.dscan ?? null,
      systemId,
      pilotCount: pilots.length,
      aiAllowed: input.aiAllowed,
      rescanOf: input.rescanOf ?? null,
      // Nothing to wait for when no pilot gets profiled.
      status: profiled.size ? "running" : "ready",
      readyAt: profiled.size ? null : now,
      briefingStatus: profiled.size ? "pending" : "skipped",
    });
    for (let i = 0; i < pilots.length; i += 500) {
      await tx.insert(intelScanPilots).values(
        pilots.slice(i, i + 500).map((p) => ({
          scanId: id,
          characterId: p.characterId,
          position: p.position,
          name: p.name,
          corporationId: p.corporationId,
          allianceId: p.allianceId,
          factionId: p.factionId,
          profiled: profiled.has(p.characterId),
          history: p.history,
        })),
      );
    }
    await enqueuePilots(
      pilots.filter((p) => profiled.has(p.characterId)).map((p) => ({ characterId: p.characterId, priority: p.priority })),
      tx,
    );
  });
  if (profiled.size) await triggerJobs({ jobKey: SCAN_WORKER_JOB }).catch(() => []);
  const naming = scanEntityIds(pilots.map((p) => p.history), engagements);
  return {
    ok: true,
    id,
    naming: { ...naming, pilotAffiliations: pilots.map((p) => ({ corporationId: p.corporationId, allianceId: p.allianceId })) },
  };
}

/** Queues pilots of a scan that were not profiled automatically (friendlies, very large lists). */
export async function profileRemaining(scanId: string, db: Db = getDb()): Promise<number> {
  const rows = await db
    .select({ characterId: intelScanPilots.characterId })
    .from(intelScanPilots)
    .where(and(eq(intelScanPilots.scanId, scanId), eq(intelScanPilots.profiled, false)));
  if (!rows.length) return 0;
  await db.transaction(async (tx) => {
    await tx
      .update(intelScanPilots)
      .set({ profiled: true })
      .where(and(eq(intelScanPilots.scanId, scanId), eq(intelScanPilots.profiled, false)));
    await tx.update(intelScans).set({ status: "running", readyAt: null, updatedAt: new Date() }).where(eq(intelScans.id, scanId));
    await enqueuePilots(
      rows.map((r) => ({ characterId: r.characterId, priority: 0 })),
      tx,
    );
  });
  await triggerJobs({ jobKey: SCAN_WORKER_JOB }).catch(() => []);
  return rows.length;
}

export type ScanRow = typeof intelScans.$inferSelect;

export async function getScan(id: string, db: Db = getDb()): Promise<ScanRow | null> {
  const [row] = await db.select().from(intelScans).where(eq(intelScans.id, id));
  return row ?? null;
}

const allianceNames = alias(eveEntities, "alliance_names");

/** Pilots of a scan (or one of them) with their cached profile and corporation/alliance names, best score first. */
export async function getScanPilots(scanId: string, opts: { characterId?: number; db?: Db } = {}) {
  const db = opts.db ?? getDb();
  return db
    .select({
      characterId: intelScanPilots.characterId,
      position: intelScanPilots.position,
      name: intelScanPilots.name,
      corporationId: intelScanPilots.corporationId,
      allianceId: intelScanPilots.allianceId,
      factionId: intelScanPilots.factionId,
      profiled: intelScanPilots.profiled,
      history: intelScanPilots.history,
      score: intelScanPilots.score,
      tier: intelScanPilots.tier,
      scoreDetail: intelScanPilots.scoreDetail,
      corporationName: eveCorporations.name,
      corporationTicker: eveCorporations.ticker,
      allianceName: allianceNames.name,
      statsStatus: intelPilots.statsStatus,
      statsAt: intelPilots.statsAt,
      deepStatus: intelPilots.deepStatus,
      deepAt: intelPilots.deepAt,
      profile: intelPilots.profile,
      birthday: intelPilots.birthday,
      securityStatus: intelPilots.securityStatus,
      corpHistory: intelPilots.corpHistory,
      stats: intelPilots.stats,
    })
    .from(intelScanPilots)
    .leftJoin(intelPilots, eq(intelPilots.characterId, intelScanPilots.characterId))
    .leftJoin(eveCorporations, eq(eveCorporations.corporationId, intelScanPilots.corporationId))
    .leftJoin(allianceNames, eq(allianceNames.id, intelScanPilots.allianceId))
    .where(
      opts.characterId === undefined
        ? eq(intelScanPilots.scanId, scanId)
        : and(eq(intelScanPilots.scanId, scanId), eq(intelScanPilots.characterId, opts.characterId)),
    )
    .orderBy(sql`${intelScanPilots.score} DESC NULLS LAST`, asc(intelScanPilots.position));
}

export type ScanPilot = Awaited<ReturnType<typeof getScanPilots>>[number];

/** The user's latest scans for the start page. */
export async function getRecentScans(userId: string, limit = 10, db: Db = getDb()) {
  return db
    .select({
      id: intelScans.id,
      createdAt: intelScans.createdAt,
      names: intelScans.names,
      pilotCount: intelScans.pilotCount,
      systemId: intelScans.systemId,
      status: intelScans.status,
    })
    .from(intelScans)
    .where(eq(intelScans.createdBy, userId))
    .orderBy(desc(intelScans.createdAt))
    .limit(limit);
}

export interface ScanProgress {
  status: ScanRow["status"];
  version: string;
  /** Profiled pilots still waiting for statistics, their newest killmails, or older pages. */
  pending: { stats: number; newest: number; deeper: number };
}

export async function scanProgress(scan: ScanRow, db: Db = getDb()): Promise<ScanProgress> {
  const rows = await db.execute<{ stage: number; n: number }>(sql`
    SELECT q.stage, count(*)::int AS n FROM intel_queue q
    JOIN intel_scan_pilots sp ON sp.character_id = q.character_id
    WHERE sp.scan_id = ${scan.id} AND sp.profiled
    GROUP BY q.stage`);
  const by = new Map(rows.map((r) => [Number(r.stage), Number(r.n)]));
  return {
    status: scan.status,
    version: scan.updatedAt.toISOString(),
    pending: { stats: by.get(1) ?? 0, newest: by.get(2) ?? 0, deeper: (by.get(3) ?? 0) + (by.get(4) ?? 0) },
  };
}
