import { env } from "@/core/env";
import { getSetting } from "@/core/settings";
import type { JobDefinition } from "@/core/sync/types";
import { addDays } from "@/lib/dates";
import { reportWindow } from "./filters";
import { getKillboardStatus } from "./queries";
import { generateSituationReport } from "./report/generate";
import { planSync, syncCorporationKillmails, type KillboardSyncState } from "./sync";

/** Kills and losses of the home corporation from zKillboard (public data, no token needed). */
export const zkillSyncJob: JobDefinition = {
  key: "killboard.zkill-sync",
  label: (t) => t.killboard.module.jobs.zkillSync,
  module: "killboard",
  owner: "global",
  // zKillboard caches API responses for an hour.
  intervalSeconds: 3600,
  async run({ db, meta }) {
    const corporationId = await getSetting("corp.homeCorporationId");
    if (!corporationId) return { summary: "No home corporation configured" };
    const now = new Date();
    const plan = planSync(corporationId, meta as KillboardSyncState, now);
    const out = await syncCorporationKillmails(db, corporationId, plan);
    const state: KillboardSyncState = { corporationId, lastSyncAt: now.toISOString() };
    return {
      summary: `${out.mode === "backfill" ? "Imported" : "Checked"} ${out.fetched} killmails, ${out.inserted} new`,
      meta: { ...state },
    };
  },
};

/** Writes the weekly situation report once the latest 7-day window has closed. */
export const situationReportJob: JobDefinition = {
  key: "killboard.situation-report",
  label: (t) => t.killboard.module.jobs.situationReport,
  module: "killboard",
  owner: "global",
  intervalSeconds: 3600,
  async run({ db }) {
    const corporationId = await getSetting("corp.homeCorporationId");
    if (!corporationId) return { summary: "No home corporation configured" };
    const now = new Date();
    const { week } = reportWindow(now);
    // Only write once the sync has covered the whole window (demo data is seeded instead).
    if (!env().KEYSTAR_DEMO_MODE) {
      const status = await getKillboardStatus(corporationId);
      const windowEnd = new Date(`${addDays(week.to, 1)}T00:00:00Z`);
      if (!status.lastSyncAt || status.lastSyncAt < windowEnd) return { summary: "Waiting for the killboard sync" };
    }
    const out = await generateSituationReport(db, corporationId, now);
    if (!out.created) return { summary: `Report for ${week.from} – ${week.to} is up to date` };
    return {
      summary: `Wrote the ${week.from} – ${week.to} report (${out.source === "claude" ? "Claude" : "template"}${out.error ? `; Claude failed: ${out.error}` : ""})`,
    };
  },
};

export const killboardJobs: JobDefinition[] = [zkillSyncJob, situationReportJob];
