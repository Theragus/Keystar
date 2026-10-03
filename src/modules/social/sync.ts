import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/core/db";
import type { EsiClient } from "@/core/esi/client";
import { ensureNames, ensureTypes } from "@/core/eve/resolver";
import { collectLinks, parseEveHtml } from "./eve-html";
import { deletedInGame, fetchMailBody, fetchMailHeaders, fetchMailingLists, fetchMailLabels } from "./esi";
import { linkIds } from "./links";
import { mailLabels, mailLists, mailMessages } from "./schema";

/** Pages of 50 headers read on the first import (about 1000 mails). */
export const MAX_HEADER_PAGES = 20;
/**
 * Bodies downloaded per run. Mail shares ESI's `char-social` budget (600
 * tokens per 15 minutes, 2 per request); at a 5-minute interval this leaves
 * plenty of room for headers, labels and lists.
 */
export const BODY_BATCH = 60;
const CHUNK = 500;

export interface MailboxSyncResult {
  stillOwned: boolean;
  added: number;
  removed: number;
  bodies: number;
  truncated: boolean;
  expiresAt: Date | null;
}

/**
 * Imports one character's mailbox for the account that owns it: labels,
 * mailing lists, headers (new mail, read state, labels, in-game deletions)
 * and a batch of bodies. Writes are tied to `userId`, so mail never follows a
 * character to a new owner.
 */
export async function syncMailbox(db: Db, esi: EsiClient, characterId: number, userId: string): Promise<MailboxSyncResult> {
  const mine = and(eq(mailMessages.characterId, characterId), eq(mailMessages.userId, userId));
  const [newest] = await db.select({ id: sql<string | null>`max(${mailMessages.mailId})` }).from(mailMessages).where(mine);
  const newestStoredId = newest?.id == null ? null : Number(newest.id);

  const [labels, lists, headers] = await Promise.all([
    fetchMailLabels(esi, characterId),
    fetchMailingLists(esi, characterId),
    fetchMailHeaders(esi, characterId, newestStoredId, MAX_HEADER_PAGES),
  ]);

  const result = await db.transaction(async (tx) => {
    // Removing or transferring the character meanwhile must not bring its mail back.
    const [current] = await tx.execute<{ user_id: string }>(
      sql`SELECT user_id FROM characters WHERE character_id = ${characterId} FOR SHARE`,
    );
    if (current?.user_id !== userId) return null;

    await tx.delete(mailLabels).where(and(eq(mailLabels.characterId, characterId), eq(mailLabels.userId, userId)));
    if (labels.length) await tx.insert(mailLabels).values(labels.map((l) => ({ ...l, characterId, userId }))).onConflictDoNothing();
    await tx.delete(mailLists).where(and(eq(mailLists.characterId, characterId), eq(mailLists.userId, userId)));
    if (lists.length) await tx.insert(mailLists).values(lists.map((l) => ({ ...l, characterId, userId }))).onConflictDoNothing();

    const stored = headers.windowMin === null ? [] : await tx.select({ id: mailMessages.mailId }).from(mailMessages).where(mine);
    const gone = deletedInGame(
      stored.map((r) => r.id),
      headers,
    );
    for (let i = 0; i < gone.length; i += CHUNK) {
      await tx.delete(mailMessages).where(and(mine, inArray(mailMessages.mailId, gone.slice(i, i + CHUNK))));
    }

    const rows = headers.rows.map((h) => ({ characterId, userId, ...h }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx
        .insert(mailMessages)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [mailMessages.characterId, mailMessages.mailId],
          set: { isRead: sql`excluded.is_read`, labels: sql`excluded.labels`, userId: sql`excluded.user_id` },
        });
    }
    return { removed: gone.length };
  });
  if (!result) return { stillOwned: false, added: 0, removed: 0, bodies: 0, truncated: headers.truncated, expiresAt: headers.expiresAt };

  // The same mail in another of the owner's mailboxes (a corp mail to three alts) costs no request.
  await db.execute(sql`
    UPDATE mail_messages m SET body = s.body, body_fetched_at = s.body_fetched_at
    FROM mail_messages s
    WHERE m.character_id = ${characterId} AND m.user_id = ${userId}::uuid AND m.body IS NULL
      AND s.user_id = m.user_id AND s.mail_id = m.mail_id AND s.character_id <> m.character_id AND s.body IS NOT NULL`);

  const pending = await db
    .select({ mailId: mailMessages.mailId })
    .from(mailMessages)
    .where(and(mine, isNull(mailMessages.body)))
    .orderBy(desc(mailMessages.mailId))
    .limit(BODY_BATCH);
  const bodies: string[] = [];
  let removed = result.removed;
  for (const { mailId } of pending) {
    const fetched = await fetchMailBody(esi, characterId, mailId);
    const row = and(mine, eq(mailMessages.mailId, mailId));
    if (!fetched) {
      await db.delete(mailMessages).where(row);
      removed++;
      continue;
    }
    await db
      .update(mailMessages)
      .set({
        body: fetched.body,
        bodyFetchedAt: new Date(),
        ...(fetched.isRead === null ? {} : { isRead: fetched.isRead }),
        ...(fetched.labels === null ? {} : { labels: fetched.labels }),
      })
      .where(row);
    bodies.push(fetched.body);
  }

  // Names for senders, recipients and linked entities; types (with group/category) for links and fittings.
  const links = linkIds(bodies.flatMap((b) => collectLinks(parseEveHtml(b))));
  await ensureNames([
    ...headers.rows.map((h) => h.fromId),
    ...headers.rows.flatMap((h) => h.recipients.filter((r) => r.type !== "mailing_list").map((r) => r.id)),
    ...links.itemIds,
  ]);
  await ensureTypes(links.typeIds);

  const added = headers.rows.filter((h) => newestStoredId === null || h.mailId > newestStoredId).length;
  return { stillOwned: true, added, removed, bodies: bodies.length, truncated: headers.truncated, expiresAt: headers.expiresAt };
}
