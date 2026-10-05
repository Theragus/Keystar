/**
 * Chain map against a real database (skipped without TEST_DATABASE_URL, which is truncated!).
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

const session = vi.hoisted(() => ({ user: null as null | { can: (p: string) => boolean } }));
vi.mock("@/core/auth/dal", () => ({ getCurrentUser: async () => session.user }));
vi.mock("@/i18n/server", async () => {
  const { MESSAGES } = await import("@/i18n/messages");
  return { getI18n: async () => ({ t: MESSAGES.en }) };
});

describe.skipIf(!enabled)("wormholes integration", async () => {
  const { closeDb, getDb } = await import("@/core/db");
  const { runMigrations } = await import("@/scripts/migrate");
  const maps = await import("@/modules/wormholes/maps");
  const { housekeeping } = await import("@/modules/wormholes/housekeeping");
  const { GET } = await import("@/app/api/wormholes/maps/[id]/state/route");

  const db = () => getDb();
  const HOME = 31001677; // J113551, C4
  const OTHER = 31001678; // J162656, another C4
  const HEK = 30002053;
  const JITA = 30000142;
  const actor = { id: null, name: "Tester" };
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const t0 = new Date("2026-10-03T12:00:00Z");
  const H = 3_600_000;
  let mapId = 0;

  const revision = async () => (await maps.loadMapState(db(), mapId)).revision;

  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE wh_maps, wh_map_systems, wh_connections RESTART IDENTITY CASCADE`);
    mapId = (await maps.getCorpMap(db())).id;
    await maps.setHome(db(), mapId, actor, HOME);
  });

  it("creates one corporation map and bumps the revision once per edit", async () => {
    expect((await maps.getCorpMap(db())).id).toBe(mapId);
    const before = await revision();
    await maps.addSystem(db(), mapId, actor, { systemId: OTHER, connectTo: HOME, connId: uuid(1) }, t0);
    expect(await revision()).toBe(before + 1);
    const state = await maps.loadMapState(db(), mapId);
    expect(state.home).toBe(HOME);
    expect(state.systems.map((s) => [s.name, s.x])).toEqual([
      ["J113551", 0],
      ["J162656", 360],
    ]);
    expect(state.systems[0]).toMatchObject({ cls: "c4", effect: "Red Giant", statics: [{ code: "C247", dest: "c3" }, { code: "N766", dest: "c2" }] });
    expect(state.connections).toMatchObject([{ id: uuid(1), a: HOME, b: OTHER, life: "fresh", updatedByName: "Tester" }]);
    expect(state.connections[0].expiresBy).toBe(new Date(t0.getTime() + 48 * H).toISOString());
  });

  it("answers polls cheaply while nothing changed", async () => {
    const rev = await revision();
    expect(await maps.mapStateSince(db(), mapId, rev)).toEqual({ changed: false, revision: rev });
    const changed = await maps.mapStateSince(db(), mapId, rev - 1);
    expect(changed.changed).toBe(true);
  });

  it("refuses duplicate connections, unknown systems and removing home", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(1) });
    const rev = await revision();
    await expect(maps.connect(db(), mapId, actor, uuid(2), HEK, HOME)).rejects.toMatchObject({ code: "alreadyConnected" });
    await expect(maps.connect(db(), mapId, actor, uuid(2), HEK, HEK)).rejects.toMatchObject({ code: "sameSystem" });
    await expect(maps.connect(db(), mapId, actor, uuid(2), HEK, JITA)).rejects.toMatchObject({ code: "notOnMap" });
    await expect(maps.addSystem(db(), mapId, actor, { systemId: 1, connectTo: null, connId: uuid(3) })).rejects.toMatchObject({
      code: "unknownSystem",
    });
    await expect(maps.removeSystem(db(), mapId, HOME)).rejects.toMatchObject({ code: "cannotRemoveHome" });
    // Failed edits roll back their revision bump.
    expect(await revision()).toBe(rev);
  });

  it("updates connections and recomputes their expiry", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: OTHER, connectTo: HOME, connId: uuid(1) }, t0);
    await maps.updateConnection(db(), mapId, actor, uuid(1), { type: "N766", typeOn: HOME }, new Date(t0.getTime() + H));
    await maps.updateConnection(db(), mapId, actor, uuid(1), { life: "lt4h", mass: "reduced" }, new Date(t0.getTime() + 2 * H));
    const [c] = (await maps.loadMapState(db(), mapId)).connections;
    expect(c).toMatchObject({ type: "N766", typeSide: "a", life: "lt4h", mass: "reduced" });
    expect(c.expiresBy).toBe(new Date(t0.getTime() + 6 * H).toISOString());
    await expect(maps.updateConnection(db(), mapId, actor, uuid(1), { typeOn: JITA })).rejects.toMatchObject({ code: "failed" });
    // B274 leads from C2 space to high-sec; it never spawns in a C4.
    await expect(maps.updateConnection(db(), mapId, actor, uuid(1), { type: "B274", typeOn: HOME })).rejects.toMatchObject({
      code: "invalidType",
    });
    await expect(maps.updateConnection(db(), mapId, actor, uuid(9), { life: "lt1h" })).rejects.toMatchObject({ code: "notFound" });
  });

  it("removes a system with its connections, then lets the pair connect again", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(1) });
    await maps.removeSystem(db(), mapId, HEK);
    let state = await maps.loadMapState(db(), mapId);
    expect(state.systems.map((s) => s.id)).toEqual([HOME]);
    expect(state.connections).toEqual([]);
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(2) });
    state = await maps.loadMapState(db(), mapId);
    expect(state.connections.map((c) => c.id)).toEqual([uuid(2)]);
  });

  it("refuses to remove what another editor already removed, without bumping the revision", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(1) });
    await maps.removeConnection(db(), mapId, uuid(1));
    const rev = await revision();
    await expect(maps.removeConnection(db(), mapId, uuid(1))).rejects.toMatchObject({ code: "notFound" });
    await maps.removeSystem(db(), mapId, HEK);
    const rev2 = await revision();
    expect(rev2).toBe(rev + 1);
    await expect(maps.removeSystem(db(), mapId, HEK)).rejects.toMatchObject({ code: "notOnMap" });
    expect(await revision()).toBe(rev2);
  });

  it("moves, pins, labels, arranges and clears", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(1) });
    await maps.moveSystems(db(), mapId, [{ id: HEK, x: 1001, y: 499 }]);
    await maps.setLabel(db(), mapId, HEK, "  exit  ");
    let hek = (await maps.loadMapState(db(), mapId)).systems.find((s) => s.id === HEK)!;
    expect(hek).toMatchObject({ x: 1000, y: 500, pinned: true, label: "exit" });
    await maps.autoArrange(db(), mapId, false);
    hek = (await maps.loadMapState(db(), mapId)).systems.find((s) => s.id === HEK)!;
    expect(hek).toMatchObject({ x: 1000, y: 500 });
    await maps.autoArrange(db(), mapId, true);
    hek = (await maps.loadMapState(db(), mapId)).systems.find((s) => s.id === HEK)!;
    expect(hek).toMatchObject({ x: 360, y: 0, pinned: false });
    await maps.clearMap(db(), mapId);
    const state = await maps.loadMapState(db(), mapId);
    expect(state.systems.map((s) => s.id)).toEqual([HOME]);
    expect(state.connections).toEqual([]);
  });

  it("collapses expired holes and drops systems they stranded, keeping home and pinned ones", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: OTHER, connectTo: HOME, connId: uuid(1) }, t0);
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: OTHER, connId: uuid(2) }, t0);
    await maps.addSystem(db(), mapId, actor, { systemId: JITA, connectTo: HOME, connId: uuid(3) }, t0);
    await maps.setPinned(db(), mapId, JITA, true);
    await maps.updateConnection(db(), mapId, actor, uuid(2), { life: "lt1h" }, t0);
    await maps.updateConnection(db(), mapId, actor, uuid(3), { life: "lt1h" }, t0);

    // Expired at t0+1h; still drawn (faded) during the grace hour.
    expect(await housekeeping(db(), new Date(t0.getTime() + 1.5 * H))).toEqual({ collapsed: 0, orphans: 0, purged: 0 });
    const rev = await revision();
    expect(await housekeeping(db(), new Date(t0.getTime() + 2.5 * H))).toEqual({ collapsed: 2, orphans: 0, purged: 0 });
    expect(await revision()).toBe(rev + 1);
    // An hour after the collapse, Hek (only reachable through it) goes; pinned Jita stays.
    expect(await housekeeping(db(), new Date(t0.getTime() + 4 * H))).toEqual({ collapsed: 0, orphans: 1, purged: 0 });
    const state = await maps.loadMapState(db(), mapId);
    expect(state.systems.map((s) => s.id).sort()).toEqual([JITA, HOME, OTHER].sort());
    expect(state.connections.map((c) => c.id)).toEqual([uuid(1)]);
    // Removed rows are kept for a month.
    expect(await housekeeping(db(), new Date(t0.getTime() + 31 * 24 * H))).toMatchObject({ purged: 2 });
  });

  it("keeps a system a pilot added again after its wormhole collapsed", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(1) }, t0);
    await maps.updateConnection(db(), mapId, actor, uuid(1), { life: "lt1h" }, t0);
    await housekeeping(db(), new Date(t0.getTime() + 2.5 * H)); // collapses the hole
    expect(await housekeeping(db(), new Date(t0.getTime() + 4 * H))).toMatchObject({ orphans: 1 }); // Hek stranded
    // Hours later someone maps Hek again, on its own.
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: null, connId: uuid(2) }, new Date(t0.getTime() + 5 * H));
    expect(await housekeeping(db(), new Date(t0.getTime() + 8 * H))).toMatchObject({ orphans: 0 });
    expect((await maps.loadMapState(db(), mapId)).systems.map((s) => s.id)).toContain(HEK);
  });

  it("judges a re-added system by its own connections, not older collapses", async () => {
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(1) }, t0);
    await maps.updateConnection(db(), mapId, actor, uuid(1), { life: "lt1h" }, t0);
    await housekeeping(db(), new Date(t0.getTime() + 2.5 * H));
    expect(await housekeeping(db(), new Date(t0.getTime() + 4 * H))).toMatchObject({ orphans: 1 });
    // Mapped again with a new hole, which a pilot then deletes by hand: Hek stays until someone removes it.
    await maps.addSystem(db(), mapId, actor, { systemId: HEK, connectTo: HOME, connId: uuid(2) }, new Date(t0.getTime() + 5 * H));
    await maps.removeConnection(db(), mapId, uuid(2), new Date(t0.getTime() + 6 * H));
    expect(await housekeeping(db(), new Date(t0.getTime() + 9 * H))).toMatchObject({ orphans: 0 });
    expect((await maps.loadMapState(db(), mapId)).systems.map((s) => s.id)).toContain(HEK);
  });

  it("serves the polled state to signed-in viewers only", async () => {
    const call = (since: number, id = mapId) =>
      GET(new Request(`http://localhost/api/wormholes/maps/${id}/state?since=${since}`), {
        params: Promise.resolve({ id: String(id) }),
      } as never);
    session.user = null;
    expect((await call(0)).status).toBe(401);
    session.user = { can: () => false };
    expect((await call(0)).status).toBe(403);
    session.user = { can: () => true };
    const rev = await revision();
    expect(await (await call(rev)).json()).toEqual({ changed: false, revision: rev });
    const full = await (await call(rev - 1)).json();
    expect(full).toMatchObject({ changed: true, state: { mapId, home: HOME } });
    expect((await call(0, 999)).status).toBe(404);
  });
});
