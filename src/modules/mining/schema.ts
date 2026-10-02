import { bigint, date, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Personal mining ledgers (GET /characters/{id}/mining). ESI only keeps 30
 * days; Keystar keeps everything it has ever seen. ESI aggregates per day, so
 * a row's quantity grows during the day and is overwritten on each sync.
 */
export const miningCharacterLedger = pgTable(
  "mining_character_ledger",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    solarSystemId: bigint("solar_system_id", { mode: "number" }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.date, t.solarSystemId, t.typeId] }),
    index("mining_char_ledger_date_idx").on(t.date),
  ],
);

/** Corporation mining observers (moon drills on Upwell refineries). */
export const miningObservers = pgTable("mining_observers", {
  observerId: bigint("observer_id", { mode: "number" }).primaryKey(),
  corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
  observerType: text("observer_type").notNull(),
  lastUpdated: date("last_updated", { mode: "string" }),
  /** Filled from /corporations/{id}/structures when a Station_Manager token is available. */
  name: text("name"),
  solarSystemId: bigint("solar_system_id", { mode: "number" }),
  structureTypeId: integer("structure_type_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Observer ledgers: who mined what at a corp refinery, including non-members. */
export const miningObserverLedger = pgTable(
  "mining_observer_ledger",
  {
    observerId: bigint("observer_id", { mode: "number" }).notNull(),
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    recordedCorporationId: bigint("recorded_corporation_id", { mode: "number" }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.observerId, t.characterId, t.date, t.typeId] }),
    index("mining_obs_ledger_date_idx").on(t.date),
    index("mining_obs_ledger_char_idx").on(t.characterId),
  ],
);
