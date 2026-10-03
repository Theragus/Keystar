/**
 * Classification of mineable resources by inventory group. Isomorphic.
 * Group ids from ESI /universe/categories/25 (Asteroid) and group 711 (gas).
 */
export const ORE_CLASSES = [
  "ore",
  "moon_r4",
  "moon_r8",
  "moon_r16",
  "moon_r32",
  "moon_r64",
  "ice",
  "gas",
  "other",
] as const;

export type OreClass = (typeof ORE_CLASSES)[number];

// Display names (long and short) live in the dictionaries: t.eve.oreClasses[oreClass].

const MOON_GROUPS: Record<number, OreClass> = {
  1884: "moon_r4",
  1920: "moon_r8",
  1921: "moon_r16",
  1922: "moon_r32",
  1923: "moon_r64",
};

export const ASTEROID_CATEGORY_ID = 25;
export const ICE_GROUP_IDS = [465, 903];
export const GAS_GROUP_IDS = [711];

export function classifyOre(groupId: number | null | undefined, categoryId: number | null | undefined): OreClass {
  if (groupId == null) return "other";
  if (MOON_GROUPS[groupId]) return MOON_GROUPS[groupId];
  if (ICE_GROUP_IDS.includes(groupId)) return "ice";
  if (GAS_GROUP_IDS.includes(groupId)) return "gas";
  if (categoryId === ASTEROID_CATEGORY_ID) return "ore";
  return "other";
}

/** SQL CASE expression equivalent of classifyOre, for aggregation queries. */
export function oreClassSqlCase(groupCol: string, categoryCol: string): string {
  const moon = Object.entries(MOON_GROUPS)
    .map(([g, c]) => `WHEN ${groupCol} = ${g} THEN '${c}'`)
    .join(" ");
  return `CASE ${moon} WHEN ${groupCol} IN (${ICE_GROUP_IDS.join(",")}) THEN 'ice' WHEN ${groupCol} IN (${GAS_GROUP_IDS.join(
    ",",
  )}) THEN 'gas' WHEN ${categoryCol} = ${ASTEROID_CATEGORY_ID} THEN 'ore' ELSE 'other' END`;
}

export function isOreClass(value: string): value is OreClass {
  return (ORE_CLASSES as readonly string[]).includes(value);
}
