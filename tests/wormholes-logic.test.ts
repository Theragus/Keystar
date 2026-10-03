import { describe, expect, it } from "vitest";
import { COL, NODE_W, ROW, arrange, placeNew, spanningTree, type LayoutSystem } from "@/modules/wormholes/layout";
import { displayBand, expiresBy, isCollapsed, timeLeft } from "@/modules/wormholes/lifetime";
import { applyOp, connectionSize, normalise, patchConnection, type MapState } from "@/modules/wormholes/state";
import type { StaticFile, SystemSummary } from "@/modules/wormholes/static";
import fixture from "./fixtures/wh-static.json";

const types = (fixture as unknown as StaticFile).types;
const H = 3_600_000;
const t0 = new Date("2026-10-03T12:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * H);

describe("wormhole lifetime", () => {
  it("bounds the remaining life by the type's lifetime from when it was first seen", () => {
    expect(expiresBy({ firstSeenAt: t0, lifeState: "fresh", lifeSetAt: t0 }, 16)).toEqual(at(16));
  });

  it("bounds it by the band from when someone last checked", () => {
    expect(expiresBy({ firstSeenAt: t0, lifeState: "lt4h", lifeSetAt: at(2) }, 24)).toEqual(at(6));
    // The type's bound wins when it is sooner.
    expect(expiresBy({ firstSeenAt: t0, lifeState: "lt1d", lifeSetAt: at(1) }, 16)).toEqual(at(16));
  });

  it("assumes the longest lifetime for an unknown type or K162", () => {
    expect(expiresBy({ firstSeenAt: t0, lifeState: "fresh", lifeSetAt: t0 }, null)).toEqual(at(48));
    expect(expiresBy({ firstSeenAt: t0, lifeState: "lt1d", lifeSetAt: at(3) }, null)).toEqual(at(27));
  });

  it("treats a closing hole as gone when it was marked", () => {
    const e = expiresBy({ firstSeenAt: t0, lifeState: "closing", lifeSetAt: at(5) }, 24);
    expect(e).toEqual(at(5));
    expect(isCollapsed(e, at(5))).toBe(true);
    expect(timeLeft(e, at(6))).toBe(0);
  });

  it("moves the drawn band along as time passes, never back", () => {
    const e = at(24);
    expect(displayBand("lt1d", e, t0)).toBe("lt1d");
    expect(displayBand("lt1d", e, at(21))).toBe("lt4h");
    expect(displayBand("lt1d", e, at(23.5))).toBe("lt1h");
    expect(displayBand("lt1d", e, at(25))).toBe("closing");
    expect(displayBand("lt4h", at(40), t0)).toBe("lt4h");
  });
});

const sys = (id: number, name: string, cls: LayoutSystem["cls"], extra: Partial<LayoutSystem> = {}): LayoutSystem => ({
  id,
  name,
  cls,
  x: 0,
  y: 0,
  pinned: false,
  ...extra,
});

const HOME = sys(1, "J113551", "c4");
const chain = [
  HOME,
  sys(2, "J160941", "c2"),
  sys(3, "J153546", "c3"),
  sys(4, "Hek", "hs"),
  sys(5, "J105443", "c1"),
  sys(6, "1DQ1-A", "ns"),
];
const links = [
  { a: 1, b: 2 },
  { a: 1, b: 3 },
  { a: 2, b: 4 },
  { a: 2, b: 5 },
  { a: 3, b: 6 },
];

describe("chain layout", () => {
  it("builds a tree from home with siblings by class, then name", () => {
    const span = spanningTree(chain, links, 1);
    expect(span.roots).toEqual([1]);
    expect(span.children.get(1)).toEqual([2, 3]);
    expect(span.children.get(2)).toEqual([5, 4]); // C1 before high-sec
    expect(span.loops).toEqual([]);
  });

  it("keeps loops as extra edges and roots unreachable parts separately", () => {
    const span = spanningTree([...chain, sys(7, "Amarr", "hs"), sys(8, "Ashab", "hs")], [...links, { a: 4, b: 6 }, { a: 7, b: 8 }], 1);
    expect(span.loops).toEqual([{ a: 4, b: 6 }]);
    expect(span.roots).toEqual([1, 7]);
    expect(span.parent.get(8)).toBe(7);
  });

  it("lays out columns by depth, deterministically and without overlaps", () => {
    const first = arrange(chain, links, 1);
    const shuffled = arrange([...chain].reverse(), [...links].reverse(), 1);
    expect([...shuffled.entries()].sort()).toEqual([...first.entries()].sort());
    expect(first.get(1)).toEqual({ x: 0, y: 0 });
    expect(first.get(2)!.x).toBe(COL);
    expect(first.get(6)!.x).toBe(2 * COL);
    expect(first.get(2)!.y).toBeLessThan(first.get(3)!.y);
    const points = [...first.values()];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const far = Math.abs(points[i].x - points[j].x) >= NODE_W || Math.abs(points[i].y - points[j].y) >= ROW;
        expect(far).toBe(true);
      }
    }
  });

  it("leaves pinned systems alone unless asked to reset", () => {
    const pinned = chain.map((s) => (s.id === 4 ? { ...s, x: 1200, y: -400, pinned: true } : s));
    expect(arrange(pinned, links, 1).get(4)).toEqual({ x: 1200, y: -400 });
    expect(arrange(pinned, links, 1, { resetAll: true }).get(4)).not.toEqual({ x: 1200, y: -400 });
  });

  it("places new systems next to their parent without moving anything", () => {
    const placed = arrange(chain, links, 1);
    const existing = [...placed.values()];
    const parent = placed.get(1)!;
    const p = placeNew(existing, parent);
    expect(p.x).toBe(COL);
    expect(existing.some((q) => q.x === p.x && Math.abs(q.y - p.y) < ROW)).toBe(false);
    expect(placeNew([], null)).toEqual({ x: 0, y: 0 });
    expect(placeNew(existing, null).x).toBe(0);
  });
});

const summary = (id: number, name: string, cls: SystemSummary["cls"]): SystemSummary => ({
  id,
  name,
  cls,
  sec: cls === "hs" ? 0.8 : null,
  region: "",
  effect: null,
  statics: [],
});

const empty: MapState = { mapId: 1, revision: 0, serverNow: t0.toISOString(), home: null, systems: [], connections: [] };

describe("map state", () => {
  it("stores pairs low id first and keeps track of the typed side", () => {
    expect(normalise(9, 3, 9)).toEqual({ a: 3, b: 9, typeSide: "b" });
    expect(normalise(3, 9, 3)).toEqual({ a: 3, b: 9, typeSide: "a" });
    expect(normalise(3, 9)).toEqual({ a: 3, b: 9, typeSide: null });
  });

  it("adds, connects and removes systems", () => {
    let s = applyOp(empty, { kind: "setHome", system: summary(31001677, "J113551", "c4") }, types, t0);
    expect(s.home).toBe(31001677);
    s = applyOp(s, { kind: "addSystem", system: summary(30002053, "Hek", "hs"), connectTo: 31001677, connId: "c1" }, types, t0);
    expect(s.systems.map((x) => x.name)).toEqual(["J113551", "Hek"]);
    expect(s.systems[1].x).toBe(COL);
    expect(s.connections).toMatchObject([{ id: "c1", a: 30002053, b: 31001677, life: "fresh", type: null }]);
    // Connecting the same pair twice, or a system to itself, changes nothing.
    expect(applyOp(s, { kind: "connect", id: "c2", from: 31001677, to: 30002053 }, types, t0)).toBe(s);
    expect(applyOp(s, { kind: "connect", id: "c2", from: 30002053, to: 30002053 }, types, t0)).toBe(s);
    // Home stays; another system takes its connections with it.
    expect(applyOp(s, { kind: "removeSystem", id: 31001677 }, types, t0)).toBe(s);
    const removed = applyOp(s, { kind: "removeSystem", id: 30002053 }, types, t0);
    expect(removed.systems).toHaveLength(1);
    expect(removed.connections).toHaveLength(0);
  });

  it("recomputes the expiry when a connection changes", () => {
    let s = applyOp(empty, { kind: "setHome", system: summary(31001677, "J113551", "c4") }, types, t0);
    s = applyOp(s, { kind: "addSystem", system: summary(31001678, "J113552", "c3"), connectTo: 31001677, connId: "c1" }, types, t0);
    const c = s.connections[0];
    expect(c.expiresBy).toBe(at(48).toISOString());
    const typed = patchConnection(c, { type: "C247", typeOn: 31001677 }, types, at(1), "Pilot");
    expect(typed).toMatchObject({ type: "C247", typeSide: "a", updatedByName: "Pilot" }); // home has the lower id
    expect(typed.expiresBy).toBe(at(16).toISOString());
    const eol = patchConnection(typed, { life: "lt4h", mass: "critical" }, types, at(2), null);
    expect(eol).toMatchObject({ life: "lt4h", mass: "critical", lifeSetAt: at(2).toISOString() });
    expect(eol.expiresBy).toBe(at(6).toISOString());
    // Setting the same band again does not restart its clock.
    expect(patchConnection(eol, { life: "lt4h" }, types, at(3), null).lifeSetAt).toBe(at(2).toISOString());
    expect(connectionSize(eol, types)).toBe("L");
    expect(connectionSize({ ...eol, size: "S" }, types)).toBe("S");
    expect(patchConnection(eol, { type: "K162" }, types, at(3), null)).toMatchObject({ type: null, typeSide: null });
  });

  it("moves and pins systems on the grid", () => {
    let s = applyOp(empty, { kind: "setHome", system: summary(1, "Home", "c4") }, types, t0);
    s = applyOp(s, { kind: "move", moves: [{ id: 1, x: 133, y: -71 }] }, types, t0);
    expect(s.systems[0]).toMatchObject({ x: 140, y: -80, pinned: true });
    s = applyOp(s, { kind: "arrange", resetAll: true }, types, t0);
    expect(s.systems[0]).toMatchObject({ x: 0, y: 0, pinned: false });
    s = applyOp(s, { kind: "label", id: 1, label: "  farm  " }, types, t0);
    expect(s.systems[0].label).toBe("farm");
  });

  it("clears everything but home", () => {
    let s = applyOp(empty, { kind: "setHome", system: summary(1, "Home", "c4") }, types, t0);
    s = applyOp(s, { kind: "addSystem", system: summary(2, "Next", "c2"), connectTo: 1, connId: "c1" }, types, t0);
    s = applyOp(s, { kind: "move", moves: [{ id: 1, x: 200, y: 200 }] }, types, t0);
    s = applyOp(s, { kind: "clear" }, types, t0);
    expect(s.systems.map((x) => [x.id, x.x, x.y])).toEqual([[1, 0, 0]]);
    expect(s.connections).toEqual([]);
  });
});
