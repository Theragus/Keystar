import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/core/db/schema/core";
import type { HoleSize } from "./static";
import type { LifeState, MassState } from "./lifetime";

/**
 * Chain maps. The UI has one corporation map (key "corp"); the table exists
 * for the revision counter clients poll, the home system, and so later maps
 * (private, alliance) need no key changes.
 */
export const whMaps = pgTable("wh_maps", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  homeSystemId: bigint("home_system_id", { mode: "number" }),
  /** Bumped in the same transaction as every change; clients poll it. */
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Systems on a map with their position. System data comes from the bundled static data. */
export const whMapSystems = pgTable(
  "wh_map_systems",
  {
    mapId: integer("map_id")
      .notNull()
      .references(() => whMaps.id, { onDelete: "cascade" }),
    systemId: bigint("system_id", { mode: "number" }).notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    /** Moved by hand: auto-arrange leaves it alone. */
    pinned: boolean("pinned").notNull().default(false),
    label: text("label"),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mapId, t.systemId] })],
);

/**
 * Connections between two systems on a map, stored with a < b. `typeCode` is
 * the wormhole type seen on the `typeSide` end; the other end shows K162.
 * Removed and collapsed connections are kept for a while (`removedAt`).
 */
export const whConnections = pgTable(
  "wh_connections",
  {
    id: uuid("id").primaryKey(),
    mapId: integer("map_id")
      .notNull()
      .references(() => whMaps.id, { onDelete: "cascade" }),
    aSystemId: bigint("a_system_id", { mode: "number" }).notNull(),
    bSystemId: bigint("b_system_id", { mode: "number" }).notNull(),
    typeCode: text("type_code"),
    typeSide: text("type_side").$type<"a" | "b">(),
    lifeState: text("life_state").$type<LifeState>().notNull().default("fresh"),
    lifeSetAt: timestamp("life_set_at", { withTimezone: true }).notNull().defaultNow(),
    massState: text("mass_state").$type<MassState>().notNull().default("stable"),
    sizeOverride: text("size_override").$type<HoleSize>(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Upper bound of the hole's remaining life (see lifetime.ts), recomputed on every edit. */
    expiresBy: timestamp("expires_by", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedByName: text("updated_by_name"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedReason: text("removed_reason").$type<"deleted" | "collapsed">(),
  },
  (t) => [
    check("wh_connections_ordered", sql`${t.aSystemId} < ${t.bSystemId}`),
    uniqueIndex("wh_connections_active_pair_idx")
      .on(t.mapId, t.aSystemId, t.bSystemId)
      .where(sql`${t.removedAt} is null`),
    index("wh_connections_expires_idx").on(t.expiresBy).where(sql`${t.removedAt} is null`),
    index("wh_connections_removed_idx").on(t.removedAt),
  ],
);
