import type { FleetWing } from "./schema";

/** Read access to the fleet a character is in; members and wings only for the fleet boss. */
export const FLEET_SCOPE = "esi-fleets.read_fleet.v1";
export const FLEET_JOB_KEY = "fleet.live";

/** GET /characters/{character_id}/fleet */
export interface EsiCharacterFleet {
  fleet_id: number;
  fleet_boss_id: number;
  role: FleetRole;
  wing_id: number;
  squad_id: number;
}

/** GET /fleets/{fleet_id} */
export interface EsiFleet {
  is_free_move: boolean;
  is_registered: boolean;
  is_voice_enabled: boolean;
  motd: string;
}

/** GET /fleets/{fleet_id}/members */
export interface EsiFleetMember {
  character_id: number;
  join_time: string;
  role: FleetRole;
  role_name: string;
  ship_type_id: number;
  solar_system_id: number;
  station_id?: number;
  squad_id: number;
  wing_id: number;
  takes_fleet_warp: boolean;
}

/** GET /fleets/{fleet_id}/wings */
export interface EsiFleetWing {
  id: number;
  name: string;
  squads: { id: number; name: string }[];
}

export type FleetRole = "fleet_commander" | "wing_commander" | "squad_commander" | "squad_member";

export const FLEET_ROLES: FleetRole[] = ["fleet_commander", "wing_commander", "squad_commander", "squad_member"];

export function isFleetRole(value: string): value is FleetRole {
  return (FLEET_ROLES as string[]).includes(value);
}

export function toWings(wings: EsiFleetWing[]): FleetWing[] {
  return wings.map((w) => ({ id: w.id, name: w.name, squads: w.squads.map((s) => ({ id: s.id, name: s.name })) }));
}

export interface LayoutMember {
  characterId: number;
  role: string;
  wingId: number;
  squadId: number;
}

export interface SquadLayout<M> {
  id: number;
  name: string;
  members: M[];
}

export interface WingLayout<M> {
  id: number;
  name: string;
  commanders: M[];
  squads: SquadLayout<M>[];
}

export interface FleetLayout<M> {
  /** The fleet commander slot (wing and squad -1). */
  command: M[];
  wings: WingLayout<M>[];
}

/**
 * Arranges members the way the in-game fleet window does: fleet command,
 * then each wing with its commander and squads. Empty squads are dropped;
 * members of wings or squads missing from `wings` get a placeholder entry
 * named by id, so nobody disappears when the two ESI calls disagree.
 */
export function layoutFleet<M extends LayoutMember>(members: M[], wings: FleetWing[]): FleetLayout<M> {
  const rank = (m: M) => {
    const i = FLEET_ROLES.indexOf(m.role as FleetRole);
    return i === -1 ? FLEET_ROLES.length : i;
  };
  const sorted = [...members].sort((a, b) => rank(a) - rank(b));
  const command = sorted.filter((m) => m.wingId === -1 || m.role === "fleet_commander");
  const rest = sorted.filter((m) => !command.includes(m));

  const wingMap = new Map<number, WingLayout<M>>();
  for (const w of wings) {
    wingMap.set(w.id, {
      id: w.id,
      name: w.name,
      commanders: [],
      squads: w.squads.map((s) => ({ id: s.id, name: s.name, members: [] })),
    });
  }
  for (const m of rest) {
    let wing = wingMap.get(m.wingId);
    if (!wing) {
      wing = { id: m.wingId, name: "", commanders: [], squads: [] };
      wingMap.set(m.wingId, wing);
    }
    if (m.squadId === -1 || m.role === "wing_commander") {
      wing.commanders.push(m);
      continue;
    }
    let squad = wing.squads.find((s) => s.id === m.squadId);
    if (!squad) {
      squad = { id: m.squadId, name: "", members: [] };
      wing.squads.push(squad);
    }
    squad.members.push(m);
  }

  const out = [...wingMap.values()]
    .map((w) => ({ ...w, squads: w.squads.filter((s) => s.members.length > 0) }))
    .filter((w) => w.commanders.length > 0 || w.squads.length > 0);
  return { command, wings: out };
}

export interface CompositionRow {
  key: number;
  label: string | null;
  count: number;
}

/** Counts members per key (ship type or ship group), largest first, ties by label. */
export function countBy<M>(members: M[], key: (m: M) => number, label: (m: M) => string | null): CompositionRow[] {
  const rows = new Map<number, CompositionRow>();
  for (const m of members) {
    const k = key(m);
    const row = rows.get(k);
    if (row) row.count++;
    else rows.set(k, { key: k, label: label(m), count: 1 });
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || (a.label ?? "").localeCompare(b.label ?? ""));
}

/** The MOTD is EVE rich text (`<font>`, `<a href=showinfo:…>`); show it as plain text. */
export function stripMarkup(motd: string): string {
  return motd
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}
