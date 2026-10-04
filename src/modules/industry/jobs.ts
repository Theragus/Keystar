import { inArray, sql } from "drizzle-orm";
import type { Db } from "@/core/db";
import { EsiError, type EsiClient } from "@/core/esi/client";
import { ensureNames, ensureSystems, ensureTypes } from "@/core/eve/resolver";
import { createLogger } from "@/core/logger";
import type { JobDefinition } from "@/core/sync/types";
import { mapLimit } from "@/lib/concurrency";
import { isStructureId, jobRows, type EsiIndustryJob } from "./activities";
import { INDUSTRY_JOBS_SCOPE } from "./module";
import { industryJobs, industryLocations } from "./schema";

const log = createLogger("industry");
const CHUNK = 500;
/** A structure that could not be named (no docking access, or gone) is tried again after this long. */
const RETRY_UNRESOLVED_MS = 7 * 86_400_000;

interface EsiStation {
  name: string;
  system_id: number;
  type_id: number;
}

interface EsiStructure {
  name: string;
  solar_system_id: number;
  type_id?: number;
}

/**
 * Names the stations and structures of `locationIds` that are not known yet (or whose last attempt failed a while
 * ago). Structures are read with the character's token: ESI only names structures the character may dock at, so a
 * failure is stored (name null) and retried later rather than on every sync.
 */
export async function ensureIndustryLocations(esi: EsiClient, db: Db, characterId: number, locationIds: Iterable<number>): Promise<void> {
  const wanted = [...new Set([...locationIds].filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!wanted.length) return;
  const known = await db
    .select({ id: industryLocations.locationId, name: industryLocations.name, resolvedAt: industryLocations.resolvedAt })
    .from(industryLocations)
    .where(inArray(industryLocations.locationId, wanted));
  const retryBefore = Date.now() - RETRY_UNRESOLVED_MS;
  const settled = new Set(known.filter((r) => r.name !== null || r.resolvedAt.getTime() > retryBefore).map((r) => r.id));
  const missing = wanted.filter((id) => !settled.has(id));
  const systems = new Set<number>();
  const types = new Set<number>();

  await mapLimit(missing, 4, async (locationId) => {
    const structure = isStructureId(locationId);
    let row: typeof industryLocations.$inferInsert = { locationId, kind: structure ? "structure" : "station", resolvedAt: new Date() };
    try {
      if (structure) {
        const res = await esi.get<EsiStructure>(`/universe/structures/${locationId}`, { characterId });
        row = { ...row, name: res.data.name, solarSystemId: res.data.solar_system_id, typeId: res.data.type_id ?? null };
      } else {
        const res = await esi.get<EsiStation>(`/universe/stations/${locationId}`);
        row = { ...row, name: res.data.name, solarSystemId: res.data.system_id, typeId: res.data.type_id };
      }
    } catch (err) {
      // 403: no docking access with this token; 404: gone. Anything else is an ESI problem worth failing the job for.
      if (!(err instanceof EsiError) || (err.status !== 403 && err.status !== 404)) throw err;
      log.info("Could not name industry location", { locationId, characterId, status: err.status });
    }
    if (row.solarSystemId) systems.add(row.solarSystemId);
    if (row.typeId) types.add(row.typeId);
    await db
      .insert(industryLocations)
      .values(row)
      .onConflictDoUpdate({
        target: industryLocations.locationId,
        set: {
          resolvedAt: row.resolvedAt,
          // A failed retry must not erase a name learnt earlier.
          ...(row.name ? { name: row.name, solarSystemId: row.solarSystemId, typeId: row.typeId } : {}),
        },
      });
  });
  await ensureSystems(systems);
  await ensureTypes(types);
}

export const characterIndustryJobsJob: JobDefinition = {
  key: "industry.character-jobs",
  label: (t) => t.industry.module.jobs.characterJobs,
  module: "industry",
  owner: "character",
  requiredScopes: [INDUSTRY_JOBS_SCOPE],
  // ESI caches the list for five minutes.
  intervalSeconds: 300,
  async run({ esi, db, characterId }) {
    const id = characterId!;
    const res = await esi.get<EsiIndustryJob[]>(`/characters/${id}/industry/jobs`, {
      characterId: id,
      query: { include_completed: true },
    });
    const now = new Date();
    const rows = jobRows(id, res.data, now);
    if (!res.notModified) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db
          .insert(industryJobs)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: industryJobs.jobId,
            set: {
              characterId: sql`excluded.character_id`,
              status: sql`excluded.status`,
              endDate: sql`excluded.end_date`,
              pauseDate: sql`excluded.pause_date`,
              completedDate: sql`excluded.completed_date`,
              completedCharacterId: sql`excluded.completed_character_id`,
              successfulRuns: sql`excluded.successful_runs`,
              cost: sql`excluded.cost`,
              updatedAt: sql`excluded.updated_at`,
            },
            setWhere: sql`(${industryJobs.status}, ${industryJobs.endDate}, ${industryJobs.pauseDate}, ${industryJobs.completedDate},
                ${industryJobs.successfulRuns}, ${industryJobs.cost})
              IS DISTINCT FROM (excluded.status, excluded.end_date, excluded.pause_date, excluded.completed_date,
                excluded.successful_runs, excluded.cost)`,
          });
      }
    }
    await ensureTypes([...rows.map((r) => r.blueprintTypeId), ...rows.flatMap((r) => (r.productTypeId ? [r.productTypeId] : []))]);
    await ensureNames(rows.flatMap((r) => [r.installerId, ...(r.completedCharacterId ? [r.completedCharacterId] : [])]));
    await ensureIndustryLocations(esi, db, id, rows.map((r) => r.locationId));
    const running = rows.filter((r) => r.status === "active" || r.status === "paused" || r.status === "ready").length;
    return {
      summary: `${running} running job${running === 1 ? "" : "s"}, ${rows.length} listed${res.notModified ? " (unchanged)" : ""}`,
      nextRunAt: res.expiresAt,
    };
  },
};

/** Named apart from the `industryJobs` table. */
export const industrySyncJobs: JobDefinition[] = [characterIndustryJobsJob];
