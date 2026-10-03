import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EsiClient, type CachedEntry, type EsiCacheStore } from "@/core/esi/client";
import {
  isInternalTransfer,
  JOURNAL_CATEGORIES,
  journalCategory,
  journalCategorySqlCase,
  journalFlow,
  KNOWN_REF_TYPES,
} from "@/modules/wallet/corp/classify";
import { detectGap, fetchNewCorpTransactions, fetchNewJournal, type EsiCorpJournalEntry } from "@/modules/wallet/corp/fetch";
import { corpWalletQueryString, parseCorpWalletFilters } from "@/modules/wallet/corp/filters";
import { buildWalletReport } from "@/modules/wallet/corp/report";

const CORP = 98000001;
const DAY = 86_400_000;

function json(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

function memoryCache(): EsiCacheStore & { map: Map<string, CachedEntry> } {
  const map = new Map<string, CachedEntry>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}

function client(fetchImpl: (url: string) => Promise<Response>) {
  const cache = memoryCache();
  const fn = vi.fn(fetchImpl);
  const esi = new EsiClient({
    baseUrl: "https://esi.test",
    userAgent: "Keystar/test (tests)",
    compatibilityDate: "2026-08-18",
    fetchImpl: fn as unknown as typeof fetch,
    tokenProvider: async () => "token",
    cache,
    sleep: async () => {},
  });
  return { esi, fetchImpl: fn, cache };
}

function entry(id: number, extra: Partial<EsiCorpJournalEntry> = {}): EsiCorpJournalEntry {
  return { id, date: "2026-10-01T12:00:00Z", ref_type: "bounty_prizes", description: "", amount: 1000, ...extra };
}

/** Fake journal with ids 1..total, newest first, `pageSize` per page and ESI's 10-page cap. */
function journal(total: number, pageSize = 1000) {
  const pages = Math.min(10, Math.max(1, Math.ceil(total / pageSize)));
  return client(async (url) => {
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    const ids: number[] = [];
    if (page <= 10) for (let id = total - (page - 1) * pageSize; id >= 1 && ids.length < pageSize; id--) ids.push(id);
    return json(ids.map((id) => entry(id)), {
      "x-pages": String(pages),
      expires: new Date(Date.now() + 3_600_000).toUTCString(),
    });
  });
}

describe("corporation journal import", () => {
  it("stops at the first page that reaches stored entries", async () => {
    const { esi, fetchImpl } = journal(5000);
    const res = await fetchNewJournal(esi, CORP, 1, 7, 4500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.overlapped).toBe(true);
    expect(res.truncated).toBe(false);
    expect(res.rows.filter((e) => e.id > 4500)).toHaveLength(500);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).pathname).toBe(`/corporations/${CORP}/wallets/1/journal`);
  });

  it("reads every page on the first import", async () => {
    const { esi, fetchImpl } = journal(2500);
    const res = await fetchNewJournal(esi, CORP, 2, 7, null);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(res.rows).toHaveLength(2500);
    expect(res.rows[0].id).toBe(2500);
    expect(res.overlapped).toBe(false);
    expect(res.truncated).toBe(false);
  });

  it("flags a history cut off at ESI's ten-page cap", async () => {
    const { esi, fetchImpl } = journal(15_000);
    const res = await fetchNewJournal(esi, CORP, 1, 7, 100);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(res.rows).toHaveLength(10_000);
    expect(res.truncated).toBe(true);
  });

  it("de-duplicates entries that shift onto the next page while paging", async () => {
    // A new entry (4) arrives between page 1 and page 2, pushing 2 onto page 2 again.
    const { esi } = client(async (url) => {
      const page = new URL(url).searchParams.get("page");
      return json(page === "2" ? [entry(2), entry(1)] : [entry(3), entry(2)], { "x-pages": "2" });
    });
    const res = await fetchNewJournal(esi, CORP, 1, 7, null);
    expect(res.rows.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it("keeps corporation wallet responses out of the ESI response cache", async () => {
    const { esi, cache } = journal(10);
    await fetchNewJournal(esi, CORP, 1, 7, null);
    expect(cache.map.size).toBe(0);
  });

  it("pages corporation transactions with from_id and notices the overlap", async () => {
    const { esi, fetchImpl } = client(async (url) => {
      const fromId = new URL(url).searchParams.get("from_id");
      const below = fromId ? Number(fromId) : 6;
      const ids = [below - 1, below - 2].filter((id) => id >= 1);
      return json(
        ids.map((id) => ({
          transaction_id: id,
          date: "2026-10-01T12:00:00Z",
          type_id: 34,
          quantity: 1,
          unit_price: 5,
          is_buy: true,
          client_id: 9,
          location_id: 60003760,
          journal_ref_id: id,
        })),
      );
    });
    const res = await fetchNewCorpTransactions(esi, CORP, 3, 7, 2);
    expect(res.rows.map((t) => t.transaction_id)).toEqual([5, 4, 3, 2]);
    expect(res.overlapped).toBe(true);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).pathname).toBe(`/corporations/${CORP}/wallets/3/transactions`);
  });
});

describe("archive gaps", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const base = { now, overlapped: false, truncated: false, oldestFetchedAt: ago(20) };

  it("is never a gap on the first import or when fetched entries reach stored ones", () => {
    expect(detectGap({ ...base, lastSyncedAt: null, newestStoredAt: null })).toBeNull();
    expect(detectGap({ ...base, lastSyncedAt: ago(60), newestStoredAt: ago(60), overlapped: true })).toBeNull();
  });

  it("is no gap when the last import is inside ESI's window, even without new entries", () => {
    expect(detectGap({ ...base, lastSyncedAt: ago(5), newestStoredAt: ago(25), oldestFetchedAt: null })).toBeNull();
  });

  it("records a gap after more than a month without imports", () => {
    const gap = detectGap({ ...base, lastSyncedAt: ago(45), newestStoredAt: ago(46) });
    expect(gap).not.toBeNull();
    expect(gap!.from.getTime()).toBe(ago(45).getTime() - 3_600_000);
    expect(gap!.to).toEqual(ago(30));
  });

  it("records a gap when the page cap cut off entries newer than the archive", () => {
    const gap = detectGap({ ...base, lastSyncedAt: ago(3), newestStoredAt: ago(3), truncated: true, oldestFetchedAt: ago(1) });
    expect(gap).toEqual({ from: ago(3), to: ago(1) });
  });
});

describe("journal classification", () => {
  const refTypes: string[] = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "fixtures/esi-journal-ref-types.json"), "utf8"),
  );

  it("gives every ESI ref type exactly one category", () => {
    expect([...KNOWN_REF_TYPES].sort()).toEqual([...refTypes].sort());
    expect(new Set(KNOWN_REF_TYPES).size).toBe(KNOWN_REF_TYPES.length);
  });

  it("files unknown ref types under other", () => {
    expect(journalCategory("office_rental_fee")).toBe("structures");
    expect(journalCategory("bounty_prizes")).toBe("bounties");
    expect(journalCategory("something_ccp_added_tomorrow")).toBe("other");
  });

  it("keeps the SQL category CASE in step with the TypeScript map", () => {
    const sqlCase = journalCategorySqlCase("j.ref_type");
    for (const category of JOURNAL_CATEGORIES.filter((c) => c !== "other")) {
      const whens = sqlCase.match(new RegExp(`WHEN j\\.ref_type IN \\(([^)]*)\\) THEN '${category}'`));
      const listed = whens![1].split(", ").map((s) => s.slice(1, -1));
      expect(listed.every((r) => journalCategory(r) === category)).toBe(true);
    }
    expect(sqlCase.endsWith("ELSE 'other' END")).toBe(true);
  });

  it("treats a withdrawal from the corporation to itself as a transfer between divisions", () => {
    const base = { refType: "corporation_account_withdrawal", amount: -5e6, firstPartyId: CORP, secondPartyId: CORP };
    expect(isInternalTransfer(base, CORP)).toBe(true);
    expect(journalFlow(base, CORP)).toBe("transfer");
    expect(journalFlow({ ...base, amount: 5e6 }, CORP)).toBe("transfer");
    // A director paying a member out of the corporation wallet is an expense.
    expect(journalFlow({ ...base, secondPartyId: 2112000001 }, CORP)).toBe("expense");
    expect(journalFlow({ ...base, refType: "player_donation", amount: 1e6, firstPartyId: 2112000001 }, CORP)).toBe("income");
    expect(journalFlow({ ...base, refType: "market_escrow", amount: 0 }, CORP)).toBe("none");
  });
});

describe("corporation wallet filters", () => {
  it("parses divisions, categories and flow, and drops what it doesn't know", () => {
    const f = parseCorpWalletFilters(
      { from: "2026-09-01", to: "2026-09-30", divisions: "3,1,9,x,3", categories: "market,nope,other", flow: "expense" },
      "2026-10-03",
    );
    expect(f).toMatchObject({ divisions: [1, 3], categories: ["market", "other"], flow: "expense", bucket: "day", page: 1 });
    expect(corpWalletQueryString(f)).toBe("from=2026-09-01&to=2026-09-30&divisions=1%2C3&categories=market%2Cother&flow=expense");
  });

  it("defaults to the last 30 days", () => {
    expect(parseCorpWalletFilters({}, "2026-10-03")).toMatchObject({ from: "2026-09-04", to: "2026-10-03", divisions: [] });
  });
});

describe("corporation wallet report", () => {
  const divisions = [
    { division: 1, name: null, balance: 1e9, balanceAt: new Date("2026-10-03T11:00:00Z") },
    { division: 2, name: "SRP", balance: 2e8, balanceAt: new Date("2026-10-03T11:00:00Z") },
  ];
  const flows = [
    { date: "2026-09-29", division: 1, income: 100, expenses: 30, transfersIn: 0, transfersOut: 50 },
    { date: "2026-09-29", division: 2, income: 0, expenses: 20, transfersIn: 50, transfersOut: 0 },
    { date: "2026-10-01", division: 1, income: 40, expenses: 0, transfersIn: 0, transfersOut: 0 },
  ];

  it("sums income and expenses without transfers, per division and per bucket", () => {
    const r = buildWalletReport({ from: "2026-09-28", to: "2026-10-03", bucket: "day", selected: [], flows, divisions });
    expect(r.totals).toEqual({ balance: 1.2e9, income: 140, expenses: 50, net: 90, transfers: 50 });
    expect(r.buckets).toHaveLength(6);
    expect(r.buckets.find((b) => b.start === "2026-09-29")).toMatchObject({ income: 100, expenses: 50, net: 50 });
    expect(r.divisions).toHaveLength(7);
    expect(r.divisions[0]).toMatchObject({ division: 1, income: 140, expenses: 30, net: 110, transfersNet: -50 });
    expect(r.divisions[1]).toMatchObject({ division: 2, name: "SRP", income: 0, expenses: 20, net: -20, transfersNet: 50 });
    expect(r.divisions[2]).toMatchObject({ division: 3, balance: null, net: 0 });
  });

  it("limits everything to the selected divisions", () => {
    const r = buildWalletReport({ from: "2026-09-28", to: "2026-10-03", bucket: "week", selected: [2], flows, divisions });
    expect(r.totals).toEqual({ balance: 2e8, income: 0, expenses: 20, net: -20, transfers: 50 });
    expect(r.divisions.map((d) => d.division)).toEqual([2]);
    // 28 Sep – 3 Oct falls into one ISO week, which runs on to Sunday 4 Oct.
    expect(r.buckets.map((b) => [b.start, b.end, b.partial])).toEqual([["2026-09-28", "2026-10-04", true]]);
  });
});
