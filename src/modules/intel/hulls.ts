import type { FitKey } from "./types";

/**
 * Ship and module groups Keystar recognises (inventory group ids, checked
 * against ESI /universe/groups). Pinned in tests/intel-scoring.test.ts.
 */
export const SHIP_GROUPS = {
  frigate: 25,
  cruiser: 26,
  battleship: 27,
  hauler: 28,
  capsule: 29,
  titan: 30,
  shuttle: 31,
  corvette: 237,
  assaultFrigate: 324,
  heavyAssaultCruiser: 358,
  deepSpaceTransport: 380,
  combatBattlecruiser: 419,
  destroyer: 420,
  miningBarge: 463,
  dreadnought: 485,
  freighter: 513,
  commandShip: 540,
  interdictor: 541,
  exhumer: 543,
  carrier: 547,
  supercarrier: 659,
  covertOps: 830,
  interceptor: 831,
  logistics: 832,
  forceRecon: 833,
  stealthBomber: 834,
  capitalIndustrial: 883,
  electronicAttackShip: 893,
  heavyInterdictor: 894,
  blackOps: 898,
  marauder: 900,
  jumpFreighter: 902,
  combatRecon: 906,
  industrialCommand: 941,
  strategicCruiser: 963,
  attackBattlecruiser: 1201,
  blockadeRunner: 1202,
  expeditionFrigate: 1283,
  tacticalDestroyer: 1305,
  logisticsFrigate: 1527,
  commandDestroyer: 1534,
  forceAuxiliary: 1538,
  flagCruiser: 1972,
  lancerDreadnought: 4594,
} as const;

/** Broad classes for "likely fleet composition" and tags. */
export type HullClass =
  | "tackle"
  | "hunter"
  | "recon"
  | "logistics"
  | "frigate"
  | "destroyer"
  | "cruiser"
  | "battlecruiser"
  | "battleship"
  | "capital"
  | "supercapital"
  | "blackOps"
  | "industrial"
  | "command"
  | "pod"
  | "other";

const G = SHIP_GROUPS;
const CLASS_BY_GROUP = new Map<number, HullClass>([
  [G.interceptor, "tackle"],
  [G.interdictor, "tackle"],
  [G.heavyInterdictor, "tackle"],
  [G.covertOps, "hunter"],
  [G.stealthBomber, "hunter"],
  [G.strategicCruiser, "hunter"],
  [G.forceRecon, "recon"],
  [G.combatRecon, "recon"],
  [G.logistics, "logistics"],
  [G.logisticsFrigate, "logistics"],
  [G.forceAuxiliary, "logistics"],
  [G.frigate, "frigate"],
  [G.assaultFrigate, "frigate"],
  [G.electronicAttackShip, "frigate"],
  [G.corvette, "frigate"],
  [G.destroyer, "destroyer"],
  [G.tacticalDestroyer, "destroyer"],
  [G.commandDestroyer, "destroyer"],
  [G.cruiser, "cruiser"],
  [G.heavyAssaultCruiser, "cruiser"],
  [G.flagCruiser, "cruiser"],
  [G.combatBattlecruiser, "battlecruiser"],
  [G.attackBattlecruiser, "battlecruiser"],
  [G.commandShip, "command"],
  [G.battleship, "battleship"],
  [G.marauder, "battleship"],
  [G.blackOps, "blackOps"],
  [G.carrier, "capital"],
  [G.dreadnought, "capital"],
  [G.lancerDreadnought, "capital"],
  [G.supercarrier, "supercapital"],
  [G.titan, "supercapital"],
  [G.hauler, "industrial"],
  [G.deepSpaceTransport, "industrial"],
  [G.blockadeRunner, "industrial"],
  [G.freighter, "industrial"],
  [G.jumpFreighter, "industrial"],
  [G.miningBarge, "industrial"],
  [G.exhumer, "industrial"],
  [G.industrialCommand, "industrial"],
  [G.capitalIndustrial, "industrial"],
  [G.expeditionFrigate, "industrial"],
  [G.capsule, "pod"],
  [G.shuttle, "pod"],
]);

export const HULL_CLASS_LABELS: Record<HullClass, string> = {
  tackle: "Tackle",
  hunter: "Covert / bomber",
  recon: "Recon",
  logistics: "Logistics",
  frigate: "Frigate",
  destroyer: "Destroyer",
  cruiser: "Cruiser",
  battlecruiser: "Battlecruiser",
  battleship: "Battleship",
  capital: "Capital",
  supercapital: "Supercapital",
  blackOps: "Black Ops",
  industrial: "Industrial",
  command: "Command ship",
  pod: "Pod / shuttle",
  other: "Other",
};

export function hullClass(groupId: number | null | undefined): HullClass {
  return (groupId && CLASS_BY_GROUP.get(groupId)) || "other";
}

/** Hulls that do not fight (pods, shuttles, industrials): left out of "flying" and comps. */
export function isCombatHull(groupId: number | null | undefined): boolean {
  const c = hullClass(groupId);
  return c !== "pod" && c !== "industrial";
}

export const MODULE_GROUPS = {
  warpScrambler: 52,
  stasisWeb: 65,
  interdictionSphereLauncher: 589,
  warpDisruptFieldGenerator: 899,
  remoteArmorRepairer: 325,
  remoteShieldBooster: 41,
  remoteCapacitorTransmitter: 67,
  remoteHullRepairer: 585,
  cloakingDevice: 330,
  cynosuralField: 658,
  smartBomb: 72,
  commandBurst: 1770,
  energyNeutralizer: 71,
} as const;

/** Cynosural field generators (inventory types, checked against ESI). */
export const CYNO_TYPES = { normal: 21096, covert: 28646, industrial: 52694 } as const;
/** Covert Ops cloaks (can warp cloaked). */
export const COVERT_CLOAK_TYPES = new Set([11578, 20563]);

const M = MODULE_GROUPS;
const FIT_BY_GROUP = new Map<number, FitKey>([
  [M.warpScrambler, "scram"],
  [M.stasisWeb, "web"],
  [M.interdictionSphereLauncher, "bubble"],
  [M.warpDisruptFieldGenerator, "bubble"],
  [M.remoteArmorRepairer, "remoteRep"],
  [M.remoteShieldBooster, "remoteRep"],
  [M.remoteCapacitorTransmitter, "remoteRep"],
  [M.remoteHullRepairer, "remoteRep"],
  [M.cloakingDevice, "cloak"],
  [M.smartBomb, "smartbomb"],
  [M.commandBurst, "commandBurst"],
  [M.energyNeutralizer, "neut"],
]);

/** What a fitted module says about the pilot (cyno flavours are told apart by type). */
export function fitKeyOf(typeId: number, groupId: number | null | undefined): FitKey | null {
  if (typeId === CYNO_TYPES.normal) return "cyno";
  if (typeId === CYNO_TYPES.covert) return "covertCyno";
  if (typeId === CYNO_TYPES.industrial) return "industrialCyno";
  if (COVERT_CLOAK_TYPES.has(typeId)) return "covertCloak";
  return (groupId && FIT_BY_GROUP.get(groupId)) || null;
}

/** Item location flags of fitted slots: low, mid, high, rigs and subsystems. */
export function isFittedSlot(flag: number): boolean {
  return (flag >= 11 && flag <= 34) || (flag >= 92 && flag <= 99) || (flag >= 125 && flag <= 132);
}

/** zKillboard location ids: 50M–59M are stargates (gate camps), 60M–69M stations. */
export function locationKind(locationId: number | null | undefined): "gate" | "station" | "celestial" | "other" {
  if (!locationId) return "other";
  if (locationId >= 50_000_000 && locationId < 60_000_000) return "gate";
  if (locationId >= 60_000_000 && locationId < 70_000_000) return "station";
  if (locationId >= 40_000_000 && locationId < 50_000_000) return "celestial";
  return "other";
}
