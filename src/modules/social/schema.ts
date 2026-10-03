import { bigint, boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/core/db/schema/core";

export type MailRecipientType = "alliance" | "character" | "corporation" | "mailing_list";

export interface MailRecipient {
  id: number;
  type: MailRecipientType;
}

/**
 * EVE mail (GET /characters/{id}/mail and /mail/{mail_id}), imported only for
 * characters whose owner granted the opt-in mail scope. One row per mailbox:
 * a corporation mail received by three alts is three rows with the same
 * `mail_id`. `user_id` is the account that owned the character at import time;
 * mail is only ever shown to that account, so it doesn't follow a sold
 * character to its new owner.
 */
export const mailMessages = pgTable(
  "mail_messages",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    mailId: bigint("mail_id", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromId: bigint("from_id", { mode: "number" }).notNull(),
    subject: text("subject").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    /** Label ids: 1 Inbox, 2 Sent, 4 [Corp], 8 [Alliance], higher ones are the character's own labels. */
    labels: bigint("labels", { mode: "number" }).array().notNull().default([]),
    recipients: jsonb("recipients").$type<MailRecipient[]>().notNull().default([]),
    /** EVE HTML as ESI returns it; null until the worker has downloaded it. */
    body: text("body"),
    bodyFetchedAt: timestamp("body_fetched_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.mailId] }),
    index("mail_messages_user_sent_idx").on(t.userId, t.sentAt),
    index("mail_messages_user_mail_idx").on(t.userId, t.mailId),
  ],
);

/** Mail labels per character (GET /characters/{id}/mail/labels), built-in ones included. */
export const mailLabels = pgTable(
  "mail_labels",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    labelId: bigint("label_id", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** One of ESI's 18 fixed label colours (#rrggbb). */
    color: text("color"),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.labelId] }), index("mail_labels_user_idx").on(t.userId)],
);

/**
 * Mailing lists a character is subscribed to (GET /characters/{id}/mail/lists):
 * the only source of mailing-list names, /universe/names can't resolve them.
 */
export const mailLists = pgTable(
  "mail_lists",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    mailingListId: bigint("mailing_list_id", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.mailingListId] }), index("mail_lists_user_idx").on(t.userId)],
);
