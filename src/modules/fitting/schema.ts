import { bigint, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** One fitted item of an ESI saved fitting, as ESI returns it (`flag` like "HiSlot0", "DroneBay", "Cargo"). */
export interface EsiFittingItemRow {
  flag: string;
  quantity: number;
  type_id: number;
}

/**
 * The in-game saved fittings of characters that share them (GET /characters/{id}/fittings), replaced on every sync.
 * Keyed by character with no foreign key to `characters`: pages only show characters still linked to the viewer.
 */
export const fittingEsiFittings = pgTable(
  "fitting_esi_fittings",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    fittingId: bigint("fitting_id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    shipTypeId: integer("ship_type_id").notNull(),
    items: jsonb("items").$type<EsiFittingItemRow[]>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.fittingId] }), index("fitting_esi_fittings_ship_idx").on(t.shipTypeId)],
);
