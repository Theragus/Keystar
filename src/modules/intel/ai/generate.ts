import { and, desc, eq, gt, gte, inArray, isNull } from "drizzle-orm";
import { getDb, intelAiNotes, intelScans, type Db } from "@/core/db";
import { env } from "@/core/env";
import { createLogger, errorMessage } from "@/core/logger";
import type { Locale } from "@/i18n/config";
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
  type BriefingInput,
  type DossierFacts,
  type DscanFacts,
  type FactsPilot,
} from "./facts";
import { reserveClaudeCall } from "./limits";
import { templateBriefing, templateDossier, templateDscan } from "./template";
import type { Briefing, Dossier, DscanRead, StoredNote } from "./types";

/**
 * Decides who writes a note (Claude when configured, allowed and within
 * budget; the template otherwise or on failure), stores it with the facts it
 * was written from, and reuses a recent note when the facts and the language
 * have not changed. Claude writes in the asker's language; template notes are
 * stored as drafts and written out in each reader's language (template.ts).
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

type NoteKey = { kind: AiNoteKind; scanId: string | null; characterId: number | null; facts: unknown; hash: string; createdBy: string | null };

async function store(
  db: Db,
  note: NoteKey,
  written: { content: unknown; source: "claude" | "template"; model: string | null; error: string | null; usage: unknown; locale: Locale | null },
  now: Date,
): Promise<StoredNote<unknown>> {
  await db.insert(intelAiNotes).values({
    kind: note.kind,
    scanId: note.scanId,
    characterId: note.characterId,
    factsHash: note.hash,
    source: written.source,
    model: written.model,
    error: written.error,
    locale: written.locale,
    content: written.content as object,
    facts: note.facts as object,
    usage: (written.usage ?? null) as object | null,
    createdBy: note.createdBy,
    createdAt: now,
  });
  return {
    content: written.content,
    source: written.source,
    model: written.model,
    error: written.error,
    locale: written.locale,
    createdAt: now.toISOString(),
  };
}

async function reusable(
  db: Db,
  where: { kind: AiNoteKind; scanId: string | null; characterId: number | null; hash: string; locale: Locale },
  now: Date,
) {
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
        eq(intelAiNotes.locale, where.locale),
        gt(intelAiNotes.createdAt, new Date(now.getTime() - REUSE_MS)),
      ),
    )
    .orderBy(desc(intelAiNotes.createdAt))
    .limit(1);
  return row ? toStored(row) : null;
}

function toStored(row: typeof intelAiNotes.$inferSelect): StoredNote<unknown> {
  return {
    content: row.content,
    source: row.source === "claude" ? "claude" : "template",
    model: row.model,
    error: row.error,
    locale: row.locale,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Completes a reserved note with what Claude, or the template after a failure, wrote. */
async function complete(
  db: Db,
  id: number,
  written: { content: unknown; source: "claude" | "template"; model: string | null; error: string | null; usage: unknown; locale: Locale | null },
): Promise<StoredNote<unknown>> {
  const [row] = await db
    .update(intelAiNotes)
    .set({
      source: written.source,
      model: written.model,
      error: written.error,
      locale: written.locale,
      content: written.content as object,
      usage: (written.usage ?? null) as object | null,
    })
    .where(eq(intelAiNotes.id, id))
    .returning();
  // The scan (and its notes) may have been deleted while Claude was writing.
  return row ? toStored(row) : { ...written, createdAt: new Date().toISOString() };
}

/**
 * Asks Claude unless a recent note for the same facts and language exists;
 * falls back to the template draft without a key, over budget or on failure.
 * A Claude call is reserved against the hourly budget before it is made, so
 * failed and concurrent calls count too.
 */
async function write<F>(
  db: Db,
  note: Omit<NoteKey, "facts" | "hash"> & { facts: F; budgetUser: string | null; useClaude: boolean; locale: Locale },
  claude: (facts: F, opts: ClaudeOptions) => Promise<ClaudeResult<unknown>>,
  template: () => unknown,
  now: Date,
): Promise<StoredNote<unknown>> {
  const key: NoteKey = { kind: note.kind, scanId: note.scanId, characterId: note.characterId, facts: note.facts, hash: factsHash(note.facts), createdBy: note.createdBy };
  const { ANTHROPIC_API_KEY: apiKey, INTEL_MODEL: model } = env();
  let error: string | null = null;
  if (apiKey && note.useClaude) {
    const existing = await reusable(db, { ...key, locale: note.locale }, now);
    if (existing) return existing;
    const slot = await reserveClaudeCall(
      db,
      { kind: key.kind, scanId: key.scanId, characterId: key.characterId, factsHash: key.hash, facts: key.facts as object, createdBy: key.createdBy },
      note.budgetUser,
      now,
    );
    if (slot.ok) {
      try {
        const out = await claude(note.facts, { apiKey, model, locale: note.locale });
        return await complete(db, slot.id, { content: out.content, source: "claude", model: out.model, error: null, usage: out.usage, locale: note.locale });
      } catch (err) {
        error = errorMessage(err);
        log.warn("Claude failed, using the template", { kind: note.kind, scanId: note.scanId, characterId: note.characterId, error });
        return complete(db, slot.id, { content: template(), source: "template", model: null, error, usage: null, locale: null });
      }
    }
    error = slot.reason;
  }
  return store(db, key, { content: template(), source: "template", model: null, error, usage: null, locale: null }, now);
}

/**
 * Writes a scan's briefing. Automatic briefings (createdBy null) use Claude
 * only if the scan's creator may use it and the scan is big enough, and are
 * written in the creator's language; manual rewrites come from users the
 * action already checked, in their language.
 */
export async function writeBriefing(
  scanOrId: ScanRow | string,
  opts: { createdBy: string | null; automatic: boolean; locale?: Locale },
  deps: WriteDeps = {},
): Promise<StoredNote<unknown> | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const scan = typeof scanOrId === "string" ? await getScan(scanOrId, db) : scanOrId;
  if (!scan) return null;
  const view = await loadScanView(scan);
  const input: BriefingInput = {
    scan: { pilotCount: scan.pilotCount, createdAt: scan.createdAt, system: view.system?.name ?? null },
    pilots: factsPilots(view),
    summary: view.summary,
    engagements: view.engagements,
    names: view.names,
    now,
  };
  const facts = briefingFacts(input);
  const note = await write(
    db,
    {
      kind: "briefing",
      scanId: scan.id,
      characterId: null,
      facts,
      createdBy: opts.createdBy,
      budgetUser: opts.createdBy ?? scan.createdBy,
      useClaude: opts.automatic ? scan.aiAllowed && facts.scan.nonFriendly >= MIN_PILOTS_FOR_CLAUDE : true,
      locale: opts.locale ?? scan.locale,
    },
    deps.briefing ?? claudeBriefing,
    () => templateBriefing(input),
    now,
  );
  await db.update(intelScans).set({ briefingStatus: "done", updatedAt: now }).where(eq(intelScans.id, scan.id));
  return note;
}

/** A dossier on one pilot of a scan, written on request in the asker's language. */
export async function writeDossier(
  scanId: string,
  characterId: number,
  opts: { createdBy: string; locale: Locale },
  deps: WriteDeps = {},
): Promise<StoredNote<unknown> | null> {
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
  return write(
    db,
    { kind: "dossier", scanId, characterId, facts: dossierFacts(pilot, engagements, names, now), createdBy: opts.createdBy, budgetUser: opts.createdBy, useClaude: true, locale: opts.locale },
    deps.dossier ?? claudeDossier,
    () => templateDossier(pilot, names),
    now,
  );
}

/** Claude's (or the template's) read of the scan's d-scan, in the asker's language. */
export async function writeDscanRead(
  scanId: string,
  opts: { createdBy: string; locale: Locale },
  deps: WriteDeps = {},
): Promise<StoredNote<unknown> | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const scan = await getScan(scanId, db);
  if (!scan?.dscan?.length) return null;
  const view = await loadScanView(scan);
  const pilots = factsPilots(view);
  const rows = matchDscan(scan.dscan, pilots, now);
  return write(
    db,
    { kind: "dscan", scanId, characterId: null, facts: dscanFacts(rows, pilots, view.names, now), createdBy: opts.createdBy, budgetUser: opts.createdBy, useClaude: true, locale: opts.locale },
    deps.dscan ?? claudeDscan,
    () => templateDscan(rows),
    now,
  );
}

/**
 * The newest written note of a kind (written `since`, when given), as stored;
 * read it with readBriefing/readDossier/readDscan (template.ts).
 */
export async function latestNote(
  where: { kind: AiNoteKind; scanId: string; characterId?: number; since?: Date | null },
  db: Db = getDb(),
): Promise<StoredNote<unknown> | null> {
  const [row] = await db
    .select()
    .from(intelAiNotes)
    .where(
      and(
        eq(intelAiNotes.kind, where.kind),
        eq(intelAiNotes.scanId, where.scanId),
        where.characterId ? eq(intelAiNotes.characterId, where.characterId) : isNull(intelAiNotes.characterId),
        inArray(intelAiNotes.source, ["claude", "template"]),
        where.since ? gte(intelAiNotes.createdAt, where.since) : undefined,
      ),
    )
    .orderBy(desc(intelAiNotes.createdAt))
    .limit(1);
  return row ? toStored(row) : null;
}
