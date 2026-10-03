import { hierarchy, tree } from "d3-hierarchy";
import { CLASS_ORDER, type ClassKey } from "./static";

/**
 * Chain layout. A chain is almost always a tree rooted at home, so it is drawn
 * as one: left to right, one column per jump from home, siblings ordered by
 * class then name. The same chain always gives the same picture. The column
 * gap leaves room for the connection label, so labels never sit under a node.
 */
export const NODE_W = 180;
export const NODE_H = 60;
/** Column pitch: node width plus a gap wide enough for an edge label. */
export const COL = 340;
/** Row pitch. */
export const ROW = 80;
export const GRID = 20;

export interface LayoutSystem {
  id: number;
  name: string;
  cls: ClassKey;
  x: number;
  y: number;
  pinned: boolean;
}
export interface LayoutConnection {
  a: number;
  b: number;
}
export interface Point {
  x: number;
  y: number;
}

export const snap = (v: number) => Math.round(v / GRID) * GRID;

const bySystem = (a: LayoutSystem, b: LayoutSystem) =>
  CLASS_ORDER[a.cls] - CLASS_ORDER[b.cls] || a.name.localeCompare(b.name) || a.id - b.id;

export interface SpanningTree {
  /** Tree roots: home first, then one per part of the map not connected to home. */
  roots: number[];
  children: Map<number, number[]>;
  parent: Map<number, number>;
  /** Connections that close a loop (drawn, but not part of the tree). */
  loops: LayoutConnection[];
}

/** Breadth-first tree from home; unreachable parts get their own root (alphabetically first system). */
export function spanningTree(
  systems: readonly LayoutSystem[],
  connections: readonly LayoutConnection[],
  homeId: number | null,
): SpanningTree {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const adjacent = new Map<number, LayoutSystem[]>();
  for (const c of connections) {
    const a = byId.get(c.a);
    const b = byId.get(c.b);
    if (!a || !b) continue;
    adjacent.set(a.id, [...(adjacent.get(a.id) ?? []), b]);
    adjacent.set(b.id, [...(adjacent.get(b.id) ?? []), a]);
  }
  const children = new Map<number, number[]>();
  const parent = new Map<number, number>();
  const seen = new Set<number>();
  const roots: number[] = [];

  const grow = (root: LayoutSystem) => {
    roots.push(root.id);
    seen.add(root.id);
    const queue = [root];
    while (queue.length) {
      const node = queue.shift()!;
      const next = (adjacent.get(node.id) ?? []).filter((s) => !seen.has(s.id)).sort(bySystem);
      for (const child of next) {
        seen.add(child.id);
        parent.set(child.id, node.id);
        children.set(node.id, [...(children.get(node.id) ?? []), child.id]);
        queue.push(child);
      }
    }
  };

  const home = homeId !== null ? byId.get(homeId) : undefined;
  if (home) grow(home);
  for (const s of [...systems].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)) {
    if (!seen.has(s.id)) grow(s);
  }

  const loops = connections.filter(
    (c) => byId.has(c.a) && byId.has(c.b) && parent.get(c.b) !== c.a && parent.get(c.a) !== c.b,
  );
  return { roots, children, parent, loops };
}

const overlaps = (p: Point, q: Point) => Math.abs(p.x - q.x) < NODE_W + GRID * 2 && Math.abs(p.y - q.y) < ROW;

/** Nearest free row in a column, scanning outwards from `y`. */
function freeSlot(x: number, y: number, taken: readonly Point[]): Point {
  for (let i = 0; i < 500; i++) {
    const step = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    const candidate = { x, y: snap(y + step * ROW) };
    if (!taken.some((t) => overlaps(t, candidate))) return candidate;
  }
  return { x, y: snap(y) };
}

/**
 * Where a new system goes: the column right of `parent`, in the nearest free
 * row; without a parent, below everything in the first column. Nothing else moves.
 */
export function placeNew(existing: readonly Point[], parent: Point | null): Point {
  if (parent) return freeSlot(snap(parent.x + COL), parent.y, existing);
  if (!existing.length) return { x: 0, y: 0 };
  const bottom = Math.max(...existing.map((p) => p.y));
  return freeSlot(0, bottom + ROW, existing);
}

/**
 * Full layout. Pinned systems keep their position unless `resetAll`; anything
 * that would land on a pinned system takes the nearest free row in its column.
 */
export function arrange(
  systems: readonly LayoutSystem[],
  connections: readonly LayoutConnection[],
  homeId: number | null,
  opts: { resetAll?: boolean } = {},
): Map<number, Point> {
  const span = spanningTree(systems, connections, homeId);
  const byId = new Map(systems.map((s) => [s.id, s]));
  const keep = (s: LayoutSystem) => s.pinned && !opts.resetAll;
  const positions = new Map<number, Point>();
  const fixed: Point[] = systems.filter(keep).map((s) => ({ x: s.x, y: s.y }));
  for (const s of systems) if (keep(s)) positions.set(s.id, { x: s.x, y: s.y });

  type Node = { id: number; children: Node[] };
  const build = (id: number): Node => ({ id, children: (span.children.get(id) ?? []).map(build) });
  const layoutTree = tree<Node>()
    .nodeSize([ROW, COL])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.5));

  let bottom: number | null = null;
  const placed: Point[] = [...fixed];
  for (const rootId of span.roots) {
    const root = layoutTree(hierarchy(build(rootId)));
    const nodes = root.descendants();
    const minY = Math.min(...nodes.map((n) => n.x));
    const maxY = Math.max(...nodes.map((n) => n.x));
    // Home's tree is centred on y = 0; every further part goes below what is already there.
    const offset = bottom === null ? 0 : bottom + ROW * 1.5 - minY;
    for (const n of nodes) {
      const s = byId.get(n.data.id)!;
      if (keep(s)) continue;
      const wanted = { x: snap(n.y), y: snap(n.x + offset) };
      const p = placed.some((q) => overlaps(q, wanted)) ? freeSlot(wanted.x, wanted.y, placed) : wanted;
      positions.set(s.id, p);
      placed.push(p);
    }
    const treeBottom = Math.max(maxY + offset, ...placed.map((p) => p.y));
    bottom = bottom === null ? treeBottom : Math.max(bottom, treeBottom);
  }
  return positions;
}
