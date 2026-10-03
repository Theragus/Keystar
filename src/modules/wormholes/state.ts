import { placeNew, snap, arrange } from "./layout";
import { expiresBy, type LifeState, type MassState } from "./lifetime";
import { K162, sizeOf, type HoleSize, type SystemSummary, type WormholeType } from "./static";

/** One system on the map, with its static data joined in (the client never loads the data file). */
export interface MapSystem extends SystemSummary {
  x: number;
  y: number;
  pinned: boolean;
  label: string | null;
}

export interface MapConnection {
  id: string;
  /** System ids with a < b. */
  a: number;
  b: number;
  /** Wormhole type seen on the `typeSide` end; the other end is K162. Null: unknown. */
  type: string | null;
  typeSide: "a" | "b" | null;
  life: LifeState;
  lifeSetAt: string;
  mass: MassState;
  /** Set by hand; otherwise the size follows the type. */
  size: HoleSize | null;
  firstSeenAt: string;
  expiresBy: string;
  updatedAt: string;
  updatedByName: string | null;
}

export interface MapState {
  mapId: number;
  revision: number;
  /** Server clock when the state was read, to correct the client's clock for time-left labels. */
  serverNow: string;
  home: number | null;
  systems: MapSystem[];
  connections: MapConnection[];
}

export interface ConnectionPatch {
  type?: string | null;
  /** System id the type is seen in (the other side is K162). */
  typeOn?: number | null;
  life?: LifeState;
  mass?: MassState;
  size?: HoleSize | null;
}

/** Edits, applied optimistically in the browser and then saved by the matching server action. */
export type Op =
  | { kind: "setHome"; system: SystemSummary }
  | { kind: "addSystem"; system: SystemSummary; connectTo: number | null; connId: string }
  | { kind: "removeSystem"; id: number }
  | { kind: "move"; moves: { id: number; x: number; y: number }[] }
  | { kind: "pin"; id: number; pinned: boolean }
  | { kind: "label"; id: number; label: string | null }
  | { kind: "connect"; id: string; from: number; to: number }
  | { kind: "updateConnection"; id: string; patch: ConnectionPatch }
  | { kind: "removeConnection"; id: string }
  | { kind: "arrange"; resetAll: boolean }
  | { kind: "clear" };

export const LABEL_MAX = 40;

/** Stores a pair as a < b and says which end the type sign is on. */
export function normalise(from: number, to: number, typeOn: number | null = null) {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const typeSide: "a" | "b" | null = typeOn === a ? "a" : typeOn === b ? "b" : null;
  return { a, b, typeSide };
}

/** Lifetime of the connection's type in hours; null for unknown or K162. */
export function typeLife(type: string | null, types: Record<string, WormholeType>): number | null {
  if (!type || type === K162) return null;
  return types[type]?.life ?? null;
}

export function connectionSize(conn: Pick<MapConnection, "size" | "type">, types: Record<string, WormholeType>) {
  return conn.size ?? sizeOf(conn.type ? (types[conn.type]?.jump ?? null) : null);
}

export function newConnection(
  id: string,
  from: number,
  to: number,
  now: Date,
  by: string | null,
): MapConnection {
  const { a, b } = normalise(from, to);
  const at = now.toISOString();
  return {
    id,
    a,
    b,
    type: null,
    typeSide: null,
    life: "fresh",
    lifeSetAt: at,
    mass: "stable",
    size: null,
    firstSeenAt: at,
    expiresBy: expiresBy({ firstSeenAt: now, lifeState: "fresh", lifeSetAt: now }, null).toISOString(),
    updatedAt: at,
    updatedByName: by,
  };
}

/** Applies a patch the same way the server does (life change resets lifeSetAt; expiry recomputed). */
export function patchConnection(
  conn: MapConnection,
  patch: ConnectionPatch,
  types: Record<string, WormholeType>,
  now: Date,
  by: string | null,
): MapConnection {
  const next = { ...conn, updatedAt: now.toISOString(), updatedByName: by };
  if (patch.type !== undefined) next.type = patch.type && patch.type !== K162 ? patch.type : null;
  if (patch.typeOn !== undefined) next.typeSide = normalise(conn.a, conn.b, patch.typeOn).typeSide;
  if (!next.type) next.typeSide = null;
  else if (!next.typeSide) next.typeSide = "a";
  if (patch.life !== undefined && patch.life !== conn.life) {
    next.life = patch.life;
    next.lifeSetAt = now.toISOString();
  }
  if (patch.mass !== undefined) next.mass = patch.mass;
  if (patch.size !== undefined) next.size = patch.size;
  next.expiresBy = expiresBy(
    { firstSeenAt: new Date(next.firstSeenAt), lifeState: next.life, lifeSetAt: new Date(next.lifeSetAt) },
    typeLife(next.type, types),
  ).toISOString();
  return next;
}

const toLayout = (s: MapSystem) => ({ id: s.id, name: s.name, cls: s.cls, x: s.x, y: s.y, pinned: s.pinned });

/** Optimistic reducer: the client's view while an edit is on its way to the server. */
export function applyOp(
  state: MapState,
  op: Op,
  types: Record<string, WormholeType>,
  now: Date,
  by: string | null = null,
): MapState {
  const systems = state.systems;
  const has = (id: number) => systems.some((s) => s.id === id);
  const connected = (x: number, y: number) => {
    const { a, b } = normalise(x, y);
    return state.connections.some((c) => c.a === a && c.b === b);
  };
  switch (op.kind) {
    case "setHome": {
      const next = has(op.system.id)
        ? systems
        : [...systems, { ...op.system, x: 0, y: 0, pinned: false, label: null }];
      return { ...state, home: op.system.id, systems: next };
    }
    case "addSystem": {
      let next = systems;
      if (!has(op.system.id)) {
        const parent = op.connectTo !== null ? systems.find((s) => s.id === op.connectTo) : undefined;
        const at = placeNew(systems, parent ?? null);
        next = [...systems, { ...op.system, ...at, pinned: false, label: null }];
      }
      const connections =
        op.connectTo !== null && op.connectTo !== op.system.id && has(op.connectTo) && !connected(op.system.id, op.connectTo)
          ? [...state.connections, newConnection(op.connId, op.connectTo, op.system.id, now, by)]
          : state.connections;
      return { ...state, systems: next, connections };
    }
    case "removeSystem":
      if (op.id === state.home) return state;
      return {
        ...state,
        systems: systems.filter((s) => s.id !== op.id),
        connections: state.connections.filter((c) => c.a !== op.id && c.b !== op.id),
      };
    case "move": {
      const moves = new Map(op.moves.map((m) => [m.id, m]));
      return {
        ...state,
        systems: systems.map((s) => {
          const m = moves.get(s.id);
          return m ? { ...s, x: snap(m.x), y: snap(m.y), pinned: true } : s;
        }),
      };
    }
    case "pin":
      return { ...state, systems: systems.map((s) => (s.id === op.id ? { ...s, pinned: op.pinned } : s)) };
    case "label": {
      const label = op.label?.trim().slice(0, LABEL_MAX) || null;
      return { ...state, systems: systems.map((s) => (s.id === op.id ? { ...s, label } : s)) };
    }
    case "connect":
      if (op.from === op.to || !has(op.from) || !has(op.to) || connected(op.from, op.to)) return state;
      return { ...state, connections: [...state.connections, newConnection(op.id, op.from, op.to, now, by)] };
    case "updateConnection":
      return {
        ...state,
        connections: state.connections.map((c) => (c.id === op.id ? patchConnection(c, op.patch, types, now, by) : c)),
      };
    case "removeConnection":
      return { ...state, connections: state.connections.filter((c) => c.id !== op.id) };
    case "clear":
      return {
        ...state,
        systems: systems.filter((s) => s.id === state.home).map((s) => ({ ...s, x: 0, y: 0 })),
        connections: [],
      };
    case "arrange": {
      const positions = arrange(systems.map(toLayout), state.connections, state.home, { resetAll: op.resetAll });
      return {
        ...state,
        systems: systems.map((s) => {
          const p = positions.get(s.id);
          return p ? { ...s, ...p, pinned: op.resetAll ? false : s.pinned } : s;
        }),
      };
    }
  }
}
