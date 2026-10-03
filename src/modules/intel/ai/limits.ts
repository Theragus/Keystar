import { and, count, eq, gt, sql } from "drizzle-orm";
import { getDb, intelAiNotes, type Db } from "@/core/db";
import { INSTANCE_HOURLY_LIMIT, USER_HOURLY_LIMIT } from "../constants";
import { BUDGET_ERRORS } from "../text";

/** Serialises budget checks so concurrent requests cannot all see the last free slot. */
const BUDGET_LOCK = 727_276;

type Reader = Pick<Db, "select">;

/**
 * Claude calls in the last hour, per instance and per user, against the
 * limits. Every call counts, failed ones too (`claude_called`). `reason` is a
 * budget code (BUDGET_ERRORS) that the page writes out in the reader's language.
 */
export async function claudeBudget(userId: string | null, db: Reader = getDb(), now = new Date()): Promise<{ ok: boolean; reason: string | null }> {
  const since = new Date(now.getTime() - 3600_000);
  const [instance] = await db
    .select({ n: count() })
    .from(intelAiNotes)
    .where(and(eq(intelAiNotes.claudeCalled, true), gt(intelAiNotes.createdAt, since)));
  if ((instance?.n ?? 0) >= INSTANCE_HOURLY_LIMIT) return { ok: false, reason: BUDGET_ERRORS.instance };
  if (userId) {
    const [mine] = await db
      .select({ n: count() })
      .from(intelAiNotes)
      .where(and(eq(intelAiNotes.claudeCalled, true), eq(intelAiNotes.createdBy, userId), gt(intelAiNotes.createdAt, since)));
    if ((mine?.n ?? 0) >= USER_HOURLY_LIMIT) return { ok: false, reason: BUDGET_ERRORS.user };
  }
  return { ok: true, reason: null };
}

/**
 * Claims a Claude call: checks the budget and inserts the note as "pending"
 * in one locked transaction, so the call counts before it is made. The caller
 * completes the row with what Claude (or the template) wrote.
 */
export async function reserveClaudeCall(
  db: Db,
  note: Omit<typeof intelAiNotes.$inferInsert, "source" | "claudeCalled" | "content">,
  budgetUser: string | null,
  now: Date,
): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BUDGET_LOCK})`);
    const budget = await claudeBudget(budgetUser, tx, now);
    if (!budget.ok) return { ok: false as const, reason: budget.reason! };
    const [row] = await tx
      .insert(intelAiNotes)
      .values({ ...note, source: "pending", claudeCalled: true, content: {}, createdAt: now })
      .returning({ id: intelAiNotes.id });
    return { ok: true as const, id: row.id };
  });
}
