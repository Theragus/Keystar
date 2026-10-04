import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/core/db/schema/core";
import type { ValuationSource } from "@/core/db/schema/eve";

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

/**
 * Mining activity measured from ledger growth between syncs (see activity.ts):
 * the character's ledger grew by `quantity` of `type_id` in `solar_system_id`
 * on ledger day `date` during [window_start, window_end). Used for active
 * hours, ISK/hour and mining ops. `solar_system_id` 0: recorded before the
 * system was kept (Keystar 0.12 and earlier).
 */
export const miningActivity = pgTable(
  "mining_activity",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    solarSystemId: bigint("solar_system_id", { mode: "number" }).notNull().default(0),
    typeId: integer("type_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.windowEnd, t.date, t.solarSystemId, t.typeId] }),
    index("mining_activity_char_date_idx").on(t.characterId, t.date),
    index("mining_activity_window_idx").on(t.windowEnd),
  ],
);

/** Per character: since when ledger growth is observed, and the latest observation. */
export const miningActivityCoverage = pgTable("mining_activity_coverage", {
  characterId: bigint("character_id", { mode: "number" }).primaryKey(),
  since: timestamp("since", { withTimezone: true }).notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  lastGrowthAt: timestamp("last_growth_at", { withTimezone: true }),
});

/*
 * Personal mining P&L. Everything below belongs to one Keystar account and is
 * only ever shown to it; rows go when the account is deleted.
 */
const owner = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/** Income adjustment: ore income is valued at this % of the dashboard valuation (e.g. 90 for buyback). */
export const miningPnlSettings = pgTable("mining_pnl_settings", {
  userId: owner().primaryKey(),
  incomeRatePct: doublePrecision("income_rate_pct").notNull().default(100),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per character: count auto-tagged wallet purchases without reviewing them (off by default). */
export const miningPnlCharacters = pgTable(
  "mining_pnl_characters",
  {
    userId: owner(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    autoIncludeExpenses: boolean("auto_include_expenses").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.characterId] })],
);

/** What an ore actually sells for: overrides the % rate for that type (optionally for a date range). */
export const miningPnlPriceRules = pgTable(
  "mining_pnl_price_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: owner(),
    typeId: integer("type_id").notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mining_pnl_price_rules_user_idx").on(t.userId, t.typeId)],
);

/** The user's decision on a wallet purchase: its category and whether it counts (null = automatic). */
export const miningPnlTxOverrides = pgTable(
  "mining_pnl_tx_overrides",
  {
    userId: owner(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    transactionId: bigint("transaction_id", { mode: "number" }).notNull(),
    category: text("category"),
    included: boolean("included"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.characterId, t.transactionId] })],
);

/**
 * Costs ESI can't see (PLEX/Omega for alts, contracts …). `spread_days` > 1
 * spreads the amount evenly over that many days from `date`, so a year of
 * Omega doesn't land on a single day.
 */
export const miningPnlEntries = pgTable(
  "mining_pnl_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: owner(),
    /** null: account-wide. */
    characterId: bigint("character_id", { mode: "number" }),
    date: date("date", { mode: "string" }).notNull(),
    spreadDays: smallint("spread_days").notNull().default(1),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    amount: doublePrecision("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mining_pnl_entries_user_date_idx").on(t.userId, t.date)],
);

/*
 * Mining ops: a time frame (and optionally systems, ore classes, a tracked
 * fleet or a calendar event) whose mining is valued and split between the
 * pilots who took part. See ops/attribution.ts and docs/architecture.md.
 */
export type MiningOpParticipation = "anyone" | "fleet" | "calendar";
export type MiningOpSplitMode = "contribution" | "equal";

export const miningOps = pgTable(
  "mining_ops",
  {
    id: text("id").primaryKey(),
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** null: still running. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Empty: any system. */
    solarSystemIds: bigint("solar_system_ids", { mode: "number" }).array().notNull().default([]),
    /** Empty: every ore class (see core/eve/ore.ts). */
    oreClasses: text("ore_classes").array().notNull().default([]),
    participation: text("participation").$type<MiningOpParticipation>().notNull().default("anyone"),
    fleetId: bigint("fleet_id", { mode: "number" }),
    calendarEventId: bigint("calendar_event_id", { mode: "number" }),
    valuationSource: text("valuation_source").$type<ValuationSource>().notNull(),
    /** % of the valuation paid for the ore (e.g. 90 for a buyback). */
    ratePct: doublePrecision("rate_pct").notNull().default(100),
    /** % of the payout pool the corporation keeps. */
    corpCutPct: doublePrecision("corp_cut_pct").notNull().default(0),
    splitMode: text("split_mode").$type<MiningOpSplitMode>().notNull().default("contribution"),
    notes: text("notes").notNull().default(""),
    createdBy: uuid("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when the shares were frozen into mining_op_shares. */
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedByName: text("finalized_by_name"),
  },
  (t) => [index("mining_ops_corp_start_idx").on(t.corporationId, t.startsAt)],
);

/**
 * Per-pilot decisions on an op: the organiser includes someone the
 * participation mode would leave out (a hauler without ore) or excludes a solo
 * miner; `self` marks a pilot's own "not part of this op".
 */
export const miningOpParticipants = pgTable(
  "mining_op_participants",
  {
    opId: text("op_id")
      .notNull()
      .references(() => miningOps.id, { onDelete: "cascade" }),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    mode: text("mode").$type<"included" | "excluded">().notNull(),
    self: boolean("self").notNull().default(false),
    reason: text("reason").notNull().default(""),
    setByName: text("set_by_name"),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.opId, t.characterId] })],
);

/** Frozen result of a finalized op, one row per payee (a pilot's characters together). */
export const miningOpShares = pgTable(
  "mining_op_shares",
  {
    opId: text("op_id")
      .notNull()
      .references(() => miningOps.id, { onDelete: "cascade" }),
    /** The payee: the account's main character, or the character itself when it has no account. */
    payeeCharacterId: bigint("payee_character_id", { mode: "number" }).notNull(),
    userId: uuid("user_id"),
    characterIds: bigint("character_ids", { mode: "number" }).array().notNull(),
    volume: doublePrecision("volume").notNull(),
    grossValue: doublePrecision("gross_value").notNull(),
    shareValue: doublePrecision("share_value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.opId, t.payeeCharacterId] })],
);

/** Ore behind the frozen shares, with the unit price used. */
export const miningOpShareTypes = pgTable(
  "mining_op_share_types",
  {
    opId: text("op_id")
      .notNull()
      .references(() => miningOps.id, { onDelete: "cascade" }),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    unitVolume: doublePrecision("unit_volume").notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
  },
  (t) => [primaryKey({ columns: [t.opId, t.characterId, t.typeId] })],
);
