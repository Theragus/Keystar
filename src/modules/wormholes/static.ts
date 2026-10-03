/**
 * Static wormhole data: types and a lookup index over the generated
 * `data/static.json` (see `src/scripts/wh-data.ts`). Pure and isomorphic so
 * tests can build an index from a fixture; the app loads the real file
 * through `static-data.ts`, which client components must not import.
 */

/** System classes. J-space keys follow anoik.is; k-space is split by security. */
export const CLASS_KEYS = [
  "c1",
  "c2",
  "c3",
  "c4",
  "c5",
  "c6",
  "c13",
  "thera",
  "sentinel",
  "barbican",
  "vidette",
  "conflux",
  "redoubt",
  "hs",
  "ls",
  "ns",
  "pochven",
] as const;
export type ClassKey = (typeof CLASS_KEYS)[number];

/** Display and sort order (home-ish classes first, then specials, then k-space). */
export const CLASS_ORDER: Record<ClassKey, number> = Object.fromEntries(CLASS_KEYS.map((k, i) => [k, i])) as Record<
  ClassKey,
  number
>;

/** SDE `wormholeClassID` → class key. */
export const CLASS_BY_ID: Record<number, ClassKey> = {
  1: "c1",
  2: "c2",
  3: "c3",
  4: "c4",
  5: "c5",
  6: "c6",
  7: "hs",
  8: "ls",
  9: "ns",
  12: "thera",
  13: "c13",
  14: "sentinel",
  15: "barbican",
  16: "vidette",
  17: "conflux",
  18: "redoubt",
  25: "pochven",
};

/** Effect strength step (1–6) per class; classes without an entry have no system effects. */
export const EFFECT_POWER: Partial<Record<ClassKey, number>> = {
  c1: 1,
  c2: 2,
  c3: 3,
  c4: 4,
  c5: 5,
  c6: 6,
  c13: 6,
  sentinel: 2,
  barbican: 2,
  vidette: 2,
  conflux: 2,
  redoubt: 2,
};

export const isWormholeSpace = (cls: ClassKey) => !["hs", "ls", "ns", "pochven"].includes(cls);

/** Class of a k-space system from its security status (as EVE rounds it). */
export function classFromSecurity(sec: number): ClassKey {
  if (sec >= 0.45) return "hs";
  if (sec > 0) return "ls";
  return "ns";
}

export type HoleSize = "S" | "M" | "L" | "XL";

/** Largest ship a wormhole lets through, from its maximum mass per jump (kg). */
export function sizeOf(jumpMass: number | null): HoleSize | null {
  if (jumpMass === null) return null;
  if (jumpMass <= 5_000_000) return "S";
  if (jumpMass <= 62_000_000) return "M";
  if (jumpMass <= 375_000_000) return "L";
  return "XL";
}

export interface WormholeType {
  id: number;
  /** Destination class; null for K162 (the exit side of any wormhole). */
  dest: ClassKey | null;
  /** Classes it can spawn in; null = anywhere (wandering frigate and drifter holes). */
  src: ClassKey[] | null;
  static: boolean;
  /** Maximum lifetime in hours. */
  life: number | null;
  /** Total mass in kg. */
  mass: number | null;
  /** Maximum mass per jump in kg. */
  jump: number | null;
  regen: number | null;
}

/** [id, name, class, regionId, effect, statics] */
export type WspaceRow = [number, string, ClassKey, number, string | null, string[]];
/** [id, name, security, regionId, class] */
export type KspaceRow = [number, string, number, number, ClassKey];

export interface StaticFile {
  meta: { generatedAt: string; sdeBuild: number | null; anoikVersion: number | null };
  regions: Record<string, string>;
  /** Effect name → [modifier, six steps by effect strength]. English data, not translated. */
  effects: Record<string, [string, string[]][]>;
  types: Record<string, WormholeType>;
  wspace: WspaceRow[];
  kspace: KspaceRow[];
}

export interface SystemInfo {
  id: number;
  name: string;
  cls: ClassKey;
  /** Security status; null for J-space. */
  sec: number | null;
  regionId: number;
  region: string;
  effect: string | null;
  statics: string[];
}

export interface StaticType extends WormholeType {
  code: string;
}

export interface EffectModifier {
  name: string;
  value: string;
}

export interface StaticIndex {
  meta: StaticFile["meta"];
  types: Record<string, WormholeType>;
  effects: StaticFile["effects"];
  system(id: number): SystemInfo | null;
  byName(name: string): SystemInfo | null;
  search(query: string, limit?: number): SystemInfo[];
  whType(code: string): StaticType | null;
  /** Wormhole types that can appear in a system of this class: its statics first, no K162. */
  typesFor(cls: ClassKey, statics?: readonly string[]): StaticType[];
  effectFor(effect: string | null, cls: ClassKey): EffectModifier[];
  counts: { wspace: number; kspace: number };
}

export const K162 = "K162";

/** "J113551", "j113551" and "113551" all name the same J-space system. */
function nameKey(name: string): string {
  const n = name.trim().toLowerCase();
  return /^\d{6}$/.test(n) ? `j${n}` : n;
}

export function typesForClass(
  types: Record<string, WormholeType>,
  cls: ClassKey,
  statics: readonly string[] = [],
): StaticType[] {
  const staticSet = new Set(statics);
  return Object.entries(types)
    .filter(([code, t]) => code !== K162 && (staticSet.has(code) || t.src === null || t.src.includes(cls)))
    .map(([code, t]) => ({ code, ...t }))
    .sort((a, b) => {
      const sa = staticSet.has(a.code) ? 0 : 1;
      const sb = staticSet.has(b.code) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const da = a.dest ? CLASS_ORDER[a.dest] : 99;
      const db = b.dest ? CLASS_ORDER[b.dest] : 99;
      return da - db || a.code.localeCompare(b.code);
    });
}

/** System effect modifiers at the strength of the given class (none for k-space, Thera and unknown effects). */
export function effectModifiers(
  effects: StaticFile["effects"],
  effect: string | null,
  cls: ClassKey,
): EffectModifier[] {
  const power = EFFECT_POWER[cls];
  const table = effect ? effects[effect] : undefined;
  if (!table || !power) return [];
  return table.map(([name, steps]) => ({ name, value: steps[power - 1] ?? "" }));
}

export function createStaticIndex(file: StaticFile): StaticIndex {
  const systems = new Map<number, SystemInfo>();
  const names = new Map<string, SystemInfo>();
  const region = (id: number) => file.regions[String(id)] ?? "";
  for (const [id, name, cls, regionId, effect, statics] of file.wspace) {
    const info: SystemInfo = { id, name, cls, sec: null, regionId, region: region(regionId), effect, statics };
    systems.set(id, info);
    names.set(nameKey(name), info);
  }
  for (const [id, name, sec, regionId, cls] of file.kspace) {
    const info: SystemInfo = { id, name, cls, sec, regionId, region: region(regionId), effect: null, statics: [] };
    systems.set(id, info);
    names.set(nameKey(name), info);
  }
  const all = [...systems.values()].map((s) => ({ key: nameKey(s.name), info: s }));

  return {
    meta: file.meta,
    types: file.types,
    effects: file.effects,
    counts: { wspace: file.wspace.length, kspace: file.kspace.length },
    system: (id) => systems.get(id) ?? null,
    byName: (name) => names.get(nameKey(name)) ?? null,
    search(query, limit = 10) {
      const q = nameKey(query);
      if (!q) return [];
      const rank = (key: string) => (key === q ? 0 : key.startsWith(q) ? 1 : key.includes(q) ? 2 : -1);
      return all
        .map((s) => ({ ...s, r: rank(s.key) }))
        .filter((s) => s.r >= 0)
        .sort((a, b) => a.r - b.r || a.key.length - b.key.length || a.key.localeCompare(b.key))
        .slice(0, limit)
        .map((s) => s.info);
    },
    whType(code) {
      const t = file.types[code.trim().toUpperCase()];
      return t ? { code: code.trim().toUpperCase(), ...t } : null;
    },
    typesFor: (cls, statics = []) => typesForClass(file.types, cls, statics),
    effectFor: (effect, cls) => effectModifiers(file.effects, effect, cls),
  };
}

/** What the client needs about a system: no ids it can't use, statics with their destination. */
export interface SystemSummary {
  id: number;
  name: string;
  cls: ClassKey;
  sec: number | null;
  region: string;
  effect: string | null;
  statics: { code: string; dest: ClassKey | null }[];
}

export function summarise(info: SystemInfo, types: Record<string, WormholeType>): SystemSummary {
  return {
    id: info.id,
    name: info.name,
    cls: info.cls,
    sec: info.sec,
    region: info.region,
    effect: info.effect,
    statics: info.statics.map((code) => ({ code, dest: types[code]?.dest ?? null })),
  };
}

/** Compact class code used in wormhole jargon on every client language: C3, HS, NS, Thera. */
export function shortClass(cls: ClassKey | null): string {
  if (!cls) return "?";
  if (/^c\d+$/.test(cls) || cls === "hs" || cls === "ls" || cls === "ns") return cls.toUpperCase();
  return cls.charAt(0).toUpperCase() + cls.slice(1);
}
