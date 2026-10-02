import { sql } from "drizzle-orm";
import { getDb, intelQueue, type Db } from "@/core/db";

/**
 * The zKillboard work queue: one row per pilot, shared by every scan that
 * asked for it. Asking again raises the priority but never restarts work in
 * progress; the worker removes the row once the pilot is done.
 */
export async function enqueuePilots(
  items: { characterId: number; priority: number }[],
  db: Pick<Db, "insert"> = getDb(),
): Promise<void> {
  const unique = new Map<number, number>();
  for (const i of items) unique.set(i.characterId, Math.max(unique.get(i.characterId) ?? -Infinity, i.priority));
  const rows = [...unique.entries()].map(([characterId, priority]) => ({ characterId, priority }));
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(intelQueue)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: intelQueue.characterId,
        set: { priority: sql`GREATEST(${intelQueue.priority}, excluded.priority)` },
      });
  }
}
