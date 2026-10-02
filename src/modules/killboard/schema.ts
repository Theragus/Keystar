import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Killmails involving the home corporation, as published by zKillboard (the
 * ESI killmail plus zKillboard's valuation). Corporation/alliance ids are the
 * ones recorded at the time of the kill, so history stays attributed to the
 * corporation a pilot flew for back then. Killmails are immutable; only the
 * zKillboard values are refreshed when a killmail is seen again.
 */
export const killmails = pgTable(
  "killmails",
  {
    killmailId: bigint("killmail_id", { mode: "number" }).primaryKey(),
    hash: text("hash").notNull(),
    killmailTime: timestamp("killmail_time", { withTimezone: true }).notNull(),
    solarSystemId: bigint("solar_system_id", { mode: "number" }).notNull(),
    /** Null for structures and deployables without a pilot. */
    victimCharacterId: bigint("victim_character_id", { mode: "number" }),
    victimCorporationId: bigint("victim_corporation_id", { mode: "number" }),
    victimAllianceId: bigint("victim_alliance_id", { mode: "number" }),
    victimShipTypeId: integer("victim_ship_type_id").notNull(),
    damageTaken: integer("damage_taken").notNull().default(0),
    attackerCount: integer("attacker_count").notNull(),
    totalValue: doublePrecision("total_value").notNull().default(0),
    fittedValue: doublePrecision("fitted_value").notNull().default(0),
    destroyedValue: doublePrecision("destroyed_value").notNull().default(0),
    droppedValue: doublePrecision("dropped_value").notNull().default(0),
    points: integer("points").notNull().default(0),
    npc: boolean("npc").notNull().default(false),
    solo: boolean("solo").notNull().default(false),
    awox: boolean("awox").notNull().default(false),
    labels: text("labels").array().notNull().default([]),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("killmails_time_idx").on(t.killmailTime),
    index("killmails_victim_corp_idx").on(t.victimCorporationId, t.killmailTime),
  ],
);

/** Every attacker on a killmail (players and NPCs), in ESI order. */
export const killmailAttackers = pgTable(
  "killmail_attackers",
  {
    killmailId: bigint("killmail_id", { mode: "number" }).notNull(),
    idx: smallint("idx").notNull(),
    characterId: bigint("character_id", { mode: "number" }),
    corporationId: bigint("corporation_id", { mode: "number" }),
    allianceId: bigint("alliance_id", { mode: "number" }),
    factionId: bigint("faction_id", { mode: "number" }),
    shipTypeId: integer("ship_type_id"),
    weaponTypeId: integer("weapon_type_id"),
    damageDone: integer("damage_done").notNull().default(0),
    finalBlow: boolean("final_blow").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.killmailId, t.idx] }),
    index("killmail_attackers_corp_idx").on(t.corporationId, t.killmailId),
    index("killmail_attackers_char_idx").on(t.characterId),
  ],
);

/**
 * Weekly situation reports, one per corporation and 7-day window. `content`
 * holds the structured report (see report/types.ts); `facts` the numbers it
 * was written from, so a report can be audited or re-rendered later.
 */
export const killboardReports = pgTable(
  "killboard_reports",
  {
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    periodTo: date("period_to", { mode: "string" }).notNull(),
    /** "claude" or "template". */
    source: text("source").notNull(),
    model: text("model"),
    content: jsonb("content").notNull(),
    facts: jsonb("facts").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.periodFrom, t.periodTo] })],
);
