import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/core/db/schema/core";

/**
 * Personal market transactions (GET /characters/{id}/wallet/transactions),
 * imported only for characters whose owner granted the opt-in wallet scope.
 * ESI keeps 30 days; Keystar keeps what it has seen. `user_id` is the account
 * that owned the character at import time: wallet data is only ever shown to
 * that account, so it doesn't follow a sold character to its new owner.
 */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    /** Unique per wallet; the two sides of a trade between your own characters share it. */
    transactionId: bigint("transaction_id", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
    isBuy: boolean("is_buy").notNull(),
    clientId: bigint("client_id", { mode: "number" }).notNull(),
    locationId: bigint("location_id", { mode: "number" }).notNull(),
    journalRefId: bigint("journal_ref_id", { mode: "number" }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.transactionId] }),
    index("wallet_transactions_user_date_idx").on(t.userId, t.date),
  ],
);
