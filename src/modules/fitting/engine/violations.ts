import type { Calculation, Fit, Violation } from "@eveshipfit/dogma-engine";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import type { Sde } from "../sde/reader";

export interface ViolationText {
  /** The fit item the problem is about, or null for the ship as a whole. */
  index: number | null;
  text: string;
}

const ROMAN = ["0", "I", "II", "III", "IV", "V"];
export const romanLevel = (level: number): string => ROMAN[level] ?? String(level);

function ruleText(v: Violation, sde: Sde, t: Messages["fitting"]["violations"], f: Formatter): string {
  const r = v.rule;
  const n = (x: number) => f.number(x, Number.isInteger(x) ? 0 : 1);
  switch (r.type) {
    case "resource":
      return t.resource(t.resources[r.resource] ?? r.resource, n(r.used), n(r.available));
    case "slots":
      return t.slots(t.slotNames[r.slot] ?? r.slot, n(r.used), n(r.available));
    case "wrong_slot":
      return t.wrongSlot(t.slotNames[r.expected] ?? r.expected);
    case "slot_taken":
      return t.slotTaken;
    case "wrong_slot_index":
      return t.wrongSlotIndex;
    case "subsystem_taken":
      return t.subsystemTaken;
    case "skill":
      return t.skill(sde.types.get(r.type_id)?.name ?? String(r.type_id), romanLevel(r.required), romanLevel(r.level));
    case "rig_size":
      return t.rigSize;
    case "ship_restricted":
      return t.shipRestricted;
    case "capital_item":
      return t.capitalItem;
    case "structure_item":
      return t.structureItem;
    case "ship_item":
      return t.shipItem;
    case "charge_group":
      return t.chargeGroup;
    case "charge_size":
      return t.chargeSize;
    case "max_group":
      return t.maxGroup(n(r.allowed), t.maxGroupLimit[r.limit] ?? r.limit);
    case "max_type":
      return t.maxType(n(r.allowed));
  }
}

/** The engine's violations as sentences, each naming the item it is about. */
export function describeViolations(
  fit: Fit,
  calc: Calculation,
  sde: Sde,
  t: Messages["fitting"]["violations"],
  f: Formatter,
): ViolationText[] {
  return (calc.violations ?? []).map((v) => {
    const text = ruleText(v, sde, t, f);
    if (v.target.type === "ship") return { index: null, text };
    const item = fit.items[v.target.index];
    const typeId = v.target.type === "charge" ? item?.charge?.type_id : item?.type_id;
    const name = (typeId ? sde.types.get(typeId)?.name : undefined) ?? (v.target.type === "charge" ? t.charge : t.ship);
    return { index: v.target.index, text: `${t.on(name)}${text}` };
  });
}
