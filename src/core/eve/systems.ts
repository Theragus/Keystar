/** Solar system id ranges and the system picker's search. Isomorphic. */

/** Known space starts here; wormhole (J-)space at WORMHOLE_MIN; Abyssal pockets at LISTED_MAX and above. */
const KSPACE_MIN = 30_000_000;
const WORMHOLE_MIN = 31_000_000;
const LISTED_MAX = 32_000_000;

/** Systems a pilot can be in and name: known space and wormholes, not Abyssal pockets. */
export const isListedSystem = (id: number) => id >= KSPACE_MIN && id < LISTED_MAX;

export const isWormholeSystem = (id: number) => id >= WORMHOLE_MIN && id < LISTED_MAX;

/** [system id, name, security status], as served by /api/universe/systems. */
export type SystemOption = [id: number, name: string, security: number];

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
