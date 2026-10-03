import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { whConnections, whMaps, type Db } from "@/core/db";
import { COLLAPSE_GRACE_MS } from "./lifetime";

/** Keep removed connections this long for the record, then delete them. */
const REMOVED_RETENTION_MS = 30 * 24 * 3_600_000;

/**
 * Collapses connections past their expiry bound (after a grace period in which
 * they are drawn faded), drops systems left without connections by a collapse,
 * and deletes old removed rows. Plain SQL: no static data needed.
 */
export async function housekeeping(db: Db, now = new Date()) {
  const graceAgo = new Date(now.getTime() - COLLAPSE_GRACE_MS);
  const totals = { collapsed: 0, orphans: 0, purged: 0 };

  for (const { id: mapId } of await db.select({ id: whMaps.id }).from(whMaps)) {
    // One transaction per map holding the same row lock as every edit (maps.ts `mutate`), so a pilot can't connect a
    // system while it is being dropped, and polls see the cleanup and its revision bump together.
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from wh_maps where id = ${mapId} for update`);
      const collapsed = await tx
        .update(whConnections)
        .set({ removedAt: now, removedReason: "collapsed" })
        .where(
          and(eq(whConnections.mapId, mapId), isNull(whConnections.removedAt), lt(whConnections.expiresBy, graceAgo)),
        )
        .returning({ id: whConnections.id });

      const orphans = await tx.execute<{ system_id: number }>(sql`
        delete from wh_map_systems s
        using wh_maps m
        where m.id = s.map_id
          and s.map_id = ${mapId}
          and s.system_id is distinct from m.home_system_id
          and not s.pinned
          and not exists (
            select 1 from wh_connections c
            where c.map_id = s.map_id and c.removed_at is null
              and (c.a_system_id = s.system_id or c.b_system_id = s.system_id))
          and exists (
            select 1 from wh_connections c
            where c.map_id = s.map_id and c.removed_reason = 'collapsed'
              and (c.a_system_id = s.system_id or c.b_system_id = s.system_id))
          and (
            select max(c.removed_at) from wh_connections c
            where c.map_id = s.map_id and (c.a_system_id = s.system_id or c.b_system_id = s.system_id)
          ) < ${graceAgo.toISOString()}::timestamptz
        returning s.system_id`);

      if (collapsed.length || orphans.length) {
        await tx
          .update(whMaps)
          .set({ revision: sql`${whMaps.revision} + 1`, updatedAt: now })
          .where(eq(whMaps.id, mapId));
      }
      totals.collapsed += collapsed.length;
      totals.orphans += orphans.length;
    });
  }

  // Rows removed a month ago are no longer on any map, so this needs no lock.
  const purged = await db
    .delete(whConnections)
    .where(lt(whConnections.removedAt, new Date(now.getTime() - REMOVED_RETENTION_MS)))
    .returning({ id: whConnections.id });
  totals.purged = purged.length;
  return totals;
}
