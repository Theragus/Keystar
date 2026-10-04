"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/core/audit";
import { assertPermission, getCurrentUser, type CurrentUser } from "@/core/auth/dal";
import { calendarEvents, fleets, getDb, miningOpParticipants, miningOps } from "@/core/db";
import { isOreClass } from "@/core/eve/ore";
import { ensureSystems } from "@/core/eve/resolver";
import { getSettings } from "@/core/settings";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { shareId, SHARE_ID_PATTERN } from "@/lib/share-id";
import { parseLocaleNumber } from "@/modules/mining/estimator/parse";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { opStatus } from "@/modules/mining/ops/attribution";
import { finalizeOp, getOp, getOpResult, reopenOp, type MiningOp } from "@/modules/mining/ops/queries";
import type { MiningOpParticipation, MiningOpSplitMode } from "@/modules/mining/schema";

/**
 * Mining op mutations. Managing ops needs mining.ops.manage; pilots can only
 * opt their own characters out of (or back into) an op they appear in.
 */

export type OpFormError =
  | "forbidden"
  | "noHomeCorp"
  | "name"
  | "start"
  | "end"
  | "tooLong"
  | "systems"
  | "fleet"
  | "event"
  | "fleetMissing"
  | "eventMissing"
  | "rate"
  | "corpCut"
  | "finalized"
  | "notFound"
  | "unknown";

export type OpFormState = { error: OpFormError | null };

export type OpActionError = "forbidden" | "notFound" | "finalized" | "notOwned" | "planned";

const MAX_OP_MS = 31 * 86400_000;
const MAX_SYSTEMS = 20;
const VALUATION_SOURCES = ["jita_buy", "jita_sell", "jita_split", "esi_average"] as const;

async function manager(): Promise<CurrentUser | null> {
  return assertPermission(MINING_PERMISSIONS.manageOps).catch(() => null);
}

/** "2026-10-02T19:00" from a datetime-local field, taken as EVE time (UTC). */
function eveTime(value: FormDataEntryValue | null): Date | null | "invalid" {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return "invalid";
  const d = new Date(`${s.length === 16 ? `${s}:00` : s}Z`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function pct(value: FormDataEntryValue | null, fallback: number): number {
  const s = String(value ?? "").trim().replace(/%$/, "").trim();
  if (!s) return fallback;
  const n = parseLocaleNumber(s);
  return n === null ? NaN : n;
}

function ids(values: FormDataEntryValue[]): number[] {
  return [...new Set(values.map((v) => Number(v)).filter((n) => Number.isSafeInteger(n) && n > 0))];
}

function optionalId(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Creates (no `id`) or updates an op from the op form, then opens it. */
export async function saveOp(_prev: OpFormState, formData: FormData): Promise<OpFormState> {
  const user = await manager();
  if (!user) return { error: "forbidden" };
  const settings = await getSettings();
  const corporationId = settings["corp.homeCorporationId"];
  if (!corporationId) return { error: "noHomeCorp" };
  const db = getDb();

  const id = String(formData.get("id") ?? "");
  const existing = id ? await getOp(id) : null;
  if (id && (!SHARE_ID_PATTERN.test(id) || !existing || existing.corporationId !== corporationId)) return { error: "notFound" };
  if (existing?.finalizedAt) return { error: "finalized" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: "name" };
  const startsAt = eveTime(formData.get("startsAt"));
  if (!startsAt || startsAt === "invalid") return { error: "start" };
  const endsAt = eveTime(formData.get("endsAt"));
  if (endsAt === "invalid" || (endsAt && endsAt <= startsAt)) return { error: "end" };
  if (endsAt && endsAt.getTime() - startsAt.getTime() > MAX_OP_MS) return { error: "tooLong" };

  const solarSystemIds = ids(formData.getAll("systems"));
  if (solarSystemIds.length > MAX_SYSTEMS) return { error: "systems" };
  const oreClasses = [...new Set(formData.getAll("classes").map(String))].filter(isOreClass);

  const participationRaw = String(formData.get("participation") ?? "anyone");
  const participation: MiningOpParticipation =
    participationRaw === "fleet" || participationRaw === "calendar" ? participationRaw : "anyone";
  const fleetId = optionalId(formData.get("fleetId"));
  const calendarEventId = optionalId(formData.get("calendarEventId"));
  if (fleetId) {
    const [fleet] = await db.select({ id: fleets.fleetId }).from(fleets).where(eq(fleets.fleetId, fleetId));
    if (!fleet) return { error: "fleet" };
  }
  if (calendarEventId) {
    const [event] = await db.select({ id: calendarEvents.eventId }).from(calendarEvents).where(eq(calendarEvents.eventId, calendarEventId));
    if (!event) return { error: "event" };
  }
  if (participation === "fleet" && !fleetId) return { error: "fleetMissing" };
  if (participation === "calendar" && !calendarEventId) return { error: "eventMissing" };

  const sourceRaw = String(formData.get("valuationSource") ?? "");
  const valuationSource = (VALUATION_SOURCES as readonly string[]).includes(sourceRaw)
    ? (sourceRaw as (typeof VALUATION_SOURCES)[number])
    : settings["mining.valuationSource"];
  const ratePct = pct(formData.get("ratePct"), 100);
  if (!(ratePct >= 0 && ratePct <= 100)) return { error: "rate" };
  const corpCutPct = pct(formData.get("corpCutPct"), 0);
  if (!(corpCutPct >= 0 && corpCutPct <= 100)) return { error: "corpCut" };
  const splitMode: MiningOpSplitMode = formData.get("splitMode") === "equal" ? "equal" : "contribution";
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);

  const values = {
    name,
    startsAt,
    endsAt,
    solarSystemIds,
    oreClasses,
    participation,
    fleetId,
    calendarEventId,
    valuationSource,
    ratePct,
    corpCutPct,
    splitMode,
    notes,
    updatedAt: new Date(),
  };
  let opId = id;
  try {
    if (existing) {
      await db.update(miningOps).set(values).where(eq(miningOps.id, existing.id));
    } else {
      opId = shareId();
      await db.insert(miningOps).values({ ...values, id: opId, corporationId, createdBy: user.id, createdByName: user.main?.name ?? null });
    }
    await ensureSystems(solarSystemIds);
  } catch {
    return { error: "unknown" };
  }
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: existing ? "mining.op.updated" : "mining.op.created",
    targetType: "mining_op",
    targetId: opId,
    details: { name },
  });
  revalidatePath("/mining/ops", "layout");
  redirect(`/mining/ops/${opId}`);
}

type Managed = { refusal: ActionResult<OpActionError> } | { user: CurrentUser; op: MiningOp };

/** The op if the signed-in user may manage it, else why not. */
async function managedOp(opId: string): Promise<Managed> {
  const user = await manager();
  if (!user) return { refusal: refused("forbidden") };
  const settings = await getSettings();
  const op = SHARE_ID_PATTERN.test(opId) ? await getOp(opId) : null;
  if (!op || op.corporationId !== settings["corp.homeCorporationId"]) return { refusal: refused("notFound") };
  return { user, op };
}

function done(opId: string): ActionResult<OpActionError> {
  revalidatePath(`/mining/ops/${opId}`);
  revalidatePath("/mining/ops");
  return ok;
}

export async function endOpNow(opId: string): Promise<ActionResult<OpActionError>> {
  const res = await managedOp(opId);
  if ("refusal" in res) return res.refusal;
  const now = new Date();
  if (res.op.finalizedAt) return refused("finalized");
  if (now <= res.op.startsAt) return refused("planned");
  await getDb().update(miningOps).set({ endsAt: now, updatedAt: now }).where(eq(miningOps.id, opId));
  return done(opId);
}

export async function finalizeOpAction(opId: string): Promise<ActionResult<OpActionError>> {
  const res = await managedOp(opId);
  if ("refusal" in res) return res.refusal;
  if (opStatus(res.op, new Date()) === "planned") return refused("planned");
  if (!(await finalizeOp(opId, res.user.main?.name ?? null))) return refused("finalized");
  await audit({
    actorUserId: res.user.id,
    actorName: res.user.main?.name,
    action: "mining.op.finalized",
    targetType: "mining_op",
    targetId: opId,
  });
  return done(opId);
}

export async function reopenOpAction(opId: string): Promise<ActionResult<OpActionError>> {
  const res = await managedOp(opId);
  if ("refusal" in res) return res.refusal;
  await reopenOp(opId);
  await audit({
    actorUserId: res.user.id,
    actorName: res.user.main?.name,
    action: "mining.op.reopened",
    targetType: "mining_op",
    targetId: opId,
  });
  return done(opId);
}

export async function deleteOpAction(opId: string): Promise<ActionResult<OpActionError>> {
  const res = await managedOp(opId);
  if ("refusal" in res) return res.refusal;
  await getDb().delete(miningOps).where(eq(miningOps.id, opId));
  await audit({
    actorUserId: res.user.id,
    actorName: res.user.main?.name,
    action: "mining.op.deleted",
    targetType: "mining_op",
    targetId: opId,
    details: { name: res.op.name },
  });
  revalidatePath("/mining/ops");
  redirect("/mining/ops");
}

/** Organiser: include or exclude a character, or (`null`) go back to the participation rule. */
export async function setParticipant(
  opId: string,
  characterId: number,
  mode: "included" | "excluded" | null,
): Promise<ActionResult<OpActionError>> {
  const res = await managedOp(opId);
  if ("refusal" in res) return res.refusal;
  if (res.op.finalizedAt) return refused("finalized");
  if (!Number.isSafeInteger(characterId) || characterId <= 0) return refused("notFound");
  const db = getDb();
  const where = and(eq(miningOpParticipants.opId, opId), eq(miningOpParticipants.characterId, characterId));
  if (mode === null) await db.delete(miningOpParticipants).where(where);
  else
    await db
      .insert(miningOpParticipants)
      .values({ opId, characterId, mode, self: false, setByName: res.user.main?.name ?? null })
      .onConflictDoUpdate({
        target: [miningOpParticipants.opId, miningOpParticipants.characterId],
        set: { mode, self: false, setByName: res.user.main?.name ?? null, setAt: new Date() },
      });
  return done(opId);
}

/** A pilot takes one of their own characters out of an op, or puts it back. */
export async function setSelfOptOut(opId: string, characterId: number, out: boolean): Promise<ActionResult<OpActionError>> {
  const user = await getCurrentUser();
  if (!user || !user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp)) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  const op = SHARE_ID_PATTERN.test(opId) ? await getOp(opId) : null;
  const settings = await getSettings();
  if (!op || op.corporationId !== settings["corp.homeCorporationId"]) return refused("notFound");
  if (op.finalizedAt) return refused("finalized");
  // Only for characters the op actually lists, so nobody can litter ops they have nothing to do with.
  const result = await getOpResult(op);
  if (!result.pilots.some((p) => p.characterId === characterId)) return refused("notFound");
  const db = getDb();
  const where = and(eq(miningOpParticipants.opId, opId), eq(miningOpParticipants.characterId, characterId));
  const [current] = await db.select().from(miningOpParticipants).where(where);
  if (out) {
    // An organiser's decision stands; the pilot's opt-out only fills an empty slot or replaces their own.
    if (current && !current.self) return refused("forbidden");
    await db
      .insert(miningOpParticipants)
      .values({ opId, characterId, mode: "excluded", self: true, setByName: user.main?.name ?? null })
      .onConflictDoNothing();
  } else if (current?.self) {
    await db.delete(miningOpParticipants).where(where);
  }
  return done(opId);
}
