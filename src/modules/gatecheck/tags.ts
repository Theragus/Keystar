import { MODULE_GROUPS, SHIP_GROUPS } from "@/modules/intel/hulls";
import { securityClass } from "@/modules/map/model";
import type { GatecheckWarInsert } from "./schema";

/**
 * What a kill says about the camp that made it, from the inventory groups of
 * the hulls and weapons on the mail (eve_types, named by the ingest). Pure.
 *
 * - smartbomb: a smartbomb did damage (catches fast ships and pods that can't be locked)
 * - interdictor / hic: an Interdictor or Heavy Interdiction Cruiser (bubbles in null-sec; a HIC's point everywhere)
 * - gank: CONCORD on the mail, the attackers were CONCORDed (high-sec suicide gank)
 * - hotdrop: Black Ops, capitals or supers on the mail
 * - pod: the victim lost a capsule (the camp kills pods)
 * - war: the kill was part of a war the home corporation or alliance fights (the camp hunts you)
 */
export const KILL_TAGS = ["war", "smartbomb", "interdictor", "hic", "gank", "hotdrop", "pod"] as const;
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
  warId?: number | null;
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

export function killTags(kill: TaggableKill, groupOf: GroupOf, wars: WarContext = NO_WARS): KillTag[] {
  const ships = new Set(kill.attackerShipTypeIds.map(groupOf));
  const weapons = new Set(kill.attackerWeaponTypeIds.map(groupOf));
  const tags: KillTag[] = [];
  if (kill.warId && wars.ours.has(kill.warId)) tags.push("war");
  if (weapons.has(MODULE_GROUPS.smartBomb)) tags.push("smartbomb");
  if (ships.has(SHIP_GROUPS.interdictor)) tags.push("interdictor");
  if (ships.has(SHIP_GROUPS.heavyInterdictor)) tags.push("hic");
  if (kill.concord) tags.push("gank");
  if ([...ships].some((g) => g !== undefined && HOTDROP_GROUPS.has(g))) tags.push("hotdrop");
  if (groupOf(kill.victimShipTypeId) === SHIP_GROUPS.capsule) tags.push("pod");
  return tags;
}

/** Wars on the kills at hand: those looked up already, and those the home corporation or alliance fights. */
export interface WarContext {
  known: ReadonlySet<number>;
  ours: ReadonlySet<number>;
}
export const NO_WARS: WarContext = { known: new Set(), ours: new Set() };

/** The war context of looked-up wars, for the home corporation and its alliance (no ids: no war is ours). */
export function warContext(
  wars: readonly Pick<GatecheckWarInsert, "warId" | "aggressorId" | "defenderId" | "allyIds">[],
  homeIds: readonly number[],
): WarContext {
  const home = new Set(homeIds.filter((id) => id > 0));
  const ours = wars.filter((w) => [w.aggressorId, w.defenderId, ...(w.allyIds ?? [])].some((p) => p != null && home.has(p)));
  return { known: new Set(wars.map((w) => w.warId)), ours: new Set(ours.map((w) => w.warId)) };
}

/**
 * A high-sec kill in a war between others: legal between war targets and no
 * threat to anyone else. Low- and null-sec war kills still count (anyone may
 * shoot there), as do wars not looked up yet and the home side's own wars.
 */
export function isOthersWarKill(warId: number | null | undefined, security: number, wars: WarContext): boolean {
  return !!warId && securityClass(security) === "high" && wars.known.has(warId) && !wars.ours.has(warId);
}

/** Tags of several kills, in KILL_TAGS order, each once. */
export function mergeTags(lists: Iterable<readonly KillTag[]>): KillTag[] {
  const seen = new Set<KillTag>();
  for (const list of lists) for (const t of list) seen.add(t);
  return KILL_TAGS.filter((t) => seen.has(t));
}
