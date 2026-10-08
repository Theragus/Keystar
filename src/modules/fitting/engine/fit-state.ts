import type { DamageProfile, Fit, FitItem, Slot, State } from "@eveshipfit/dogma-engine";
import { MODULE_SLOTS, type ItemKind, type ModuleSlot } from "../sde/catalog";

/*
 * The editor's state is the engine's own `Fit`: what the user builds is exactly what gets calculated, imported and
 * exported. This reducer is the only place that changes it. Items are addressed by their position in `fit.items`
 * (the engine's violations use the same index).
 */

export const STATES: State[] = ["offline", "online", "active", "overload"];

export type FitAction =
  | { type: "load"; fit: Fit }
  | { type: "setShip"; typeId: number }
  | { type: "setName"; name: string }
  | { type: "addModule"; typeId: number; slot: ModuleSlot; slotCounts: Record<ModuleSlot, number>; charge?: number }
  | { type: "placeModule"; typeId: number; slot: ModuleSlot; index: number; charge?: number }
  | { type: "addToBay"; typeId: number; bay: "drone_bay" | "fighter_bay" | "cargo"; quantity?: number }
  | { type: "removeItem"; index: number }
  | { type: "replaceItem"; index: number; typeId: number }
  | { type: "setState"; index: number; state: State }
  | { type: "setCharge"; index: number; chargeTypeId: number | null }
  | { type: "setQuantity"; index: number; quantity: number }
  | { type: "setSkills"; skills: Record<number, number> }
  | { type: "setDamageProfile"; profile: DamageProfile }
  | { type: "clearItems" };

export const UNIFORM_DAMAGE: DamageProfile = { em: 0.25, thermal: 0.25, kinetic: 0.25, explosive: 0.25 };

export function emptyFit(shipTypeId: number, skills: Record<number, number> = {}): Fit {
  return {
    ship: { type_id: shipTypeId },
    items: [],
    character: { skills },
    environment: { damage_profile: UNIFORM_DAMAGE, security: "high_sec", reactive_armor: "do_not_adapt" },
  };
}

/** Whether the item sits in a module slot (as opposed to a bay or an implant slot). */
export function isModule(item: FitItem): item is FitItem & { slot: { type: ModuleSlot; index: number } } {
  return (MODULE_SLOTS as readonly string[]).includes(item.slot.type);
}

/** The lowest free index of a slot kind, or null when every slot is taken. */
export function freeSlotIndex(fit: Fit, slot: ModuleSlot, count: number): number | null {
  const taken = new Set(fit.items.flatMap((i) => (i.slot.type === slot && "index" in i.slot ? [i.slot.index] : [])));
  for (let i = 0; i < count; i++) if (!taken.has(i)) return i;
  return null;
}

/** Items in a slot rack, by slot index (holes for empty slots). */
export function rackItems(fit: Fit, slot: ModuleSlot, count: number): ({ item: FitItem; index: number } | null)[] {
  const rack: ({ item: FitItem; index: number } | null)[] = Array.from({ length: count }, () => null);
  fit.items.forEach((item, index) => {
    if (item.slot.type === slot && item.slot.index < count) rack[item.slot.index] = { item, index };
  });
  return rack;
}

/** Items that overflow a rack (fitted beyond the hull's slot count, e.g. after a hull swap). */
export function overflowItems(fit: Fit, slotCounts: Record<ModuleSlot, number>): { item: FitItem; index: number }[] {
  return fit.items.flatMap((item, index) => (isModule(item) && item.slot.index >= slotCounts[item.slot.type] ? [{ item, index }] : []));
}

/** Items in a bay, in fit order. */
export function bayItems(fit: Fit, bay: Slot["type"]): { item: FitItem; index: number }[] {
  return fit.items.flatMap((item, index) => (item.slot.type === bay ? [{ item, index }] : []));
}

/** Where an item of this kind goes when added from the browser. */
export function bayFor(kind: ItemKind): "drone_bay" | "fighter_bay" | "cargo" | null {
  if (kind === "drone") return "drone_bay";
  if (kind === "fighter") return "fighter_bay";
  if (kind === "charge") return "cargo";
  return null;
}

function updateItem(fit: Fit, index: number, change: (item: FitItem) => FitItem): Fit {
  if (!fit.items[index]) return fit;
  return { ...fit, items: fit.items.map((item, i) => (i === index ? change(item) : item)) };
}

export function fitReducer(fit: Fit, action: FitAction): Fit {
  switch (action.type) {
    case "load":
      return action.fit;
    case "setShip":
      return { ...fit, ship: { type_id: action.typeId } };
    case "setName":
      return { ...fit, name: action.name || undefined };
    case "addModule": {
      const index = freeSlotIndex(fit, action.slot, action.slotCounts[action.slot]);
      if (index === null) return fit;
      const item: FitItem = {
        type_id: action.typeId,
        slot: { type: action.slot, index },
        quantity: 1,
        state: "active",
        ...(action.charge ? { charge: { type_id: action.charge } } : {}),
      };
      return { ...fit, items: [...fit.items, item] };
    }
    case "placeModule": {
      const kept = fit.items.filter((i) => !(i.slot.type === action.slot && "index" in i.slot && i.slot.index === action.index));
      const item: FitItem = {
        type_id: action.typeId,
        slot: { type: action.slot, index: action.index },
        quantity: 1,
        state: "active",
        ...(action.charge ? { charge: { type_id: action.charge } } : {}),
      };
      return { ...fit, items: [...kept, item] };
    }
    case "addToBay": {
      const quantity = action.quantity ?? 1;
      const existing = fit.items.findIndex((i) => i.slot.type === action.bay && i.type_id === action.typeId);
      if (existing >= 0) return updateItem(fit, existing, (i) => ({ ...i, quantity: (i.quantity ?? 1) + quantity }));
      const item: FitItem = {
        type_id: action.typeId,
        slot: { type: action.bay },
        quantity,
        state: action.bay === "cargo" ? "offline" : "active",
      };
      return { ...fit, items: [...fit.items, item] };
    }
    case "removeItem":
      if (!fit.items[action.index]) return fit;
      return { ...fit, items: fit.items.filter((_, i) => i !== action.index) };
    case "replaceItem":
      return updateItem(fit, action.index, (i) => ({ ...i, type_id: action.typeId }));
    case "setState":
      return updateItem(fit, action.index, (i) => ({ ...i, state: action.state }));
    case "setCharge":
      return updateItem(fit, action.index, (i) => {
        const rest: FitItem = { ...i };
        delete rest.charge;
        return action.chargeTypeId ? { ...rest, charge: { type_id: action.chargeTypeId } } : rest;
      });
    case "setQuantity": {
      const quantity = Math.max(0, Math.floor(action.quantity));
      if (quantity === 0) return fitReducer(fit, { type: "removeItem", index: action.index });
      return updateItem(fit, action.index, (i) => ({ ...i, quantity }));
    }
    case "setSkills":
      return { ...fit, character: { ...fit.character, skills: action.skills } };
    case "setDamageProfile":
      return { ...fit, environment: { ...fit.environment, damage_profile: action.profile } };
    case "clearItems":
      return { ...fit, items: [] };
  }
}

/** The next state when the user clicks a module's state toggle, within what the module allows. */
export function nextState(current: State, max: State): State {
  const allowed = STATES.slice(0, STATES.indexOf(max) + 1);
  const i = allowed.indexOf(current);
  return allowed[(i + 1) % allowed.length] ?? "online";
}
