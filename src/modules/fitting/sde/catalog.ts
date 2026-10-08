import type { Sde, SdeType } from "./reader";

/*
 * What the fitting editor needs to know about types beyond the engine's calculation: what kind of item a type is
 * (which slot it goes in), which charges a module takes, whether a module may be fitted to a hull at all, and a
 * text search. Everything is derived from `sde.dat`, by attribute and effect *name* so the ids can move. The
 * engine's `violations` stay the ground truth; these are the filters that keep the module browser relevant.
 */

export type ItemKind =
  | "ship"
  | "high"
  | "medium"
  | "low"
  | "rig"
  | "subsystem"
  | "service"
  | "drone"
  | "fighter"
  | "charge"
  | "implant"
  | "booster"
  | "skill"
  | "other";

/** Slot kinds a module occupies, in rack order. */
export const MODULE_SLOTS = ["high", "medium", "low", "rig", "subsystem", "service"] as const;
export type ModuleSlot = (typeof MODULE_SLOTS)[number];

export const CATEGORY = {
  ship: 6,
  module: 7,
  charge: 8,
  skill: 16,
  drone: 18,
  implant: 20,
  subsystem: 32,
  structureModule: 66,
  fighter: 87,
} as const;

/** Market group roots the browser shows (`sde.marketGroups`), in display order. */
export const MARKET_ROOTS = {
  ships: 4,
  equipment: 9,
  charges: 11,
  implantsAndBoosters: 24,
  drones: 157,
  modifications: 955,
  structureEquipment: 2202,
  structureModifications: 2203,
} as const;

const SLOT_EFFECTS: Record<ModuleSlot, string> = {
  high: "hiPower",
  medium: "medPower",
  low: "loPower",
  rig: "rigSlot",
  subsystem: "subSystem",
  service: "serviceSlot",
};

interface Derived {
  kinds: Map<number, ItemKind>;
  slotEffectIds: Map<number, ModuleSlot>;
  typeIdsByGroup: Map<number, number[]>;
  chargeGroupAttrs: number[];
  shipGroupAttrs: number[];
  shipTypeAttrs: number[];
  attr: (name: string) => number;
  /** Published types with a lower-cased name, for the search. */
  searchable: { type: SdeType; lower: string }[];
}

const derivedCache = new WeakMap<Sde, Derived>();

function derived(sde: Sde): Derived {
  let d = derivedCache.get(sde);
  if (d) return d;
  const attr = (name: string) => sde.attributeIdByName.get(name) ?? Number.NaN;
  const slotEffectIds = new Map<number, ModuleSlot>();
  for (const slot of MODULE_SLOTS) {
    const id = sde.effectIdByName.get(SLOT_EFFECTS[slot]);
    if (id !== undefined) slotEffectIds.set(id, slot);
  }
  const typeIdsByGroup = new Map<number, number[]>();
  const searchable: Derived["searchable"] = [];
  for (const type of sde.types.values()) {
    let list = typeIdsByGroup.get(type.groupId);
    if (!list) typeIdsByGroup.set(type.groupId, (list = []));
    list.push(type.id);
    if (type.published) searchable.push({ type, lower: type.name.toLowerCase() });
  }
  searchable.sort((a, b) => a.lower.localeCompare(b.lower));
  const byPrefix = (prefix: string) =>
    [...sde.attributeIdByName].filter(([name]) => name.startsWith(prefix)).map(([, id]) => id);
  d = {
    kinds: new Map(),
    slotEffectIds,
    typeIdsByGroup,
    chargeGroupAttrs: byPrefix("chargeGroup"),
    shipGroupAttrs: byPrefix("canFitShipGroup"),
    shipTypeAttrs: [...byPrefix("canFitShipType"), attr("fitsToShipType")].filter((id) => !Number.isNaN(id)),
    attr,
    searchable,
  };
  derivedCache.set(sde, d);
  return d;
}

/** The slot or bay a type belongs in. */
export function kindOf(sde: Sde, typeId: number): ItemKind {
  const d = derived(sde);
  const cached = d.kinds.get(typeId);
  if (cached) return cached;
  const type = sde.types.get(typeId);
  let kind: ItemKind = "other";
  if (type) {
    switch (type.categoryId) {
      case CATEGORY.ship:
        kind = "ship";
        break;
      case CATEGORY.charge:
        kind = "charge";
        break;
      case CATEGORY.drone:
        kind = "drone";
        break;
      case CATEGORY.fighter:
        kind = "fighter";
        break;
      case CATEGORY.skill:
        kind = "skill";
        break;
      case CATEGORY.implant:
        kind = sde.groups.get(type.groupId)?.name === "Booster" ? "booster" : "implant";
        break;
      default: {
        // Modules, rigs, subsystems and structure modules: the slot effect says where they go.
        for (const e of sde.typeEffects(typeId)) {
          const slot = d.slotEffectIds.get(e.effectId);
          if (slot) {
            kind = slot;
            break;
          }
        }
      }
    }
  }
  d.kinds.set(typeId, kind);
  return kind;
}

/** Whether a charge goes into a module: the module's charge groups, charge size and capacity allow it. */
export function chargeFits(sde: Sde, moduleTypeId: number, chargeTypeId: number): boolean {
  const d = derived(sde);
  const mod = sde.types.get(moduleTypeId);
  const charge = sde.types.get(chargeTypeId);
  if (!mod || !charge) return false;
  const modAttrs = sde.typeAttributes(moduleTypeId);
  const groups = d.chargeGroupAttrs.map((id) => modAttrs.get(id)).filter((g): g is number => g !== undefined && g > 0);
  if (!groups.includes(charge.groupId)) return false;
  const size = modAttrs.get(d.attr("chargeSize"));
  if (size !== undefined) {
    const chargeSize = sde.typeAttributes(chargeTypeId).get(d.attr("chargeSize"));
    if (chargeSize !== undefined && chargeSize !== size) return false;
  }
  if (mod.capacity !== null && charge.volume !== null && charge.volume > mod.capacity) return false;
  return true;
}

/** Whether a module takes charges at all. */
export function takesCharges(sde: Sde, moduleTypeId: number): boolean {
  const d = derived(sde);
  const attrs = sde.typeAttributes(moduleTypeId);
  return d.chargeGroupAttrs.some((id) => (attrs.get(id) ?? 0) > 0);
}

/** Published charges a module takes, by name. */
export function compatibleCharges(sde: Sde, moduleTypeId: number): SdeType[] {
  const d = derived(sde);
  const attrs = sde.typeAttributes(moduleTypeId);
  const out: SdeType[] = [];
  for (const attrId of d.chargeGroupAttrs) {
    const groupId = attrs.get(attrId);
    if (!groupId) continue;
    for (const typeId of d.typeIdsByGroup.get(groupId) ?? []) {
      const type = sde.types.get(typeId)!;
      if (type.published && chargeFits(sde, moduleTypeId, typeId)) out.push(type);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether a hull accepts a module: hull-restricted modules (covert ops cloaks, bastion …) name the groups or types
 * they fit, and a rig's size must match the hull's. Resources and slots are not checked here.
 */
export function fitsHull(sde: Sde, moduleTypeId: number, shipTypeId: number): boolean {
  const d = derived(sde);
  const ship = sde.types.get(shipTypeId);
  if (!ship) return true;
  const attrs = sde.typeAttributes(moduleTypeId);
  const groups = d.shipGroupAttrs.map((id) => attrs.get(id)).filter((g): g is number => g !== undefined && g > 0);
  const types = d.shipTypeAttrs.map((id) => attrs.get(id)).filter((t): t is number => t !== undefined && t > 0);
  if ((groups.length || types.length) && !groups.includes(ship.groupId) && !types.includes(ship.id)) return false;
  if (kindOf(sde, moduleTypeId) === "rig") {
    const rigSize = attrs.get(d.attr("rigSize"));
    const shipRigSize = sde.typeAttributes(shipTypeId).get(d.attr("rigSize"));
    if (rigSize !== undefined && shipRigSize !== undefined && rigSize !== shipRigSize) return false;
  }
  return true;
}

/** Skill requirements of a type: skill type id → level. */
export function requiredSkills(sde: Sde, typeId: number): Map<number, number> {
  const attrs = sde.typeAttributes(typeId);
  const out = new Map<number, number>();
  for (let i = 1; i <= 6; i++) {
    const skill = attrs.get(sde.attributeIdByName.get(`requiredSkill${i}`) ?? Number.NaN);
    const level = attrs.get(sde.attributeIdByName.get(`requiredSkill${i}Level`) ?? Number.NaN);
    if (skill && level) out.set(skill, level);
  }
  return out;
}

/** Whether a character with `skills` (type id → level) may use a type. */
export function skillsAllow(sde: Sde, typeId: number, skills: Record<number, number>): boolean {
  for (const [skill, level] of requiredSkills(sde, typeId)) if ((skills[skill] ?? 0) < level) return false;
  return true;
}

/** Every published skill at level `level`: the "all skills V" character. */
export function allSkills(sde: Sde, level = 5): Record<number, number> {
  const out: Record<number, number> = {};
  for (const type of sde.types.values()) if (type.published && type.categoryId === CATEGORY.skill) out[type.id] = level;
  return out;
}

/** Market group chain from the root down to the group. */
export function marketGroupPath(sde: Sde, marketGroupId: number): string[] {
  const path: string[] = [];
  for (let id = marketGroupId, guard = 0; id && guard < 16; guard++) {
    const g = sde.marketGroups.get(id);
    if (!g) break;
    path.unshift(g.name);
    id = g.parentId;
  }
  return path;
}

/** Published types under a market group, this group's own and its descendants', by name. */
export function marketGroupTypes(sde: Sde, marketGroupId: number): SdeType[] {
  const out: SdeType[] = [];
  const walk = (id: number, depth: number) => {
    const g = sde.marketGroups.get(id);
    if (!g || depth > 16) return;
    for (const typeId of g.typeIds) {
      const type = sde.types.get(typeId);
      if (type?.published) out.push(type);
    }
    for (const child of g.childIds) walk(child, depth + 1);
  };
  walk(marketGroupId, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Published types whose name contains every word of the query, names starting with the query first. `filter`
 * narrows the candidates (by kind, category …); `limit` caps the result.
 */
export function searchTypes(sde: Sde, query: string, filter?: (type: SdeType) => boolean, limit = 50): SdeType[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const starts: SdeType[] = [];
  const contains: SdeType[] = [];
  for (const { type, lower } of derived(sde).searchable) {
    if (!words.every((w) => lower.includes(w))) continue;
    if (filter && !filter(type)) continue;
    (lower.startsWith(words[0]) ? starts : contains).push(type);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
