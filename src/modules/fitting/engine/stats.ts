import type { Calculation, Fit, ItemResult } from "@eveshipfit/dogma-engine";
import { MODULE_SLOTS, type ModuleSlot } from "../sde/catalog";
import type { Sde } from "../sde/reader";

/*
 * The stats panel's model, read from a calculation by attribute *name* (the patched SDE gives its derived values
 * such as `ehp` or `alignTime` negative ids that may move). Pure, so it can be unit-tested against the engine.
 */

export interface Resource {
  used: number;
  total: number;
}

export type DamageType = "em" | "thermal" | "kinetic" | "explosive";
export const DAMAGE_TYPES: DamageType[] = ["em", "thermal", "kinetic", "explosive"];

export interface Layer {
  hp: number;
  ehp: number;
  /** Resistance per damage type, 0 to 1. */
  resists: Record<DamageType, number>;
}

export type SensorType = "radar" | "ladar" | "magnetometric" | "gravimetric";

export interface FitStats {
  resources: {
    cpu: Resource;
    power: Resource;
    calibration: Resource;
    turrets: Resource;
    launchers: Resource;
    droneBay: Resource;
    droneBandwidth: Resource;
    /** Drones in space against the character's limit. */
    drones: Resource;
  };
  slots: Record<ModuleSlot, number>;
  defence: {
    ehp: number;
    shield: Layer;
    armor: Layer;
    hull: Layer;
    /** HP per second: active shield boosting, armor and hull repair, and passive shield recharge (peak). */
    shieldBoost: number;
    armorRepair: number;
    hullRepair: number;
    passiveRecharge: number;
    /** Effective (resist-weighted) versions of the four above. */
    effective: { shieldBoost: number; armorRepair: number; hullRepair: number; passiveRecharge: number };
    /** Seconds for the shield to recharge fully. */
    shieldRechargeTime: number;
  };
  offence: {
    /** Weapons, with and without reloading. */
    dps: number;
    dpsNoReload: number;
    volley: number;
    droneDps: number;
    fighterDps: number;
    totalDps: number;
  };
  capacitor: {
    capacity: number;
    rechargeTime: number;
    /** Stable at this percentage; null when the capacitor runs dry. */
    stablePercent: number | null;
    /** Seconds until empty; null when stable. */
    depletesIn: number | null;
    /** GJ/s net at the peak recharge point: negative drains. */
    peakDelta: number;
    peakLoad: number;
    peakRecharge: number;
  };
  navigation: {
    maxVelocity: number;
    alignTime: number;
    mass: number;
    signatureRadius: number;
    warpSpeed: number;
    inertia: number;
  };
  targeting: {
    maxTargetRange: number;
    scanResolution: number;
    maxLockedTargets: number;
    sensorStrength: number;
    sensorType: SensorType | null;
  };
}

/** Attribute names the model reads; `tests/fitting-engine.test.ts` checks they all exist in the SDE. */
export const STAT_ATTRIBUTES = [
  "cpuLoad",
  "cpuOutput",
  "powerLoad",
  "powerOutput",
  "upgradeLoad",
  "upgradeCapacity",
  "turretSlotsLeft",
  "launcherSlotsLeft",
  "droneCapacity",
  "droneCapacityLoad",
  "droneBandwidth",
  "droneBandwidthUsed",
  "droneActive",
  "maxActiveDrones",
  "hiSlots",
  "medSlots",
  "lowSlots",
  "rigSlots",
  "maxSubSystems",
  "serviceSlots",
  "ehp",
  "shieldCapacity",
  "armorHP",
  "hp",
  "shieldEhp",
  "armorEhp",
  "hullEhp",
  "shieldEmDamageResonance",
  "shieldThermalDamageResonance",
  "shieldKineticDamageResonance",
  "shieldExplosiveDamageResonance",
  "armorEmDamageResonance",
  "armorThermalDamageResonance",
  "armorKineticDamageResonance",
  "armorExplosiveDamageResonance",
  "emDamageResonance",
  "thermalDamageResonance",
  "kineticDamageResonance",
  "explosiveDamageResonance",
  "shieldBoostRate",
  "armorRepairRate",
  "hullRepairRate",
  "passiveShieldRechargeRate",
  "shieldEffectiveBoostRate",
  "armorEffectiveRepairRate",
  "hullEffectiveRepairRate",
  "passiveShieldEffectiveRechargeRate",
  "shieldRechargeRate",
  "damagePerSecondWithReload",
  "damagePerSecondWithoutReload",
  "damageAlpha",
  "droneDamagePerSecond",
  "fighterDamagePerSecond",
  "capacitorCapacity",
  "rechargeRate",
  "capacitorStablePercentage",
  "capacitorDepletesIn",
  "capacitorPeakDelta",
  "capacitorPeakLoad",
  "capacitorPeakRecharge",
  "maxVelocity",
  "alignTime",
  "mass",
  "signatureRadius",
  "warpSpeedMultiplier",
  "baseWarpSpeed",
  "agility",
  "maxTargetRange",
  "scanResolution",
  "maxLockedTargets",
  "maxTargets",
  "scanRadarStrength",
  "scanLadarStrength",
  "scanMagnetometricStrength",
  "scanGravimetricStrength",
] as const;

type StatAttribute = (typeof STAT_ATTRIBUTES)[number];

const SLOT_ATTRIBUTES: Record<ModuleSlot, StatAttribute> = {
  high: "hiSlots",
  medium: "medSlots",
  low: "lowSlots",
  rig: "rigSlots",
  subsystem: "maxSubSystems",
  service: "serviceSlots",
};

const SENSORS: [SensorType, StatAttribute][] = [
  ["radar", "scanRadarStrength"],
  ["ladar", "scanLadarStrength"],
  ["magnetometric", "scanMagnetometricStrength"],
  ["gravimetric", "scanGravimetricStrength"],
];

function reader(sde: Sde, item: ItemResult) {
  return (name: StatAttribute, fallback = 0): number => {
    const id = sde.attributeIdByName.get(name);
    if (id === undefined) return fallback;
    const v = item.attributes.get(id)?.value;
    return v === undefined || Number.isNaN(v) ? fallback : v;
  };
}

function layer(hp: number, ehp: number, resonances: [number, number, number, number]): Layer {
  const [em, thermal, kinetic, explosive] = resonances.map((r) => Math.min(1, Math.max(0, 1 - r)));
  return { hp, ehp, resists: { em, thermal, kinetic, explosive } };
}

/** Fitted weapons that take a hardpoint: the engine validates them but does not count them on the hull. */
function hardpointsUsed(fit: Fit, calc: Calculation, sde: Sde, effectName: string): number {
  const effectId = sde.effectIdByName.get(effectName);
  if (effectId === undefined) return 0;
  return fit.items.filter(
    (item, i) => calc.items[i]?.state !== "offline" && sde.typeEffects(item.type_id).some((e) => e.effectId === effectId),
  ).length;
}

/** Reads the stats panel's numbers off a calculation of `fit`. */
export function fitStats(fit: Fit, calc: Calculation, sde: Sde): FitStats {
  const ship = reader(sde, calc.ship);
  const character = reader(sde, calc.character);

  const slots = Object.fromEntries(MODULE_SLOTS.map((s) => [s, Math.max(0, Math.round(ship(SLOT_ATTRIBUTES[s])))])) as Record<
    ModuleSlot,
    number
  >;

  const turrets = ship("turretSlotsLeft");
  const launchers = ship("launcherSlotsLeft");

  let sensorType: SensorType | null = null;
  let sensorStrength = 0;
  for (const [type, attr] of SENSORS) {
    const v = ship(attr);
    if (v > sensorStrength) {
      sensorStrength = v;
      sensorType = type;
    }
  }

  const stable = ship("capacitorStablePercentage");
  const depletes = ship("capacitorDepletesIn");
  const dps = ship("damagePerSecondWithReload");
  const droneDps = ship("droneDamagePerSecond");
  const fighterDps = ship("fighterDamagePerSecond");

  return {
    resources: {
      cpu: { used: ship("cpuLoad"), total: ship("cpuOutput") },
      power: { used: ship("powerLoad"), total: ship("powerOutput") },
      calibration: { used: ship("upgradeLoad"), total: ship("upgradeCapacity") },
      turrets: { used: hardpointsUsed(fit, calc, sde, "turretFitted"), total: turrets },
      launchers: { used: hardpointsUsed(fit, calc, sde, "launcherFitted"), total: launchers },
      droneBay: { used: ship("droneCapacityLoad"), total: ship("droneCapacity") },
      droneBandwidth: { used: ship("droneBandwidthUsed"), total: ship("droneBandwidth") },
      drones: { used: ship("droneActive"), total: character("maxActiveDrones") },
    },
    slots,
    defence: {
      ehp: ship("ehp"),
      shield: layer(ship("shieldCapacity"), ship("shieldEhp"), [
        ship("shieldEmDamageResonance", 1),
        ship("shieldThermalDamageResonance", 1),
        ship("shieldKineticDamageResonance", 1),
        ship("shieldExplosiveDamageResonance", 1),
      ]),
      armor: layer(ship("armorHP"), ship("armorEhp"), [
        ship("armorEmDamageResonance", 1),
        ship("armorThermalDamageResonance", 1),
        ship("armorKineticDamageResonance", 1),
        ship("armorExplosiveDamageResonance", 1),
      ]),
      hull: layer(ship("hp"), ship("hullEhp"), [
        ship("emDamageResonance", 1),
        ship("thermalDamageResonance", 1),
        ship("kineticDamageResonance", 1),
        ship("explosiveDamageResonance", 1),
      ]),
      shieldBoost: ship("shieldBoostRate"),
      armorRepair: ship("armorRepairRate"),
      hullRepair: ship("hullRepairRate"),
      passiveRecharge: ship("passiveShieldRechargeRate"),
      effective: {
        shieldBoost: ship("shieldEffectiveBoostRate"),
        armorRepair: ship("armorEffectiveRepairRate"),
        hullRepair: ship("hullEffectiveRepairRate"),
        passiveRecharge: ship("passiveShieldEffectiveRechargeRate"),
      },
      shieldRechargeTime: ship("shieldRechargeRate") / 1000,
    },
    offence: {
      dps,
      dpsNoReload: ship("damagePerSecondWithoutReload"),
      volley: ship("damageAlpha"),
      droneDps,
      fighterDps,
      totalDps: dps + droneDps + fighterDps,
    },
    capacitor: {
      capacity: ship("capacitorCapacity"),
      rechargeTime: ship("rechargeRate") / 1000,
      stablePercent: stable > 0 ? stable : null,
      depletesIn: stable > 0 ? null : depletes,
      peakDelta: ship("capacitorPeakDelta"),
      peakLoad: ship("capacitorPeakLoad"),
      peakRecharge: ship("capacitorPeakRecharge"),
    },
    navigation: {
      maxVelocity: ship("maxVelocity"),
      alignTime: ship("alignTime"),
      mass: ship("mass"),
      signatureRadius: ship("signatureRadius"),
      warpSpeed: ship("warpSpeedMultiplier", 1) * ship("baseWarpSpeed", 1),
      inertia: ship("agility"),
    },
    targeting: {
      maxTargetRange: ship("maxTargetRange"),
      scanResolution: ship("scanResolution"),
      maxLockedTargets: ship("maxTargets") || ship("maxLockedTargets"),
      sensorStrength,
      sensorType,
    },
  };
}
