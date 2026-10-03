import type { ZkillKillmail } from "@/modules/killboard/zkill";
import { isFittedSlot } from "./hulls";

/** Player co-attackers kept per kill (for "flies with"). */
const MAX_ALLIES = 30;

export interface DigestInsert {
  characterId: number;
  killmailId: number;
  killmailTime: Date;
  solarSystemId: number;
  locationId: number | null;
  isLoss: boolean;
  shipTypeId: number | null;
  weaponTypeId: number | null;
  finalBlow: boolean;
  damageDone: number;
  attackerCount: number;
  totalValue: number;
  solo: boolean;
  npc: boolean;
  awox: boolean;
  labels: string[];
  otherCharacterId: number | null;
  otherCorporationId: number | null;
  otherAllianceId: number | null;
  otherShipTypeId: number | null;
  allyIds: number[];
  fittedTypeIds: number[];
}

const id = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * The digest row for one pilot on one killmail: their side (kill or loss),
 * their hull, the other side, and for losses the fitted modules. Null if the
 * pilot is not on the killmail.
 */
export function toDigestRow(km: ZkillKillmail, characterId: number): DigestInsert | null {
  const base = {
    characterId,
    killmailId: km.killmail_id,
    killmailTime: new Date(km.killmail_time),
    solarSystemId: km.solar_system_id,
    locationId: id(km.zkb.locationID),
    attackerCount: km.attackers.length,
    totalValue: num(km.zkb.totalValue),
    solo: km.zkb.solo === true,
    npc: km.zkb.npc === true,
    awox: km.zkb.awox === true,
    labels: Array.isArray(km.zkb.labels) ? km.zkb.labels.filter((l) => typeof l === "string").slice(0, 20) : [],
  };
  if (km.victim.character_id === characterId) {
    const finalBlow = km.attackers.find((a) => a.final_blow) ?? km.attackers[0];
    const fitted = new Set<number>();
    for (const item of km.victim.items ?? []) {
      if (isFittedSlot(item.flag) && id(item.item_type_id)) fitted.add(item.item_type_id);
    }
    return {
      ...base,
      isLoss: true,
      shipTypeId: id(km.victim.ship_type_id),
      weaponTypeId: null,
      finalBlow: false,
      damageDone: 0,
      otherCharacterId: id(finalBlow?.character_id),
      otherCorporationId: id(finalBlow?.corporation_id),
      otherAllianceId: id(finalBlow?.alliance_id),
      otherShipTypeId: id(finalBlow?.ship_type_id),
      allyIds: [],
      fittedTypeIds: [...fitted],
    };
  }
  const me = km.attackers.find((a) => a.character_id === characterId);
  if (!me) return null;
  const allies = km.attackers
    .map((a) => id(a.character_id))
    .filter((a): a is number => a !== null && a !== characterId);
  return {
    ...base,
    isLoss: false,
    shipTypeId: id(me.ship_type_id),
    weaponTypeId: id(me.weapon_type_id),
    finalBlow: me.final_blow === true,
    damageDone: Math.trunc(num(me.damage_done)),
    otherCharacterId: id(km.victim.character_id),
    otherCorporationId: id(km.victim.corporation_id),
    otherAllianceId: id(km.victim.alliance_id),
    otherShipTypeId: id(km.victim.ship_type_id),
    allyIds: [...new Set(allies)].slice(0, MAX_ALLIES),
    fittedTypeIds: [],
  };
}
