import { lt } from "drizzle-orm";
import { appraisals } from "@/core/db";
import type { JobDefinition } from "@/core/sync/types";
import { APPRAISAL_RETENTION_DAYS } from "./appraisal/appraise";

/** Retention: appraisals older than APPRAISAL_RETENTION_DAYS (their share links stop working). */
export const tradeHousekeepingJob: JobDefinition = {
  key: "trade.housekeeping",
  label: (t) => t.trade.module.jobs.housekeeping,
  module: "trade",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const deleted = await db
      .delete(appraisals)
      .where(lt(appraisals.createdAt, new Date(Date.now() - APPRAISAL_RETENTION_DAYS * 24 * 3600 * 1000)))
      .returning({ id: appraisals.id });
    return { summary: `Pruned ${deleted.length} appraisals` };
  },
};

export const tradeJobs: JobDefinition[] = [tradeHousekeepingJob];
