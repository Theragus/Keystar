import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, intelAiNotes, intelScans, type Db } from "@/core/db";
import { env } from "@/core/env";
import { createLogger, errorMessage } from "@/core/logger";
import { lookupDisplayNames } from "../names";
import { getScan, type ScanRow } from "../scans";
import type { AiNoteKind } from "../schema";
import { loadScanView, type ScanView } from "../view";
import { matchDscan } from "../dscan";
import { claudeBriefing, claudeDossier, claudeDscan, type ClaudeOptions, type ClaudeResult } from "./claude";
import {
  briefingFacts,
  dossierFacts,
  dscanFacts,
  factsHash,
  type BriefingFacts,
  type DossierFacts,
  type DscanFacts,
  type FactsPilot,
} from "./facts";
import { claudeBudget } from "./limits";
import { templateBriefing, templateDossier, templateDscan } from "./template";
import type { Briefing, Dossier, DscanRead, StoredNote } from "./types";

/**
 * Decides who writes a note (Claude when configured, allowed and within
 * budget; the template otherwise or on failure), stores it with the facts it
 * was written from, and reuses a recent note when the facts have not changed.
 */
const log = createLogger("intel-ai");

/** A note for unchanged facts is reused for this long. */
const REUSE_MS = 6 * 3600_000;
/** Automatic briefings use Claude only for scans with at least this many non-friendly pilots. */
const MIN_PILOTS_FOR_CLAUDE = 3;

export interface WriteDeps {
  briefing?: (facts: BriefingFacts, opts: ClaudeOptions) => Promise<ClaudeResult<Briefing>>;
  dossier?: (facts: DossierFacts, opts: ClaudeOptions) => Promise<ClaudeResult<Dossier>>;
  dscan?: (facts: DscanFacts, opts: ClaudeOptions) => Promise<ClaudeResult<DscanRead>>;
  now?: Date;
  db?: Db;
}

export function claudeConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

function factsPilots(view: ScanView): FactsPilot[] {
  return view.rows.map((r) => ({
    characterId: r.pilot.characterId,
    name: r.pilot.name,
    corporationTicker: r.pilot.corporationTicker,
    corporationName: r.pilot.corporationName,
    allianceName: r.pilot.allianceName,
    standing: r.standing,
    history: r.pilot.history,
    profile: r.profile,
    score: r.score,
  }));
}

async function store<T>(
  db: Db,
  note: { kind: AiNoteKind; scanId: string | null; characterId: number | null; facts: unknown; hash: string; createdBy: string | null },
  written: { content: T; source: "claude" | "template"; model: string | null; error: string | null; usage: unknown },
  now: Date,
): Promise<StoredNote<T>> {
  await db.insert(intelAiNotes).values({
    kind: note.kind,
    scanId: note.scanId,
    characterId: note.characterId,
    factsHash: note.hash,
    source: written.source,
    model: written.model,
    error: written.error,
    content: written.content as object,
    facts: note.facts as object,
    usage: (written.usage ?? null) as object | null,
    createdBy: note.createdBy,
    createdAt: now,
  });
  return { content: written.content, source: written.source, model: written.model, error: written.error, createdAt: now.toISOString() };
}

async function reusable<T>(db: Db, where: { kind: AiNoteKind; scanId: string | null; characterId: number | null; hash: string }, now: Date) {
  const [row] = await db
    .select()
    .from(intelAiNotes)
    .where(
      and(
        eq(intelAiNotes.kind, where.kind),
        where.scanId ? eq(intelAiNotes.scanId, where.scanId) : isNull(intelAiNotes.scanId),
        where.characterId ? eq(intelAiNotes.characterId, where.characterId) : isNull(intelAiNotes.characterId),
        eq(intelAiNotes.factsHash, where.hash),
        eq(intelAiNotes.source, "claude"),
        gt(intelAiNotes.createdAt, new Date(now.getTime() - REUSE_MS)),
      ),
    )
    .orderBy(desc(intelAiNotes.createdAt))
    .limit(1);
  return row ? toStored<T>(row) : null;
}

function toStored<T>(row: typeof intelAiNotes.$inferSelect): StoredNote<T> {
  return {
    content: row.content as T,
    source: row.source === "claude" ? "claude" : "template",
    model: row.model,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Writes a scan's briefing. Automatic briefings (createdBy null) use Claude
 * only if the scan's creator may use it and the scan is big enough; manual
 * rewrites come from users the action already checked.
 */
export async function writeBriefing(
  scanOrId: ScanRow | string,
  opts: { createdBy: string | null; automatic: boolean },
  deps: WriteDeps = {},
): Promise<StoredNote<Briefing> | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const scan = typeof scanOrId === "string" ? await getScan(scanOrId, db) : scanOrId;
  if (!scan) return null;
  const view = await loadScanView(scan);
  const facts = briefingFacts({
    scan: { pilotCount: scan.pilotCount, createdAt: scan.createdAt, system: view.system?.name ?? null },
    pilots: factsPilots(view),
    summary: view.summary,
    engagements: view.engagements,
    names: view.names,
    now,
  });
  const hash = factsHash(facts);
  const markDone = () => db.update(intelScans).set({ briefingStatus: "done", updatedAt: now }).where(eq(intelScans.id, scan.id));

  const { ANTHROPIC_API_KEY: apiKey, INTEL_MODEL: model } = env();
  const wanted = opts.automatic ? scan.aiAllowed && facts.scan.nonFriendly >= MIN_PILOTS_FOR_CLAUDE : true;
  let error: string | null = null;
  if (apiKey && wanted) {
    const existing = await reusable<Briefing>(db, { kind: "briefing", scanId: scan.id, characterId: null, hash }, now);
    if (existing) {
      await markDone();
      return existing;
    }
    const budget = await claudeBudget(opts.createdBy ?? scan.createdBy, db, now);
    if (budget.ok) {
      try {
        const out = await (deps.briefing ?? claudeBriefing)(facts, { apiKey, model });
        const note = await store(db, { kind: "briefing", scanId: scan.id, characterId: null, facts, hash, createdBy: opts.createdBy }, { content: out.content, source: "claude", model: out.model, error: null, usage: out.usage }, now);
        await markDone();
        return note;
      } catch (err) {
        error = errorMessage(err);
        log.warn("Claude briefing failed, using the template", { scanId: scan.id, error });
      }
    } else {
      error = budget.reason;
    }
  }
  const note = await store(
    db,
    { kind: "briefing", scanId: scan.id, characterId: null, facts, hash, createdBy: opts.createdBy },
    { content: templateBriefing(facts), source: "template", model: null, error, usage: null },
    now,
  );
  await markDone();
  return note;
}

/** A dossier on one pilot of a scan, written on request. */
export async function writeDossier(
  scanId: string,
  characterId: number,
  opts: { createdBy: string },
  deps: WriteDeps = {},
): Promise<StoredNote<Dossier> | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const scan = await getScan(scanId, db);
  if (!scan) return null;
  const view = await loadScanView(scan);
  const pilot = factsPilots(view).find((p) => p.characterId === characterId);
  if (!pilot) return null;
  const wingmen = await lookupDisplayNames({ entityIds: pilot.profile?.associates.slice(0, 8).map((a) => a.characterId) ?? [] });
  const names = { ...view.names, entities: new Map([...view.names.entities, ...wingmen.entities]) };
  const engagements = view.engagements.filter((e) => e.pilots.some((p) => p.characterId === characterId));
  const facts = dossierFacts(pilot, engagements, names, now);
  const hash = factsHash(facts);

  const { ANTHROPIC_API_KEY: apiKey, INTEL_MODEL: model } = env();
  let error: string | null = null;
  if (apiKey) {
    const existing = await reusable<Dossier>(db, { kind: "dossier", scanId, characterId, hash }, now);
    if (existing) return existing;
    const budget = await claudeBudget(opts.createdBy, db, now);
    if (budget.ok) {
      try {
        const out = await (deps.dossier ?? claudeDossier)(facts, { apiKey, model });
        return await store(db, { kind: "dossier", scanId, characterId, facts, hash, createdBy: opts.createdBy }, { content: out.content, source: "claude", model: out.model, error: null, usage: out.usage }, now);
      } catch (err) {
        error = errorMessage(err);
        log.warn("Claude dossier failed, using the template", { scanId, characterId, error });
      }
    } else {
      error = budget.reason;
    }
  }
  return store(
    db,
    { kind: "dossier", scanId, characterId, facts, hash, createdBy: opts.createdBy },
    { content: templateDossier(facts), source: "template", model: null, error, usage: null },
    now,
  );
}

/** Claude's (or the template's) read of the scan's d-scan. */
export async function writeDscanRead(scanId: string, opts: { createdBy: string }, deps: WriteDeps = {}): Promise<StoredNote<DscanRead> | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const scan = await getScan(scanId, db);
  if (!scan?.dscan?.length) return null;
  const view = await loadScanView(scan);
  const pilots = factsPilots(view);
  const rows = matchDscan(scan.dscan, pilots, now);
  const facts = dscanFacts(rows, pilots, view.names, now);
  const hash = factsHash(facts);
  const { ANTHROPIC_API_KEY: apiKey, INTEL_MODEL: model } = env();
  let error: string | null = null;
  if (apiKey) {
    const existing = await reusable<DscanRead>(db, { kind: "dscan", scanId, characterId: null, hash }, now);
    if (existing) return existing;
    const budget = await claudeBudget(opts.createdBy, db, now);
    if (budget.ok) {
      try {
        const out = await (deps.dscan ?? claudeDscan)(facts, { apiKey, model });
        return await store(db, { kind: "dscan", scanId, characterId: null, facts, hash, createdBy: opts.createdBy }, { content: out.content, source: "claude", model: out.model, error: null, usage: out.usage }, now);
      } catch (err) {
        error = errorMessage(err);
        log.warn("Claude d-scan read failed, using the template", { scanId, error });
      }
    } else {
      error = budget.reason;
    }
  }
  return store(
    db,
    { kind: "dscan", scanId, characterId: null, facts, hash, createdBy: opts.createdBy },
    { content: templateDscan(facts), source: "template", model: null, error, usage: null },
    now,
  );
}

export async function latestNote<T>(where: { kind: AiNoteKind; scanId: string; characterId?: number }, db: Db = getDb()): Promise<StoredNote<T> | null> {
  const [row] = await db
    .select()
    .from(intelAiNotes)
    .where(
      and(
        eq(intelAiNotes.kind, where.kind),
        eq(intelAiNotes.scanId, where.scanId),
        where.characterId ? eq(intelAiNotes.characterId, where.characterId) : isNull(intelAiNotes.characterId),
      ),
    )
    .orderBy(desc(intelAiNotes.createdAt))
    .limit(1);
  return row ? toStored<T>(row) : null;
}
