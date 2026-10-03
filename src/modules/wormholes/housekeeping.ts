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
  const changed = new Set<number>();

  const collapsed = await db
    .update(whConnections)
    .set({ removedAt: now, removedReason: "collapsed" })
    .where(and(isNull(whConnections.removedAt), lt(whConnections.expiresBy, graceAgo)))
    .returning({ mapId: whConnections.mapId });
  for (const c of collapsed) changed.add(c.mapId);

  const orphans = await db.execute<{ map_id: number }>(sql`
    delete from wh_map_systems s
    using wh_maps m
    where m.id = s.map_id
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
    returning s.map_id`);
  for (const o of orphans) changed.add(Number(o.map_id));

  const purged = await db
    .delete(whConnections)
    .where(lt(whConnections.removedAt, new Date(now.getTime() - REMOVED_RETENTION_MS)))
    .returning({ id: whConnections.id });

  for (const mapId of changed) {
    await db
      .update(whMaps)
      .set({ revision: sql`${whMaps.revision} + 1`, updatedAt: now })
      .where(eq(whMaps.id, mapId));
  }
  return { collapsed: collapsed.length, orphans: orphans.length, purged: purged.length };
}
