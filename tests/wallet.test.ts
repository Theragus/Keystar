import { describe, expect, it, vi } from "vitest";
import { EsiClient, type CachedEntry, type EsiCacheStore } from "@/core/esi/client";
import { fetchNewTransactions, type EsiWalletTransaction } from "@/modules/wallet/transactions";

function json(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

function memoryCache(): EsiCacheStore & { map: Map<string, CachedEntry> } {
  const map = new Map<string, CachedEntry>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}

function tx(id: number): EsiWalletTransaction {
  return {
    transaction_id: id,
    date: "2026-10-01T12:00:00Z",
    type_id: 16272,
    quantity: 1,
    unit_price: 100,
    is_buy: true,
    is_personal: true,
    client_id: 1,
    location_id: 60003760,
    journal_ref_id: id,
  };
}

/** Fake wallet with transaction ids 1..total, newest first, `pageSize` per request. */
function wallet(total: number, pageSize = 2500) {
  const cache = memoryCache();
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const fromId = new URL(String(url)).searchParams.get("from_id");
    const below = fromId ? Number(fromId) : total + 1;
    const ids: number[] = [];
    for (let id = below - 1; id >= 1 && ids.length < pageSize; id--) ids.push(id);
    return json(ids.map(tx), { expires: new Date(Date.now() + 3_600_000).toUTCString(), etag: `"${fromId ?? "top"}"` });
  });
  const esi = new EsiClient({
    baseUrl: "https://esi.test",
    userAgent: "Keystar/test (tests)",
    compatibilityDate: "2026-08-18",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    tokenProvider: async () => "token",
    cache,
    sleep: async () => {},
  });
  return { esi, fetchImpl, cache };
}

describe("wallet transaction import", () => {
  it("makes a single request once the history overlaps what is stored", async () => {
    const { esi, fetchImpl } = wallet(3000);
    const res = await fetchNewTransactions(esi, 1, 2900);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.rows.filter((t) => t.transaction_id > 2900)).toHaveLength(100);
    expect(res.truncated).toBe(false);
  });

  it("pages backwards with from_id until the history ends", async () => {
    const { esi, fetchImpl } = wallet(6000);
    const res = await fetchNewTransactions(esi, 1, null);
    expect(new Set(res.rows.map((t) => t.transaction_id)).size).toBe(6000);
    // 2500 + 2500 + 1000, then an empty batch ends the loop.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const cursors = fetchImpl.mock.calls.map((c) => new URL(String(c[0])).searchParams.get("from_id"));
    expect(cursors).toEqual([null, "3501", "1001", "1"]);
  });

  it("keeps wallet responses out of the ESI response cache", async () => {
    const { esi, cache } = wallet(3000);
    const res = await fetchNewTransactions(esi, 1, null);
    expect(cache.map.size).toBe(0);
    expect(res.expiresAt).not.toBeNull();
  });

  it("stops at the page limit and says so", async () => {
    const { esi, fetchImpl } = wallet(10_000, 1000);
    const res = await fetchNewTransactions(esi, 1, null, 3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(res.rows).toHaveLength(3000);
    expect(res.truncated).toBe(true);
  });

  it("ends when a cursor is ignored instead of looping", async () => {
    const fetchImpl = vi.fn(async () => json([tx(5), tx(4)]));
    const esi = new EsiClient({
      baseUrl: "https://esi.test",
      userAgent: "Keystar/test (tests)",
      compatibilityDate: "2026-08-18",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenProvider: async () => "token",
      sleep: async () => {},
    });
    const res = await fetchNewTransactions(esi, 1, null);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.rows.map((t) => t.transaction_id)).toEqual([5, 4]);
  });
});
