import { and, count, eq, gt } from "drizzle-orm";
import { getDb, intelAiNotes, type Db } from "@/core/db";
import { INSTANCE_HOURLY_LIMIT, USER_HOURLY_LIMIT } from "../constants";
import { BUDGET_ERRORS } from "../text";

/** `reason` is a budget code (BUDGET_ERRORS) that the page writes out in the reader's language. */
export async function claudeBudget(userId: string | null, db: Db = getDb(), now = new Date()): Promise<{ ok: boolean; reason: string | null }> {
  const since = new Date(now.getTime() - 3600_000);
  const [instance] = await db
    .select({ n: count() })
    .from(intelAiNotes)
    .where(and(eq(intelAiNotes.source, "claude"), gt(intelAiNotes.createdAt, since)));
  if ((instance?.n ?? 0) >= INSTANCE_HOURLY_LIMIT) return { ok: false, reason: BUDGET_ERRORS.instance };
  if (userId) {
    const [mine] = await db
      .select({ n: count() })
      .from(intelAiNotes)
      .where(and(eq(intelAiNotes.source, "claude"), eq(intelAiNotes.createdBy, userId), gt(intelAiNotes.createdAt, since)));
    if ((mine?.n ?? 0) >= USER_HOURLY_LIMIT) return { ok: false, reason: BUDGET_ERRORS.user };
  }
  return { ok: true, reason: null };
}
