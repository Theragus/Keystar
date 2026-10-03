/** Solar system id ranges and the system picker's search. Isomorphic. */

/** Known space starts here; wormhole (J-)space at WORMHOLE_MIN; Abyssal pockets at LISTED_MAX and above. */
const KSPACE_MIN = 30_000_000;
const WORMHOLE_MIN = 31_000_000;
const LISTED_MAX = 32_000_000;

/** Systems a pilot can be in and name: known space and wormholes, not Abyssal pockets. */
export const isListedSystem = (id: number) => id >= KSPACE_MIN && id < LISTED_MAX;

export const isWormholeSystem = (id: number) => id >= WORMHOLE_MIN && id < LISTED_MAX;

/** [system id, name, security status, region name], as served by /api/universe/systems. */
export type SystemOption = [id: number, name: string, security: number, region: string | null];

export type WormholeClass = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "thera" | "c13" | "drifter";

/** Wormhole regions are named for their class: A-R00001 holds C1 systems, G-R00031 is Thera, K-R00033 Drifter space. */
const WORMHOLE_CLASS_BY_LETTER: Record<string, WormholeClass> = {
  A: "c1",
  B: "c2",
  C: "c3",
  D: "c4",
  E: "c5",
  F: "c6",
  G: "thera",
  H: "c13",
  K: "drifter",
};

export function wormholeClass(region: string | null): WormholeClass | null {
  if (!region || !/^[A-Z]-R\d{5}$/.test(region)) return null;
  return WORMHOLE_CLASS_BY_LETTER[region[0]] ?? null;
}

/** Systems whose name starts with the query, then those that contain it, each in list order. */
export function matchSystems(systems: readonly SystemOption[], query: string, limit = 50): SystemOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return systems.slice(0, limit);
  const prefix: SystemOption[] = [];
  const contains: SystemOption[] = [];
  for (const s of systems) {
    const at = s[1].toLowerCase().indexOf(q);
    if (at === 0) {
      prefix.push(s);
      if (prefix.length >= limit) break;
    } else if (at > 0 && contains.length < limit) contains.push(s);
  }
  return [...prefix, ...contains].slice(0, limit);
}
