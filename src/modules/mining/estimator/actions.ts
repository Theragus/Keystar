"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { assertPermission } from "@/core/auth/dal";
import { eveTypes, getDb, typeValues } from "@/core/db";
import { getEsi } from "@/core/esi";
import { syncPrices } from "@/core/eve/prices";
import { ensureTypes } from "@/core/eve/resolver";
import { getSetting } from "@/core/settings";
import { MINING_PERMISSIONS } from "../module";

export interface SurveyPrice {
  typeId: number;
  name: string;
  unitPrice: number | null;
  basis: string | null;
}

/**
 * Values the ore types from a pasted survey scan with Keystar's configured
 * price source. Unknown names are resolved through ESI; types that have never
 * been priced are priced live (and then kept fresh like any other type).
 */
export async function priceSurveyTypes(names: string[]): Promise<Record<string, SurveyPrice>> {
  await assertPermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 200);
  if (!wanted.length) return {};

  const db = getDb();
  const lower = wanted.map((n) => n.toLowerCase());
  const findTypes = () =>
    db
      .select({ typeId: eveTypes.typeId, name: eveTypes.name })
      .from(eveTypes)
      .where(inArray(sql`lower(${eveTypes.name})`, lower));

  let types = await findTypes();
  const known = new Set(types.map((t) => t.name.toLowerCase()));
  const unknown = wanted.filter((n) => !known.has(n.toLowerCase()));
  if (unknown.length) {
    const res = await getEsi()
      .post<{ inventory_types?: { id: number; name: string }[] }>("/universe/ids", unknown)
      .catch(() => null);
    const ids = res?.data.inventory_types?.map((t) => t.id) ?? [];
    if (ids.length) {
      await ensureTypes(ids);
      types = await findTypes();
    }
  }

  const source = await getSetting("mining.valuationSource");
  const typeIds = types.map((t) => t.typeId);
  const loadValues = () =>
    typeIds.length
      ? db
          .select()
          .from(typeValues)
          .where(and(eq(typeValues.source, source), inArray(typeValues.typeId, typeIds)))
      : Promise.resolve([]);

  let values = await loadValues();
  const unpriced = typeIds.filter((id) => !values.some((v) => v.typeId === id));
  if (unpriced.length) {
    await syncPrices(db, getEsi(), unpriced).catch(() => undefined);
    values = await loadValues();
  }

  const result: Record<string, SurveyPrice> = {};
  for (const t of types) {
    const v = values.find((x) => x.typeId === t.typeId);
    result[t.name.toLowerCase()] = { typeId: t.typeId, name: t.name, unitPrice: v?.unitPrice ?? null, basis: v?.basis ?? null };
  }
  return result;
}
