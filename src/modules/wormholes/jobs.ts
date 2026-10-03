import type { JobDefinition } from "@/core/sync/types";
import { housekeeping } from "./housekeeping";

/** Collapses expired wormholes, drops systems they left stranded, and prunes old removed connections. */
export const wormholesHousekeepingJob: JobDefinition = {
  key: "wormholes.housekeeping",
  label: (t) => t.wormholes.module.jobs.housekeeping,
  module: "wormholes",
  owner: "global",
  intervalSeconds: 300,
  async run({ db }) {
    const r = await housekeeping(db);
    return { summary: `${r.collapsed} collapsed, ${r.orphans} systems removed, ${r.purged} purged` };
  },
};

export const wormholesJobs: JobDefinition[] = [wormholesHousekeepingJob];
