import { sql } from "drizzle-orm";
import { gatecheckWars } from "@/core/db";
import { EsiError } from "@/core/esi/client";
import type { JobDefinition } from "@/core/sync/types";
import { mapLimit } from "@/lib/concurrency";
import { warRow, type EsiWar } from "./classify";
import { GATE_HISTORY_DAYS, OTHER_KILL_DAYS } from "./constants";
import type { GatecheckWarInsert } from "./schema";

/** Wars looked up per run at most. */
const WARS_PER_RUN = 100;
/** Stop starting lookups once the shared ESI client has fewer errors left than this. */
const ERROR_HEADROOM = 50;

/**
 * Retention: kills at gates for GATE_HISTORY_DAYS (camp history), other kills
 * for OTHER_KILL_DAYS. The kills themselves are
 * stored by the killboard's live feed job (see ingest.ts).
 */
export const gatecheckHousekeepingJob: JobDefinition = {
  key: "gatecheck.housekeeping",
  label: (t) => t.gatecheck.module.jobs.housekeeping,
  module: "gatecheck",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const gate = await db.execute(sql`
      DELETE FROM gatecheck_kills WHERE gate_id IS NOT NULL AND killmail_time < now() - make_interval(days => ${GATE_HISTORY_DAYS})`);
    const other = await db.execute(sql`
      DELETE FROM gatecheck_kills WHERE gate_id IS NULL AND killmail_time < now() - make_interval(days => ${OTHER_KILL_DAYS})`);
    const wars = await db.execute(sql`
      DELETE FROM gatecheck_wars w WHERE NOT EXISTS (SELECT 1 FROM gatecheck_kills k WHERE k.war_id = w.war_id)`);
    return {
      summary: `Deleted ${gate.count ?? 0} gate kills, ${other.count ?? 0} other kills past retention and ${wars.count ?? 0} wars`,
    };
  },
};

/**
 * Who fights the wars on stored kills, from ESI /wars/{id}/ (public): new
 * wars first, running wars again every 6 hours (allies join). The gate check
 * counts high-sec war kills between others as no camp, but kills in the home
 * corporation's or alliance's wars as one.
 */
export const gatecheckWarsJob: JobDefinition = {
  key: "gatecheck.wars",
  label: (t) => t.gatecheck.module.jobs.wars,
  module: "gatecheck",
  owner: "global",
  intervalSeconds: 600,
  async run({ db, esi, log }) {
    const due = await db.execute<{ war_id: string | number }>(sql`
      SELECT k.war_id FROM (SELECT DISTINCT war_id FROM gatecheck_kills WHERE war_id IS NOT NULL) k
      LEFT JOIN gatecheck_wars w ON w.war_id = k.war_id
      WHERE w.war_id IS NULL
         OR (w.fetched_at < now() - interval '6 hours' AND (w.finished_at IS NULL OR w.finished_at > now()))
      ORDER BY w.fetched_at NULLS FIRST
      LIMIT ${WARS_PER_RUN}`);
    const ids = [...due].map((r) => Number(r.war_id));
    const rows: GatecheckWarInsert[] = [];
    await mapLimit(ids, 4, async (warId) => {
      const remain = esi.stats().errorLimitRemain;
      if (remain !== null && remain < ERROR_HEADROOM) return;
      try {
        rows.push(warRow((await esi.get<EsiWar>(`/wars/${warId}`)).data, new Date()));
      } catch (err) {
        // A war ESI does not know: store it as over and without participants, so it is not asked again.
        if (err instanceof EsiError && (err.status === 404 || err.status === 422))
          rows.push({ warId, aggressorId: null, defenderId: null, allyIds: [], finishedAt: new Date(), fetchedAt: new Date() });
        else log.warn("Could not look up war", { warId, error: (err as Error).message });
      }
    });
    if (rows.length)
      await db
        .insert(gatecheckWars)
        .values(rows)
        .onConflictDoUpdate({
          target: gatecheckWars.warId,
          set: {
            aggressorId: sql`excluded.aggressor_id`,
            defenderId: sql`excluded.defender_id`,
            allyIds: sql`excluded.ally_ids`,
            finishedAt: sql`excluded.finished_at`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    return { summary: `Looked up ${rows.length} of ${ids.length} wars` };
  },
};

export const gatecheckJobs: JobDefinition[] = [gatecheckHousekeepingJob, gatecheckWarsJob];
