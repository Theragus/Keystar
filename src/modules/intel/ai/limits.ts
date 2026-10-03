import { and, count, eq, gt } from "drizzle-orm";
import { getDb, intelAiNotes, type Db } from "@/core/db";

/** Claude calls per user and per instance in a rolling hour (each call costs money on the instance's key). */
export const USER_HOURLY_LIMIT = 20;
export const INSTANCE_HOURLY_LIMIT = 120;

export async function claudeBudget(userId: string | null, db: Db = getDb(), now = new Date()): Promise<{ ok: boolean; reason: string | null }> {
  const since = new Date(now.getTime() - 3600_000);
  const [instance] = await db
    .select({ n: count() })
    .from(intelAiNotes)
    .where(and(eq(intelAiNotes.source, "claude"), gt(intelAiNotes.createdAt, since)));
  if ((instance?.n ?? 0) >= INSTANCE_HOURLY_LIMIT) return { ok: false, reason: "The instance's hourly Claude budget is used up" };
  if (userId) {
    const [mine] = await db
      .select({ n: count() })
      .from(intelAiNotes)
      .where(and(eq(intelAiNotes.source, "claude"), eq(intelAiNotes.createdBy, userId), gt(intelAiNotes.createdAt, since)));
    if ((mine?.n ?? 0) >= USER_HOURLY_LIMIT) return { ok: false, reason: `You reached ${USER_HOURLY_LIMIT} Claude notes this hour` };
  }
  return { ok: true, reason: null };
}
