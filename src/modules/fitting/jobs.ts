import { eq } from "drizzle-orm";
import { ensureTypes } from "@/core/eve/resolver";
import type { JobDefinition } from "@/core/sync/types";
import { FITTINGS_SCOPE } from "./module";
import { fittingEsiFittings, type EsiFittingItemRow } from "./schema";

export interface EsiFittingResponse {
  fitting_id: number;
  name: string;
  description?: string;
  ship_type_id: number;
  items: EsiFittingItemRow[];
}

/** Rows for a character's fittings as ESI returned them (a fitting without items is kept: it still names a hull). */
export function fittingRows(characterId: number, fittings: EsiFittingResponse[], now: Date) {
  return fittings.map((f) => ({
    characterId,
    fittingId: f.fitting_id,
    name: f.name,
    description: f.description ?? "",
    shipTypeId: f.ship_type_id,
    items: (f.items ?? []).map((i) => ({ flag: i.flag, quantity: i.quantity, type_id: i.type_id })),
    updatedAt: now,
  }));
}

/** Mirrors a character's in-game saved fittings. ESI caches them for 5 minutes; they change rarely. */
export const esiFittingsJob: JobDefinition = {
  key: "fitting.esi-fittings",
  label: (t) => t.fitting.module.jobs.esiFittings,
  module: "fitting",
  owner: "character",
  requiredScopes: [FITTINGS_SCOPE],
  intervalSeconds: 1800,
  async run({ esi, db, characterId }) {
    const id = characterId!;
    const res = await esi.get<EsiFittingResponse[]>(`/characters/${id}/fittings/`, { characterId: id });
    const rows = fittingRows(id, res.data, new Date());
    await db.transaction(async (tx) => {
      await tx.delete(fittingEsiFittings).where(eq(fittingEsiFittings.characterId, id));
      if (rows.length) await tx.insert(fittingEsiFittings).values(rows);
    });
    await ensureTypes([...new Set(rows.map((r) => r.shipTypeId))]);
    return { summary: `${rows.length} saved fitting${rows.length === 1 ? "" : "s"}`, nextRunAt: res.expiresAt };
  },
};

export const fittingJobs: JobDefinition[] = [esiFittingsJob];
