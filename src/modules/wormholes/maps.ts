import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { whConnections, whMaps, whMapSystems, type Db } from "@/core/db";
import type { Messages } from "@/i18n/messages";
import { arrange, placeNew, snap } from "./layout";
import { expiresBy } from "./lifetime";
import { K162, summarise } from "./static";
import { WH } from "./static-data";
import {
  LABEL_MAX,
  normalise,
  patchConnection,
  type ConnectionPatch,
  type MapConnection,
  type MapState,
  type MapSystem,
} from "./state";

/**
 * Reads and edits of chain maps. No Next.js imports: server actions, the
 * demo seed and tests all call these. Every edit runs in a transaction that
 * first bumps the map's revision, which also locks the map row, so edits to
 * one map run one after another.
 */

export const CORP_MAP_KEY = "corp";

export interface Actor {
  id: string | null;
  name: string | null;
}

export type MapErrorCode = keyof Messages["wormholes"]["errors"];

export class MapError extends Error {
  constructor(readonly code: MapErrorCode) {
    super(code);
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function getCorpMap(db: Db) {
  await db.insert(whMaps).values({ key: CORP_MAP_KEY, name: "Corporation chain" }).onConflictDoNothing();
  const [map] = await db.select().from(whMaps).where(eq(whMaps.key, CORP_MAP_KEY));
  return map;
}

type ConnectionRow = typeof whConnections.$inferSelect;

function toConnection(row: ConnectionRow): MapConnection {
  return {
    id: row.id,
    a: row.aSystemId,
    b: row.bSystemId,
    type: row.typeCode,
    typeSide: row.typeSide,
    life: row.lifeState,
    lifeSetAt: row.lifeSetAt.toISOString(),
    mass: row.massState,
    size: row.sizeOverride,
    firstSeenAt: row.firstSeenAt.toISOString(),
    expiresBy: row.expiresBy.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName,
  };
}

export async function loadMapState(db: Db | Tx, mapId: number, now = new Date()): Promise<MapState> {
  const [map] = await db.select().from(whMaps).where(eq(whMaps.id, mapId));
  if (!map) throw new MapError("notFound");
  const [systemRows, connectionRows] = await Promise.all([
    db.select().from(whMapSystems).where(eq(whMapSystems.mapId, mapId)),
    db
      .select()
      .from(whConnections)
      .where(and(eq(whConnections.mapId, mapId), isNull(whConnections.removedAt))),
  ]);
  const systems: MapSystem[] = [];
  for (const row of systemRows) {
    const info = WH.system(row.systemId);
    if (!info) continue;
    systems.push({ ...summarise(info, WH.types), x: row.x, y: row.y, pinned: row.pinned, label: row.label });
  }
  systems.sort((a, b) => a.id - b.id);
  const known = new Set(systems.map((s) => s.id));
  return {
    mapId,
    revision: map.revision,
    serverNow: now.toISOString(),
    home: map.homeSystemId,
    systems,
    connections: connectionRows
      .filter((c) => known.has(c.aSystemId) && known.has(c.bSystemId))
      .map(toConnection)
      .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id.localeCompare(b.id)),
  };
}

/** What the map page polls: a single small query while nothing changed. */
export async function mapStateSince(db: Db, mapId: number, since: number) {
  const [map] = await db.select({ revision: whMaps.revision }).from(whMaps).where(eq(whMaps.id, mapId));
  if (!map) throw new MapError("notFound");
  if (map.revision === since) return { changed: false as const, revision: map.revision };
  return { changed: true as const, state: await loadMapState(db, mapId) };
}

async function mutate<T>(db: Db, mapId: number, fn: (tx: Tx, map: typeof whMaps.$inferSelect) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const [map] = await tx
        .update(whMaps)
        .set({ revision: sql`${whMaps.revision} + 1`, updatedAt: new Date() })
        .where(eq(whMaps.id, mapId))
        .returning();
      if (!map) throw new MapError("notFound");
      return fn(tx, map);
    });
  } catch (err) {
    // The partial unique index on active pairs: someone connected the same systems a moment earlier.
    if ((err as { code?: string }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new MapError("alreadyConnected");
    }
    throw err;
  }
}

function requireSystem(systemId: number) {
  const info = WH.system(systemId);
  if (!info) throw new MapError("unknownSystem");
  return info;
}

async function positions(tx: Tx, mapId: number) {
  return tx.select().from(whMapSystems).where(eq(whMapSystems.mapId, mapId));
}

async function activeConnections(tx: Tx, mapId: number) {
  return tx
    .select()
    .from(whConnections)
    .where(and(eq(whConnections.mapId, mapId), isNull(whConnections.removedAt)));
}

async function insertConnection(tx: Tx, mapId: number, actor: Actor, id: string, from: number, to: number, now: Date) {
  if (from === to) throw new MapError("sameSystem");
  const { a, b } = normalise(from, to);
  const existing = await tx
    .select({ id: whConnections.id })
    .from(whConnections)
    .where(
      and(
        eq(whConnections.mapId, mapId),
        eq(whConnections.aSystemId, a),
        eq(whConnections.bSystemId, b),
        isNull(whConnections.removedAt),
      ),
    );
  if (existing.length) throw new MapError("alreadyConnected");
  await tx.insert(whConnections).values({
    id,
    mapId,
    aSystemId: a,
    bSystemId: b,
    lifeState: "fresh",
    lifeSetAt: now,
    massState: "stable",
    firstSeenAt: now,
    expiresBy: expiresBy({ firstSeenAt: now, lifeState: "fresh", lifeSetAt: now }, null),
    createdBy: actor.id,
    updatedBy: actor.id,
    updatedByName: actor.name,
    updatedAt: now,
  });
}

export async function setHome(db: Db, mapId: number, actor: Actor, systemId: number) {
  requireSystem(systemId);
  await mutate(db, mapId, async (tx) => {
    const onMap = (await positions(tx, mapId)).some((s) => s.systemId === systemId);
    if (!onMap) await tx.insert(whMapSystems).values({ mapId, systemId, x: 0, y: 0, addedBy: actor.id });
    await tx.update(whMaps).set({ homeSystemId: systemId }).where(eq(whMaps.id, mapId));
  });
}

/** Adds a system (placed next to `connectTo`) and, when given, connects the two. */
export async function addSystem(
  db: Db,
  mapId: number,
  actor: Actor,
  input: { systemId: number; connectTo: number | null; connId: string },
  now = new Date(),
) {
  requireSystem(input.systemId);
  await mutate(db, mapId, async (tx, map) => {
    if (map.homeSystemId === null) throw new MapError("homeRequired");
    const rows = await positions(tx, mapId);
    const parent = input.connectTo !== null ? rows.find((r) => r.systemId === input.connectTo) : undefined;
    if (input.connectTo !== null && !parent) throw new MapError("notOnMap");
    if (!rows.some((r) => r.systemId === input.systemId)) {
      const at = placeNew(rows, parent ?? null);
      await tx.insert(whMapSystems).values({ mapId, systemId: input.systemId, ...at, addedBy: actor.id, addedAt: now });
    }
    if (input.connectTo !== null && input.connectTo !== input.systemId) {
      await insertConnection(tx, mapId, actor, input.connId, input.connectTo, input.systemId, now);
    }
  });
}

export async function removeSystem(db: Db, mapId: number, systemId: number, now = new Date()) {
  await mutate(db, mapId, async (tx, map) => {
    if (map.homeSystemId === systemId) throw new MapError("cannotRemoveHome");
    await tx
      .update(whConnections)
      .set({ removedAt: now, removedReason: "deleted" })
      .where(
        and(
          eq(whConnections.mapId, mapId),
          isNull(whConnections.removedAt),
          or(eq(whConnections.aSystemId, systemId), eq(whConnections.bSystemId, systemId)),
        ),
      );
    await tx.delete(whMapSystems).where(and(eq(whMapSystems.mapId, mapId), eq(whMapSystems.systemId, systemId)));
  });
}

/** Positions after a drag; dragged systems are pinned so auto-arrange leaves them alone. */
export async function moveSystems(db: Db, mapId: number, moves: { id: number; x: number; y: number }[]) {
  await mutate(db, mapId, async (tx) => {
    for (const m of moves) {
      await tx
        .update(whMapSystems)
        .set({ x: snap(m.x), y: snap(m.y), pinned: true })
        .where(and(eq(whMapSystems.mapId, mapId), eq(whMapSystems.systemId, m.id)));
    }
  });
}

export async function setPinned(db: Db, mapId: number, systemId: number, pinned: boolean) {
  await mutate(db, mapId, async (tx) => {
    await tx
      .update(whMapSystems)
      .set({ pinned })
      .where(and(eq(whMapSystems.mapId, mapId), eq(whMapSystems.systemId, systemId)));
  });
}

export async function setLabel(db: Db, mapId: number, systemId: number, label: string | null) {
  await mutate(db, mapId, async (tx) => {
    await tx
      .update(whMapSystems)
      .set({ label: label?.trim().slice(0, LABEL_MAX) || null })
      .where(and(eq(whMapSystems.mapId, mapId), eq(whMapSystems.systemId, systemId)));
  });
}

export async function connect(db: Db, mapId: number, actor: Actor, id: string, from: number, to: number, now = new Date()) {
  await mutate(db, mapId, async (tx) => {
    const rows = await positions(tx, mapId);
    if (!rows.some((r) => r.systemId === from) || !rows.some((r) => r.systemId === to)) throw new MapError("notOnMap");
    await insertConnection(tx, mapId, actor, id, from, to, now);
  });
}

export async function updateConnection(
  db: Db,
  mapId: number,
  actor: Actor,
  id: string,
  patch: ConnectionPatch,
  now = new Date(),
) {
  if (patch.type && patch.type !== K162 && !WH.types[patch.type]) throw new MapError("failed");
  await mutate(db, mapId, async (tx) => {
    const [row] = await tx
      .select()
      .from(whConnections)
      .where(and(eq(whConnections.id, id), eq(whConnections.mapId, mapId), isNull(whConnections.removedAt)));
    if (!row) throw new MapError("notFound");
    if (patch.typeOn != null && patch.typeOn !== row.aSystemId && patch.typeOn !== row.bSystemId) {
      throw new MapError("failed");
    }
    const next = patchConnection(toConnection(row), patch, WH.types, now, actor.name);
    // Actions can be called directly, so check here what the type picker offers: types that spawn in that system.
    if (next.type) {
      const side = WH.system(next.typeSide === "b" ? row.bSystemId : row.aSystemId);
      if (!side || !WH.typesFor(side.cls, side.statics).some((t) => t.code === next.type)) {
        throw new MapError("invalidType");
      }
    }
    await tx
      .update(whConnections)
      .set({
        typeCode: next.type,
        typeSide: next.typeSide,
        lifeState: next.life,
        lifeSetAt: new Date(next.lifeSetAt),
        massState: next.mass,
        sizeOverride: next.size,
        expiresBy: new Date(next.expiresBy),
        updatedBy: actor.id,
        updatedByName: actor.name,
        updatedAt: now,
      })
      .where(eq(whConnections.id, id));
  });
}

export async function removeConnection(db: Db, mapId: number, id: string, now = new Date()) {
  await mutate(db, mapId, async (tx) => {
    await tx
      .update(whConnections)
      .set({ removedAt: now, removedReason: "deleted" })
      .where(and(eq(whConnections.id, id), eq(whConnections.mapId, mapId), isNull(whConnections.removedAt)));
  });
}

export async function autoArrange(db: Db, mapId: number, resetAll: boolean) {
  await mutate(db, mapId, async (tx, map) => {
    const rows = await positions(tx, mapId);
    const conns = await activeConnections(tx, mapId);
    const layout = rows.flatMap((r) => {
      const info = WH.system(r.systemId);
      return info ? [{ id: r.systemId, name: info.name, cls: info.cls, x: r.x, y: r.y, pinned: r.pinned }] : [];
    });
    const placed = arrange(
      layout,
      conns.map((c) => ({ a: c.aSystemId, b: c.bSystemId })),
      map.homeSystemId,
      { resetAll },
    );
    for (const [systemId, p] of placed) {
      await tx
        .update(whMapSystems)
        .set({ x: p.x, y: p.y, ...(resetAll ? { pinned: false } : {}) })
        .where(and(eq(whMapSystems.mapId, mapId), eq(whMapSystems.systemId, systemId)));
    }
  });
}

/** Removes every connection and every system but home. */
export async function clearMap(db: Db, mapId: number, now = new Date()) {
  await mutate(db, mapId, async (tx, map) => {
    await tx
      .update(whConnections)
      .set({ removedAt: now, removedReason: "deleted" })
      .where(and(eq(whConnections.mapId, mapId), isNull(whConnections.removedAt)));
    await tx
      .delete(whMapSystems)
      .where(
        map.homeSystemId === null
          ? eq(whMapSystems.mapId, mapId)
          : and(eq(whMapSystems.mapId, mapId), ne(whMapSystems.systemId, map.homeSystemId)),
      );
    if (map.homeSystemId !== null) {
      await tx
        .update(whMapSystems)
        .set({ x: 0, y: 0 })
        .where(and(eq(whMapSystems.mapId, mapId), eq(whMapSystems.systemId, map.homeSystemId)));
    }
  });
}
