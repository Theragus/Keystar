import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Saved appraisals: a snapshot of items and Jita prices at the time of the
 * appraisal, shareable by its unguessable id. See appraisal/types.ts for the
 * JSON shapes.
 */
export const appraisals = pgTable(
  "appraisals",
  {
    id: text("id").primaryKey(),
    createdBy: uuid("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Percentage applied to the totals (e.g. 90 for a buyback offer). */
    pricePercent: integer("price_percent").notNull().default(100),
    items: jsonb("items").notNull(),
    totals: jsonb("totals").notNull(),
    unparsed: jsonb("unparsed").notNull(),
    input: text("input").notNull(),
  },
  (t) => [index("appraisals_created_by_idx").on(t.createdBy, t.createdAt)],
);
