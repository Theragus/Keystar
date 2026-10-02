import { sql } from "drizzle-orm";
import { env } from "@/core/env";
import type { JobDefinition } from "@/core/sync/types";
import {
  DIGEST_KEEP_NEWEST,
  DIGEST_RETENTION_DAYS,
  PILOT_RETENTION_DAYS,
  RESCORE_WINDOW_MS,
  SCAN_RETENTION_DAYS,
} from "./constants";
import { allianceContactsJob, corporationContactsJob } from "./contacts";
import { SCAN_WORKER_JOB } from "./scans";
import { demoSource, zkillSource } from "./source";
import { runScanWorker } from "./worker";

/** Idle workers look for retries this often (new scans wake the job right away). */
const IDLE_POLL_MS = 60_000;

/** Reads pilots from zKillboard for open scans: statistics first, then their newest killmails. */
export const scanWorkerJob: JobDefinition = {
  key: SCAN_WORKER_JOB,
  label: "Threat intel (zKillboard)",
  module: "intel",
  owner: "global",
  intervalSeconds: 2,
  async run({ db, esi, log }) {
    const demo = env().KEYSTAR_DEMO_MODE;
    const out = await runScanWorker({ db, esi, log }, { source: demo ? demoSource({ db }) : zkillSource(), offline: demo });
    const idleUntil = out.nextDueAt && out.nextDueAt.getTime() > Date.now() ? out.nextDueAt : new Date(Date.now() + IDLE_POLL_MS);
    return {
      summary: out.processed ? `${out.processed} pilot steps, ${out.remaining} waiting` : "Idle",
      nextRunAt: out.remaining > 0 ? null : idleUntil,
    };
  },
};

/** Retention: old killmail digests, pilots nobody scanned for months, old scans. */
export const intelHousekeepingJob: JobDefinition = {
  key: "intel.housekeeping",
  label: "Threat intel housekeeping",
  module: "intel",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const digest = await db.execute(sql`
      DELETE FROM intel_pilot_killmails k
      WHERE k.killmail_time < now() - make_interval(days => ${DIGEST_RETENTION_DAYS})
        AND NOT EXISTS (
          SELECT 1 FROM (
            SELECT killmail_id FROM intel_pilot_killmails n
            WHERE n.character_id = k.character_id ORDER BY n.killmail_time DESC LIMIT ${DIGEST_KEEP_NEWEST}
          ) newest WHERE newest.killmail_id = k.killmail_id)`);
    const pilots = await db.execute(sql`
      DELETE FROM intel_pilots p
      WHERE p.last_requested_at < now() - make_interval(days => ${PILOT_RETENTION_DAYS})
        AND NOT EXISTS (SELECT 1 FROM intel_queue q WHERE q.character_id = p.character_id)`);
    await db.execute(sql`
      DELETE FROM intel_pilot_killmails k
      WHERE NOT EXISTS (SELECT 1 FROM intel_pilots p WHERE p.character_id = k.character_id)`);
    const scans = await db.execute(sql`DELETE FROM intel_scans WHERE created_at < now() - make_interval(days => ${SCAN_RETENTION_DAYS})`);
    // Work nobody is waiting for any more (its scans are gone or long finished).
    const queue = await db.execute(sql`
      DELETE FROM intel_queue q
      WHERE q.requested_at < now() - make_interval(secs => ${RESCORE_WINDOW_MS / 1000})
        AND NOT EXISTS (
          SELECT 1 FROM intel_scan_pilots sp JOIN intel_scans s ON s.id = sp.scan_id
          WHERE sp.character_id = q.character_id AND s.created_at > now() - make_interval(secs => ${RESCORE_WINDOW_MS / 1000}))`);
    await db.execute(sql`DELETE FROM intel_ai_notes WHERE scan_id IS NULL AND created_at < now() - interval '90 days'`);
    return {
      summary: `Pruned ${digest.count ?? 0} killmail digests, ${pilots.count ?? 0} pilots, ${scans.count ?? 0} scans, ${queue.count ?? 0} stale queue rows`,
    };
  },
};

export const intelJobs: JobDefinition[] = [scanWorkerJob, intelHousekeepingJob, corporationContactsJob, allianceContactsJob];
