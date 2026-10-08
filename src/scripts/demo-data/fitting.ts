import { sql } from "drizzle-orm";
import { esiTokens, fittingEsiFittings, type Db } from "@/core/db";
import { FITTINGS_SCOPE } from "@/modules/fitting/module";

/** In-game saved fittings (real type ids) for the demo: the first member's main shares them. */
const FITTINGS = [
  {
    fittingId: 1,
    name: "Rifter – fleet tackle",
    shipTypeId: 587,
    items: [
      { flag: "LoSlot0", quantity: 1, type_id: 2048 }, // Damage Control II
      { flag: "LoSlot1", quantity: 1, type_id: 519 }, // Gyrostabilizer II
      { flag: "LoSlot2", quantity: 1, type_id: 2605 }, // Nanofiber Internal Structure II
      { flag: "MedSlot0", quantity: 1, type_id: 5973 }, // 5MN Y-T8 Compact Microwarpdrive
      { flag: "MedSlot1", quantity: 1, type_id: 448 }, // Warp Scrambler II
      { flag: "MedSlot2", quantity: 1, type_id: 4027 }, // Fleeting Compact Stasis Webifier
      { flag: "HiSlot0", quantity: 1, type_id: 2889 }, // 200mm AutoCannon II
      { flag: "HiSlot0", quantity: 1, type_id: 21898 }, // Republic Fleet EMP S
      { flag: "HiSlot1", quantity: 1, type_id: 2889 },
      { flag: "HiSlot1", quantity: 1, type_id: 21898 },
      { flag: "HiSlot2", quantity: 1, type_id: 2889 },
      { flag: "HiSlot2", quantity: 1, type_id: 21898 },
      { flag: "RigSlot0", quantity: 1, type_id: 30987 }, // Small Trimark Armor Pump I
      { flag: "RigSlot1", quantity: 1, type_id: 30987 },
      { flag: "RigSlot2", quantity: 1, type_id: 31358 }, // Small Ancillary Current Router I
      { flag: "Cargo", quantity: 600, type_id: 21898 },
    ],
  },
  {
    fittingId: 2,
    name: "Vexor – belt ratting",
    shipTypeId: 626,
    items: [
      { flag: "LoSlot0", quantity: 1, type_id: 2048 }, // Damage Control II
      { flag: "LoSlot1", quantity: 1, type_id: 1306 }, // Multispectrum Coating II
      { flag: "MedSlot0", quantity: 1, type_id: 438 }, // 1MN Afterburner II
      { flag: "DroneBay", quantity: 5, type_id: 2185 }, // Hammerhead II
      { flag: "DroneBay", quantity: 5, type_id: 2456 }, // Hobgoblin II
    ],
  },
];

/** Grants fitting access to one member and stores two saved fittings; returns how many fittings were seeded. */
export async function seedFittings(db: Db, characters: { characterId: number; role: string }[]): Promise<number> {
  const owner = characters.find((c) => c.role === "member");
  if (!owner) return 0;
  await db
    .update(esiTokens)
    .set({ scopes: sql`array_append(${esiTokens.scopes}, ${FITTINGS_SCOPE})` })
    .where(sql`${esiTokens.characterId} = ${owner.characterId} AND NOT (${FITTINGS_SCOPE} = ANY(${esiTokens.scopes}))`);
  await db.insert(fittingEsiFittings).values(
    FITTINGS.map((f) => ({
      characterId: owner.characterId,
      fittingId: f.fittingId,
      name: f.name,
      description: "",
      shipTypeId: f.shipTypeId,
      items: f.items,
    })),
  );
  return FITTINGS.length;
}
