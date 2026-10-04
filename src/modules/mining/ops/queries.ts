import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, miningOpParticipants, miningOps, miningOpShares, miningOpShareTypes, type Db } from "@/core/db";
import { isOreClass, type OreClass } from "@/core/eve/ore";
import { ORE_CLASS_SQL } from "../queries";
import type { MiningOpParticipation } from "../schema";
import {
  attributeOp,
  DEFAULT_END_GRACE_MS,
  opInterval,
  type AttributedPilot,
  type OpOverride,
  type OpWindow,
  type ParticipantStatus,
  type TimeSpan,
} from "./attribution";
import { computePayout, type Payout } from "./payout";

/**
 * Loading and computing mining ops. A running or ended op is computed live
 * from measured activity (see attribution.ts); a finalized op is read back
 * from the shares frozen when it was finalized.
 */

export type MiningOp = typeof miningOps.$inferSelect;

/** Measured activity stops counting as "tracked" after this long without an observation (activity.ts). */
const TRACKING_GAP_MS = 40 * 60_000;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const list = (values: (number | string)[]): SQL =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

export function opOreClasses(op: Pick<MiningOp, "oreClasses">): OreClass[] {
  return op.oreClasses.filter(isOreClass);
}

export async function getOp(id: string): Promise<MiningOp | null> {
  const [op] = await getDb().select().from(miningOps).where(eq(miningOps.id, id));
  return op ?? null;
}

export interface OpListItem {
  op: MiningOp;
  systems: string[];
  /** Frozen totals of finalized ops; live ops are computed when opened. */
  payees: number | null;
  paid: number | null;
}

/**
 * Ops of the corporation, newest first. With `onlyFor`, only ops one of these
 * characters takes part in (frozen in a share, an override, the linked fleet
 * or accepted calendar event, or activity in the op's time and place).
 */
export async function listOps(corporationId: number, opts: { onlyFor?: number[]; limit?: number } = {}): Promise<OpListItem[]> {
  const db = getDb();
  const conds: SQL[] = [sql`o.corporation_id = ${corporationId}`];
  if (opts.onlyFor) {
    if (!opts.onlyFor.length) return [];
    const ids = list(opts.onlyFor);
    conds.push(sql`(
      EXISTS (SELECT 1 FROM mining_op_shares s WHERE s.op_id = o.id AND s.character_ids && ARRAY[${ids}]::bigint[])
      OR EXISTS (SELECT 1 FROM mining_op_participants p WHERE p.op_id = o.id AND p.character_id IN (${ids}))
      OR (o.participation = 'fleet' AND EXISTS (
        SELECT 1 FROM fleet_members m WHERE m.fleet_id = o.fleet_id AND m.character_id IN (${ids})))
      OR (o.participation = 'calendar' AND EXISTS (
        SELECT 1 FROM calendar_event_attendees a
        WHERE a.event_id = o.calendar_event_id AND a.response = 'accepted' AND a.character_id IN (${ids})))
      OR (o.finalized_at IS NULL AND EXISTS (
        SELECT 1 FROM mining_activity a
        WHERE a.character_id IN (${ids})
          AND a.window_end > o.starts_at
          AND a.window_start < COALESCE(o.ends_at + make_interval(secs => ${DEFAULT_END_GRACE_MS / 1000}), now())
          AND (cardinality(o.solar_system_ids) = 0 OR a.solar_system_id = ANY(o.solar_system_ids))))
    )`);
  }
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT o.id,
           (SELECT array_agg(COALESCE(s.name, x::text) ORDER BY s.name)
              FROM unnest(o.solar_system_ids) x LEFT JOIN eve_systems s ON s.system_id = x) AS systems,
           (SELECT COUNT(*)::int FROM mining_op_shares s WHERE s.op_id = o.id) AS payees,
           (SELECT SUM(s.share_value)::float8 FROM mining_op_shares s WHERE s.op_id = o.id) AS paid
    FROM mining_ops o
    WHERE ${sql.join(conds, sql` AND `)}
    ORDER BY o.starts_at DESC
    LIMIT ${opts.limit ?? 100}`);
  if (!rows.length) return [];
  const ops = await db
    .select()
    .from(miningOps)
    .where(inArray(miningOps.id, rows.map((r) => String(r.id))))
    .orderBy(desc(miningOps.startsAt));
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return ops.map((op) => {
    const r = byId.get(op.id)!;
    return {
      op,
      systems: (r.systems as string[] | null) ?? [],
      payees: op.finalizedAt ? num(r.payees) : null,
      paid: op.finalizedAt ? num(r.paid) : null,
    };
  });
}

export interface OpOreLine {
  typeId: number;
  name: string;
  oreClass: OreClass;
  quantity: number;
  volume: number;
  unitPrice: number;
  value: number;
}

export interface OpPilot {
  characterId: number;
  name: string;
  userId: string | null;
  payeeCharacterId: number;
  status: ParticipantStatus;
  reason: AttributedPilot["reason"];
  overrideReason: string;
  ore: OpOreLine[];
  volume: number;
  value: number;
}

export interface OpPayee {
  payeeCharacterId: number;
  name: string;
  userId: string | null;
  characterIds: number[];
  volume: number;
  value: number;
  share: number;
}

export interface OpMissing {
  characterId: number;
  name: string;
  /** no_tracking: no mining token or never synced; gap: the ledger wasn't read during part of the op. */
  reason: "no_tracking" | "gap";
}

export interface OpResult {
  frozen: boolean;
  pilots: OpPilot[];
  payees: OpPayee[];
  payout: Omit<Payout, "shares">;
  ore: OpOreLine[];
  /** Characters expected in the op (fleet, calendar, included) without measured activity for it. */
  missing: OpMissing[];
  /** Ore on the op's days and in its systems that the activity windows don't account for, per character. */
  unplaced: Map<number, { volume: number; value: number }>;
}

interface TypeInfo {
  name: string;
  oreClass: OreClass;
  unitVolume: number;
  unitPrice: number;
}

/** Name, ore class, volume and the op's price (the valuation on the op's last day, else the current one). */
async function typeInfo(db: Db, op: MiningOp, typeIds: number[], priceDate: string): Promise<Map<number, TypeInfo>> {
  if (!typeIds.length) return new Map();
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT x.type_id, t.name, ${ORE_CLASS_SQL} AS ore_class, COALESCE(t.volume, 0)::float8 AS unit_volume,
           COALESCE((SELECT h.unit_price FROM type_value_history h
                      WHERE h.type_id = x.type_id AND h.source = ${op.valuationSource} AND h.date <= ${priceDate}::date
                      ORDER BY h.date DESC LIMIT 1), v.unit_price, 0)::float8 AS unit_price
    FROM unnest(ARRAY[${list(typeIds)}]::int[]) AS x(type_id)
    LEFT JOIN eve_types t ON t.type_id = x.type_id
    LEFT JOIN eve_groups g ON g.group_id = t.group_id
    LEFT JOIN type_values v ON v.type_id = x.type_id AND v.source = ${op.valuationSource}`);
  return new Map(
    rows.map((r) => [
      num(r.type_id),
      {
        name: (r.name as string | null) ?? `#${r.type_id}`,
        oreClass: isOreClass(String(r.ore_class)) ? (String(r.ore_class) as OreClass) : "other",
        unitVolume: num(r.unit_volume),
        unitPrice: num(r.unit_price),
      },
    ]),
  );
}

interface Identity {
  name: string;
  userId: string | null;
  payeeCharacterId: number;
  payeeName: string;
}

/** Names and accounts; a payee is the account's main character, or the character itself. */
async function identities(db: Db, characterIds: number[]): Promise<Map<number, Identity>> {
  if (!characterIds.length) return new Map();
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT x.id AS character_id, COALESCE(c.name, e.name, '#' || x.id) AS name, c.user_id,
           COALESCE(u.main_character_id, x.id) AS payee_id,
           COALESCE(mc.name, c.name, e.name, '#' || x.id) AS payee_name
    FROM unnest(ARRAY[${list(characterIds)}]::bigint[]) AS x(id)
    LEFT JOIN characters c ON c.character_id = x.id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN characters mc ON mc.character_id = u.main_character_id
    LEFT JOIN eve_entities e ON e.id = x.id`);
  return new Map(
    rows.map((r) => [
      num(r.character_id),
      {
        name: String(r.name),
        userId: (r.user_id as string | null) ?? null,
        payeeCharacterId: num(r.payee_id),
        payeeName: String(r.payee_name),
      },
    ]),
  );
}

/** ISO dates (UTC) the op touches: ledger days. */
function opDates(start: number, end: number): string[] {
  const out: string[] = [];
  for (let d = new Date(new Date(start).toISOString().slice(0, 10)); d.getTime() <= end; d = new Date(d.getTime() + 86400_000)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > 62) break;
  }
  return out;
}

function classCond(classes: OreClass[]): SQL {
  return classes.length ? sql`AND (${ORE_CLASS_SQL}) IN (${list(classes)})` : sql``;
}

function aggregateOre(lines: OpOreLine[]): OpOreLine[] {
  const byType = new Map<number, OpOreLine>();
  for (const l of lines) {
    const t = byType.get(l.typeId) ?? { ...l, quantity: 0, volume: 0, value: 0 };
    t.quantity += l.quantity;
    t.volume += l.volume;
    t.value += l.value;
    byType.set(l.typeId, t);
  }
  return [...byType.values()].sort((a, b) => b.value - a.value);
}

function payeesOf(pilots: OpPilot[], identity: Map<number, Identity>): Omit<OpPayee, "share">[] {
  const byPayee = new Map<number, Omit<OpPayee, "share">>();
  for (const p of pilots) {
    if (p.status !== "counted") continue;
    const id = identity.get(p.characterId);
    const payee = byPayee.get(p.payeeCharacterId) ?? {
      payeeCharacterId: p.payeeCharacterId,
      name: id?.payeeName ?? p.name,
      userId: p.userId,
      characterIds: [],
      volume: 0,
      value: 0,
    };
    payee.characterIds.push(p.characterId);
    payee.volume += p.volume;
    payee.value += p.value;
    byPayee.set(p.payeeCharacterId, payee);
  }
  return [...byPayee.values()];
}

async function overridesOf(db: Db, opId: string) {
  const rows = await db.select().from(miningOpParticipants).where(eq(miningOpParticipants.opId, opId));
  return new Map(rows.map((r) => [r.characterId, r]));
}

/** The op's result: frozen shares for a finalized op, otherwise computed from activity now. */
export async function getOpResult(op: MiningOp, now = new Date()): Promise<OpResult> {
  return op.finalizedAt ? frozenResult(op) : liveResult(op, now);
}

async function frozenResult(op: MiningOp): Promise<OpResult> {
  const db = getDb();
  const [shares, types, overrides] = await Promise.all([
    db.select().from(miningOpShares).where(eq(miningOpShares.opId, op.id)),
    db.select().from(miningOpShareTypes).where(eq(miningOpShareTypes.opId, op.id)),
    overridesOf(db, op.id),
  ]);
  const characterIds = [...new Set([...shares.flatMap((s) => s.characterIds), ...overrides.keys()])];
  const [identity, info] = await Promise.all([
    identities(db, characterIds),
    typeInfo(db, op, [...new Set(types.map((t) => t.typeId))], (op.endsAt ?? op.finalizedAt!).toISOString().slice(0, 10)),
  ]);
  const counted = new Set(shares.flatMap((s) => s.characterIds));
  const pilots: OpPilot[] = characterIds.map((characterId) => {
    const id = identity.get(characterId);
    const ore = types
      .filter((t) => t.characterId === characterId)
      .map((t) => ({
        typeId: t.typeId,
        name: info.get(t.typeId)?.name ?? `#${t.typeId}`,
        oreClass: info.get(t.typeId)?.oreClass ?? "other",
        quantity: t.quantity,
        volume: t.quantity * t.unitVolume,
        unitPrice: t.unitPrice,
        value: t.quantity * t.unitPrice,
      }));
    const override = overrides.get(characterId);
    return {
      characterId,
      name: id?.name ?? `#${characterId}`,
      userId: id?.userId ?? null,
      payeeCharacterId: shares.find((s) => s.characterIds.includes(characterId))?.payeeCharacterId ?? characterId,
      status: counted.has(characterId) ? "counted" : "excluded",
      reason: override ? (override.self ? "self" : "override") : null,
      overrideReason: override?.reason ?? "",
      ore,
      volume: ore.reduce((s, o) => s + o.volume, 0),
      value: ore.reduce((s, o) => s + o.value, 0),
    };
  });
  const payees: OpPayee[] = shares.map((s) => ({
    payeeCharacterId: s.payeeCharacterId,
    name: identity.get(s.payeeCharacterId)?.name ?? identity.get(s.characterIds[0])?.payeeName ?? `#${s.payeeCharacterId}`,
    userId: s.userId,
    characterIds: s.characterIds,
    volume: s.volume,
    value: s.grossValue,
    share: s.shareValue,
  }));
  const settings = { ratePct: op.ratePct, corpCutPct: op.corpCutPct, splitMode: op.splitMode };
  const { gross, pool, corpCut } = computePayout(payees, settings);
  return {
    frozen: true,
    pilots: sortPilots(pilots),
    payees: payees.sort((a, b) => b.share - a.share),
    payout: { gross, pool, corpCut, distributed: payees.reduce((s, p) => s + p.share, 0) },
    ore: aggregateOre(pilots.filter((p) => p.status === "counted").flatMap((p) => p.ore)),
    missing: [],
    unplaced: new Map(),
  };
}

function sortPilots(pilots: OpPilot[]): OpPilot[] {
  const rank: Record<ParticipantStatus, number> = { counted: 0, outside: 1, excluded: 2 };
  return pilots.sort((a, b) => rank[a.status] - rank[b.status] || b.value - a.value || a.name.localeCompare(b.name));
}

async function fleetSpans(db: Db, fleetId: number): Promise<Map<number, TimeSpan[]>> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT m.character_id, m.join_time, COALESCE(m.left_at, f.ended_at) AS left_at
    FROM fleet_members m JOIN fleets f ON f.fleet_id = m.fleet_id
    WHERE m.fleet_id = ${fleetId}`);
  return new Map(
    rows.map((r) => [
      num(r.character_id),
      [{ start: new Date(r.join_time as string), end: r.left_at ? new Date(r.left_at as string) : null }],
    ]),
  );
}

async function acceptedAttendees(db: Db, eventId: number): Promise<Set<number>> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT character_id FROM calendar_event_attendees WHERE event_id = ${eventId} AND response = 'accepted'`);
  return new Set(rows.map((r) => num(r.character_id)));
}

async function liveResult(op: MiningOp, now: Date): Promise<OpResult> {
  const db = getDb();
  const classes = opOreClasses(op);
  const iv = opInterval({ startsAt: op.startsAt, endsAt: op.endsAt, now });
  const systemsCond = op.solarSystemIds.length ? sql`AND a.solar_system_id IN (${list(op.solarSystemIds)})` : sql``;

  const participation: MiningOpParticipation = op.participation;
  const [windowRows, overrideRows, fleet, accepted] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT a.character_id, a.window_start, a.window_end, a.solar_system_id, a.type_id, a.quantity::float8 AS quantity
      FROM mining_activity a
      LEFT JOIN eve_types t ON t.type_id = a.type_id
      LEFT JOIN eve_groups g ON g.group_id = t.group_id
      WHERE a.window_end > ${new Date(iv.start).toISOString()}::timestamptz AND a.window_start < ${new Date(iv.end).toISOString()}::timestamptz
        ${systemsCond} ${classCond(classes)}`),
    overridesOf(db, op.id),
    participation === "fleet" && op.fleetId ? fleetSpans(db, op.fleetId) : Promise.resolve(new Map<number, TimeSpan[]>()),
    participation === "calendar" && op.calendarEventId ? acceptedAttendees(db, op.calendarEventId) : Promise.resolve(new Set<number>()),
  ]);
  const windows: OpWindow[] = windowRows.map((r) => ({
    characterId: num(r.character_id),
    start: new Date(r.window_start as string),
    end: new Date(r.window_end as string),
    solarSystemId: num(r.solar_system_id),
    typeId: num(r.type_id),
    quantity: num(r.quantity),
  }));
  const overrides = new Map<number, OpOverride>([...overrideRows].map(([id, o]) => [id, { mode: o.mode, self: o.self }]));
  const attributed = attributeOp({
    startsAt: op.startsAt,
    endsAt: op.endsAt,
    now,
    solarSystemIds: op.solarSystemIds,
    participation,
    windows,
    fleetSpans: fleet,
    accepted,
    overrides,
  });

  const characterIds = attributed.map((a) => a.characterId);
  const typeIds = [...new Set(attributed.flatMap((a) => [...a.types.keys()]))];
  const priceDate = new Date(Math.min(iv.end, now.getTime())).toISOString().slice(0, 10);
  const [identity, info] = await Promise.all([identities(db, characterIds), typeInfo(db, op, typeIds, priceDate)]);

  const pilots: OpPilot[] = attributed.map((a) => {
    const id = identity.get(a.characterId);
    const ore = [...a.types].map(([typeId, quantity]) => {
      const t = info.get(typeId);
      return {
        typeId,
        name: t?.name ?? `#${typeId}`,
        oreClass: t?.oreClass ?? "other",
        quantity,
        volume: quantity * (t?.unitVolume ?? 0),
        unitPrice: t?.unitPrice ?? 0,
        value: quantity * (t?.unitPrice ?? 0),
      };
    });
    ore.sort((x, y) => y.value - x.value);
    return {
      characterId: a.characterId,
      name: id?.name ?? `#${a.characterId}`,
      userId: id?.userId ?? null,
      payeeCharacterId: id?.payeeCharacterId ?? a.characterId,
      status: a.status,
      reason: a.reason,
      overrideReason: overrideRows.get(a.characterId)?.reason ?? "",
      ore,
      volume: ore.reduce((s, o) => s + o.volume, 0),
      value: ore.reduce((s, o) => s + o.value, 0),
    };
  });

  const settings = { ratePct: op.ratePct, corpCutPct: op.corpCutPct, splitMode: op.splitMode };
  const { shares, ...payout } = computePayout(payeesOf(pilots, identity), settings);
  const counted = pilots.filter((p) => p.status === "counted");
  const [missing, unplaced] = await Promise.all([
    missingTracking(db, iv, now, counted),
    unplacedOre(db, op, iv, classes, counted.map((p) => p.characterId)),
  ]);
  return {
    frozen: false,
    pilots: sortPilots(pilots),
    payees: shares.sort((a, b) => b.share - a.share),
    payout,
    ore: aggregateOre(counted.flatMap((p) => p.ore)),
    missing,
    unplaced,
  };
}

/**
 * Counted pilots whose ledger Keystar didn't read for (part of) the op: no
 * mining token, tracking that started after the op began without finding
 * anything, or a sync gap. Their share is likely too low.
 */
async function missingTracking(
  db: Db,
  iv: { start: number; end: number },
  now: Date,
  counted: OpPilot[],
): Promise<OpMissing[]> {
  if (!counted.length) return [];
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT x.id AS character_id, c.since, c.last_observed_at
    FROM unnest(ARRAY[${list(counted.map((p) => p.characterId))}]::bigint[]) AS x(id)
    LEFT JOIN mining_activity_coverage c ON c.character_id = x.id`);
  const byId = new Map(counted.map((p) => [p.characterId, p]));
  const until = Math.min(iv.end, now.getTime());
  const out: OpMissing[] = [];
  for (const r of rows) {
    const pilot = byId.get(num(r.character_id))!;
    const since = r.since ? new Date(r.since as string).getTime() : null;
    if (since === null || (since > iv.start && !pilot.ore.length)) {
      out.push({ characterId: pilot.characterId, name: pilot.name, reason: "no_tracking" });
    } else if (since <= iv.start && new Date(r.last_observed_at as string).getTime() < until - TRACKING_GAP_MS) {
      out.push({ characterId: pilot.characterId, name: pilot.name, reason: "gap" });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Daily ledger totals on the op's days (in its systems and ore classes) minus
 * all measured activity on those days: ore that grew while Keystar wasn't
 * reading the ledger (a sync gap, a token added later). It may or may not
 * belong to the op; the organiser decides.
 */
async function unplacedOre(
  db: Db,
  op: MiningOp,
  iv: { start: number; end: number },
  classes: OreClass[],
  characterIds: number[],
): Promise<Map<number, { volume: number; value: number }>> {
  if (!characterIds.length) return new Map();
  const dates = opDates(iv.start, iv.end);
  const ledgerSystems = op.solarSystemIds.length ? sql`AND l.solar_system_id IN (${list(op.solarSystemIds)})` : sql``;
  const activitySystems = op.solarSystemIds.length ? sql`AND a.solar_system_id IN (${list(op.solarSystemIds)}, 0)` : sql``;
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH led AS (
      SELECT l.character_id, l.type_id, SUM(l.quantity)::float8 AS quantity
      FROM mining_character_ledger l
      LEFT JOIN eve_types t ON t.type_id = l.type_id
      LEFT JOIN eve_groups g ON g.group_id = t.group_id
      WHERE l.character_id IN (${list(characterIds)}) AND l.date IN (${list(dates)}) ${ledgerSystems} ${classCond(classes)}
      GROUP BY 1, 2
    ), act AS (
      SELECT a.character_id, a.type_id, SUM(a.quantity)::float8 AS quantity
      FROM mining_activity a
      WHERE a.character_id IN (${list(characterIds)}) AND a.date IN (${list(dates)}) ${activitySystems}
      GROUP BY 1, 2
    )
    SELECT led.character_id, led.type_id, (led.quantity - COALESCE(act.quantity, 0)) AS quantity
    FROM led LEFT JOIN act USING (character_id, type_id)
    WHERE led.quantity - COALESCE(act.quantity, 0) > 0`);
  if (!rows.length) return new Map();
  const info = await typeInfo(db, op, [...new Set(rows.map((r) => num(r.type_id)))], dates[dates.length - 1]);
  const out = new Map<number, { volume: number; value: number }>();
  for (const r of rows) {
    const t = info.get(num(r.type_id));
    const q = num(r.quantity);
    const cur = out.get(num(r.character_id)) ?? { volume: 0, value: 0 };
    cur.volume += q * (t?.unitVolume ?? 0);
    cur.value += q * (t?.unitPrice ?? 0);
    out.set(num(r.character_id), cur);
  }
  return out;
}

/** Freezes the live result into the share tables. Returns false when the op was already finalized. */
export async function finalizeOp(opId: string, byName: string | null, now = new Date()): Promise<boolean> {
  const db = getDb();
  const op = await getOp(opId);
  if (!op || op.finalizedAt) return false;
  const result = await liveResult(op, now);
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(miningOps)
      .set({ finalizedAt: now, finalizedByName: byName, endsAt: op.endsAt ?? now, updatedAt: now })
      .where(and(eq(miningOps.id, opId), sql`${miningOps.finalizedAt} IS NULL`))
      .returning({ id: miningOps.id });
    if (!updated.length) return false;
    if (result.payees.length) {
      await tx.insert(miningOpShares).values(
        result.payees.map((p) => ({
          opId,
          payeeCharacterId: p.payeeCharacterId,
          userId: p.userId,
          characterIds: p.characterIds,
          volume: p.volume,
          grossValue: p.value,
          shareValue: p.share,
        })),
      );
    }
    const typeRows = result.pilots
      .filter((p) => p.status === "counted")
      .flatMap((p) =>
        p.ore.map((o) => ({
          opId,
          characterId: p.characterId,
          typeId: o.typeId,
          quantity: o.quantity,
          unitVolume: o.quantity > 0 ? o.volume / o.quantity : 0,
          unitPrice: o.unitPrice,
        })),
      );
    for (let i = 0; i < typeRows.length; i += 1000) await tx.insert(miningOpShareTypes).values(typeRows.slice(i, i + 1000));
    return true;
  });
}

/** Back to a live op: the frozen shares go. */
export async function reopenOp(opId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(miningOpShares).where(eq(miningOpShares.opId, opId));
    await tx.delete(miningOpShareTypes).where(eq(miningOpShareTypes.opId, opId));
    await tx.update(miningOps).set({ finalizedAt: null, finalizedByName: null, updatedAt: new Date() }).where(eq(miningOps.id, opId));
  });
}

/** Fleets an op can be linked to: the latest tracked fleets with their boss. */
export async function getLinkableFleets(limit = 30) {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT f.fleet_id, COALESCE(e.name, '#' || f.boss_character_id) AS boss_name,
           LEAST(f.first_seen_at, (SELECT MIN(m.join_time) FROM fleet_members m WHERE m.fleet_id = f.fleet_id)) AS started_at,
           f.ended_at, (SELECT COUNT(*)::int FROM fleet_members m WHERE m.fleet_id = f.fleet_id) AS members
    FROM fleets f LEFT JOIN eve_entities e ON e.id = f.boss_character_id
    ORDER BY f.first_seen_at DESC LIMIT ${limit}`);
  return rows.map((r) => ({
    fleetId: num(r.fleet_id),
    bossName: String(r.boss_name),
    startedAt: new Date(r.started_at as string),
    endedAt: r.ended_at ? new Date(r.ended_at as string) : null,
    members: num(r.members),
  }));
}

export type LinkableFleet = Awaited<ReturnType<typeof getLinkableFleets>>[number];

/** Calendar events of the home corporation (and its alliance) around now, for "create from calendar event". */
export async function getLinkableEvents(homeCorporationId: number, now = new Date()) {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT e.event_id, e.title, e.owner_name, e.owner_type, e.event_date, e.duration_minutes,
           (SELECT COUNT(*)::int FROM calendar_event_attendees a WHERE a.event_id = e.event_id AND a.response = 'accepted') AS accepted
    FROM calendar_events e
    WHERE (e.owner_type = 'corporation' AND e.owner_id = ${homeCorporationId}
        OR e.owner_type = 'alliance' AND e.owner_id = (SELECT alliance_id FROM eve_corporations WHERE corporation_id = ${homeCorporationId}))
      AND e.event_date > ${new Date(now.getTime() - 14 * 86400_000).toISOString()}::timestamptz
    ORDER BY e.event_date ASC LIMIT 50`);
  return rows.map((r) => ({
    eventId: num(r.event_id),
    title: String(r.title),
    ownerName: String(r.owner_name),
    ownerType: String(r.owner_type) as "corporation" | "alliance",
    eventDate: new Date(r.event_date as string),
    durationMinutes: num(r.duration_minutes),
    accepted: num(r.accepted),
  }));
}

export type LinkableEvent = Awaited<ReturnType<typeof getLinkableEvents>>[number];

/** Names behind an op's ids: its systems, the linked fleet's boss and the calendar event. */
export async function opContext(db: Db, op: MiningOp): Promise<{ systems: string[]; fleetBoss: string | null; eventTitle: string | null }> {
  const [row] = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT array_agg(COALESCE(s.name, x::text) ORDER BY s.name)
         FROM unnest(${sql`ARRAY[${op.solarSystemIds.length ? list(op.solarSystemIds) : sql`NULL`}]::bigint[]`}) x
         LEFT JOIN eve_systems s ON s.system_id = x
        WHERE x IS NOT NULL) AS systems,
      (SELECT COALESCE(e.name, '#' || f.boss_character_id) FROM fleets f LEFT JOIN eve_entities e ON e.id = f.boss_character_id
        WHERE f.fleet_id = ${op.fleetId ?? 0}) AS fleet_boss,
      (SELECT title FROM calendar_events WHERE event_id = ${op.calendarEventId ?? 0}) AS event_title`);
  return {
    systems: (row?.systems as string[] | null) ?? [],
    fleetBoss: (row?.fleet_boss as string | null) ?? null,
    eventTitle: (row?.event_title as string | null) ?? null,
  };
}
