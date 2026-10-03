import { inArray, sql } from "drizzle-orm";
import { eveTypes, marketPrices, typeValueHistory, typeValues, type Db } from "@/core/db";
import type { PriceSource, ValuationSource } from "@/core/db/schema/eve";
import type { EsiClient } from "@/core/esi/client";
import { mapLimit } from "@/lib/concurrency";

export const THE_FORGE_REGION_ID = 10000002;
export const JITA_44_STATION_ID = 60003760;

/** Choices for the ore valuation setting; labels are in `t.eve.valuationSources`. */
export const VALUATION_SOURCES: ValuationSource[] = ["jita_buy", "jita_sell", "jita_split", "esi_average"];

interface MarketOrder {
  is_buy_order: boolean;
  location_id: number;
  price: number;
}

/** Best Jita 4-4 buy/sell for one type from ESI regional orders. */
export function bestJitaPrices(orders: MarketOrder[]): { buy: number | null; sell: number | null } {
  let buy: number | null = null;
  let sell: number | null = null;
  for (const o of orders) {
    if (o.location_id !== JITA_44_STATION_ID) continue;
    if (o.is_buy_order) buy = buy === null ? o.price : Math.max(buy, o.price);
    else sell = sell === null ? o.price : Math.min(sell, o.price);
  }
  return { buy, sell };
}

type PriceMap = Map<number, Partial<Record<PriceSource, number>>>;

function pick(prices: PriceMap, typeId: number, source: ValuationSource): number | null {
  const p = prices.get(typeId);
  if (!p) return null;
  switch (source) {
    case "jita_buy":
      return p.jita_buy ?? null;
    case "jita_sell":
      return p.jita_sell ?? null;
    case "jita_split":
      if (p.jita_buy && p.jita_sell) return (p.jita_buy + p.jita_sell) / 2;
      return p.jita_buy ?? p.jita_sell ?? null;
    case "esi_average":
      return p.esi_average ?? null;
  }
}

export interface ValuationType {
  typeId: number;
  portionSize: number | null;
  compressedTypeId: number | null;
  compressedPortionSize: number | null;
}

/**
 * Per-unit value of a type under a valuation source with fallbacks:
 * direct market price → compressed variant price ÷ compression ratio →
 * ESI average → ESI adjusted price.
 */
export function resolveUnitValue(
  type: ValuationType,
  source: ValuationSource,
  prices: PriceMap,
): { unitPrice: number; basis: string } | null {
  const direct = pick(prices, type.typeId, source);
  if (direct && direct > 0) return { unitPrice: direct, basis: "direct" };

  if (type.compressedTypeId && type.portionSize && type.compressedPortionSize) {
    const ratio = type.portionSize / type.compressedPortionSize;
    const compressed = pick(prices, type.compressedTypeId, source);
    if (compressed && compressed > 0 && ratio > 0) return { unitPrice: compressed / ratio, basis: "compressed" };
  }

  const avg = prices.get(type.typeId)?.esi_average;
  if (avg && avg > 0) return { unitPrice: avg, basis: "esi_average" };
  const adjusted = prices.get(type.typeId)?.esi_adjusted;
  if (adjusted && adjusted > 0) return { unitPrice: adjusted, basis: "esi_adjusted" };
  return null;
}

/**
 * Refreshes market prices for the given types (plus compressed variants) and
 * recomputes their valuations, snapshotting today's values for history.
 */
export async function syncPrices(db: Db, esi: EsiClient, interestTypeIds: number[]): Promise<string> {
  if (!interestTypeIds.length) return "No priced types yet";

  const types = await db
    .select({ typeId: eveTypes.typeId, portionSize: eveTypes.portionSize, compressedTypeId: eveTypes.compressedTypeId })
    .from(eveTypes)
    .where(inArray(eveTypes.typeId, interestTypeIds));
  const compressedIds = types.map((t) => t.compressedTypeId).filter((id): id is number => !!id);
  const compressedRows = compressedIds.length
    ? await db
        .select({ typeId: eveTypes.typeId, portionSize: eveTypes.portionSize })
        .from(eveTypes)
        .where(inArray(eveTypes.typeId, compressedIds))
    : [];
  const compressedPortion = new Map(compressedRows.map((r) => [r.typeId, r.portionSize]));
  const allIds = [...new Set([...types.map((t) => t.typeId), ...compressedIds])];

  const prices: PriceMap = new Map();
  const set = (typeId: number, source: PriceSource, price: number | null | undefined) => {
    if (price == null || !(price > 0)) return;
    prices.set(typeId, { ...(prices.get(typeId) ?? {}), [source]: price });
  };

  // ESI global average/adjusted prices: one request for every type.
  const avg = await esi.get<{ type_id: number; average_price?: number; adjusted_price?: number }[]>("/markets/prices");
  const wanted = new Set(allIds);
  for (const p of avg.data) {
    if (!wanted.has(p.type_id)) continue;
    set(p.type_id, "esi_average", p.average_price);
    set(p.type_id, "esi_adjusted", p.adjusted_price);
  }

  // Jita 4-4 best buy/sell from The Forge regional orders (market-order group: 12k tokens / 15 min).
  await mapLimit(allIds, 8, async (typeId) => {
    const orders = await esi.getAllPages<MarketOrder>(`/markets/${THE_FORGE_REGION_ID}/orders`, {
      query: { order_type: "all", type_id: typeId },
    });
    const best = bestJitaPrices(orders.data);
    set(typeId, "jita_buy", best.buy);
    set(typeId, "jita_sell", best.sell);
  });

  const priceRows = [...prices.entries()].flatMap(([typeId, p]) =>
    Object.entries(p).map(([source, price]) => ({ typeId, source: source as PriceSource, price: price!, updatedAt: new Date() })),
  );
  if (priceRows.length) {
    await db
      .insert(marketPrices)
      .values(priceRows)
      .onConflictDoUpdate({
        target: [marketPrices.typeId, marketPrices.source],
        set: { price: sql`excluded.price`, updatedAt: sql`excluded.updated_at` },
      });
  }

  const today = new Date().toISOString().slice(0, 10);
  const sources: ValuationSource[] = ["jita_buy", "jita_sell", "jita_split", "esi_average"];
  const valueRows: (typeof typeValues.$inferInsert)[] = [];
  for (const t of types) {
    for (const source of sources) {
      const v = resolveUnitValue(
        {
          typeId: t.typeId,
          portionSize: t.portionSize,
          compressedTypeId: t.compressedTypeId,
          compressedPortionSize: t.compressedTypeId ? (compressedPortion.get(t.compressedTypeId) ?? null) : null,
        },
        source,
        prices,
      );
      if (v) valueRows.push({ typeId: t.typeId, source, unitPrice: v.unitPrice, basis: v.basis, updatedAt: new Date() });
    }
  }
  if (valueRows.length) {
    await db
      .insert(typeValues)
      .values(valueRows)
      .onConflictDoUpdate({
        target: [typeValues.typeId, typeValues.source],
        set: { unitPrice: sql`excluded.unit_price`, basis: sql`excluded.basis`, updatedAt: sql`excluded.updated_at` },
      });
    await db
      .insert(typeValueHistory)
      .values(valueRows.map((r) => ({ typeId: r.typeId, source: r.source, date: today, unitPrice: r.unitPrice })))
      .onConflictDoUpdate({
        target: [typeValueHistory.typeId, typeValueHistory.source, typeValueHistory.date],
        set: { unitPrice: sql`excluded.unit_price` },
      });
  }
  return `Priced ${types.length} types (${allIds.length} incl. compressed)`;
}
