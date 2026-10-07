import { MODULE_GROUPS, SHIP_GROUPS } from "@/modules/intel/hulls";

/**
 * What a kill says about the camp that made it, from the inventory groups of
 * the hulls and weapons on the mail (eve_types, named by the ingest). Pure.
 *
 * - smartbomb: a smartbomb did damage (catches fast ships and pods that can't be locked)
 * - interdictor / hic: an Interdictor or Heavy Interdiction Cruiser (bubbles in null-sec; a HIC's point everywhere)
 * - gank: CONCORD on the mail, the attackers were CONCORDed (high-sec suicide gank)
 * - hotdrop: Black Ops, capitals or supers on the mail
 * - pod: the victim lost a capsule (the camp kills pods)
 */
export const KILL_TAGS = ["smartbomb", "interdictor", "hic", "gank", "hotdrop", "pod"] as const;
export type KillTag = (typeof KILL_TAGS)[number];

const HOTDROP_GROUPS = new Set<number>([
  SHIP_GROUPS.blackOps,
  SHIP_GROUPS.carrier,
  SHIP_GROUPS.dreadnought,
  SHIP_GROUPS.lancerDreadnought,
  SHIP_GROUPS.forceAuxiliary,
  SHIP_GROUPS.supercarrier,
  SHIP_GROUPS.titan,
]);

export interface TaggableKill {
  victimShipTypeId: number;
  attackerShipTypeIds: readonly number[];
  attackerWeaponTypeIds: readonly number[];
  concord: boolean;
}

export type GroupOf = (typeId: number) => number | undefined;
export type CategoryOf = (typeId: number) => number | undefined;

/** Inventory category of ships, capsules included. */
const SHIP_CATEGORY = 6;
/**
 * Deployables that are only out while their owner flies beside them: losing
 * one means someone hunted a pilot here, much like a ship kill.
 */
const ACTIVE_DEPLOYABLE_GROUPS = new Set<number>([
  1249, // Mobile Cyno Inhibitor
  1250, // Mobile Tractor Unit
  1275, // Mobile Scan Inhibitor
  1276, // Mobile Micro Jump Unit
]);

/**
 * A victim that says little about a camp: anything but a ship or an active
 * deployable, such as a mobile depot left anchored for days, a siphon or a
 * structure, which anyone passing may shoot. Unnamed types count as ships.
 */
export function isMinorVictim(typeId: number, groupOf: GroupOf, categoryOf: CategoryOf): boolean {
  const category = categoryOf(typeId);
  if (category === undefined || category === SHIP_CATEGORY) return false;
  const group = groupOf(typeId);
  return group === undefined || !ACTIVE_DEPLOYABLE_GROUPS.has(group);
}

export function killTags(kill: TaggableKill, groupOf: GroupOf): KillTag[] {
  const ships = new Set(kill.attackerShipTypeIds.map(groupOf));
  const weapons = new Set(kill.attackerWeaponTypeIds.map(groupOf));
  const tags: KillTag[] = [];
  if (weapons.has(MODULE_GROUPS.smartBomb)) tags.push("smartbomb");
  if (ships.has(SHIP_GROUPS.interdictor)) tags.push("interdictor");
  if (ships.has(SHIP_GROUPS.heavyInterdictor)) tags.push("hic");
  if (kill.concord) tags.push("gank");
  if ([...ships].some((g) => g !== undefined && HOTDROP_GROUPS.has(g))) tags.push("hotdrop");
  if (groupOf(kill.victimShipTypeId) === SHIP_GROUPS.capsule) tags.push("pod");
  return tags;
}

/** Tags of several kills, in KILL_TAGS order, each once. */
export function mergeTags(lists: Iterable<readonly KillTag[]>): KillTag[] {
  const seen = new Set<KillTag>();
  for (const list of lists) for (const t of list) seen.add(t);
  return KILL_TAGS.filter((t) => seen.has(t));
}
