import { describe, expect, it, vi } from "vitest";
import {
  EsiClient,
  EsiForbiddenError,
  EsiRateLimitedError,
  routePattern,
  type CachedEntry,
  type EsiCacheStore,
} from "@/core/esi/client";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function memoryCache(): EsiCacheStore & { map: Map<string, CachedEntry> } {
  const map = new Map<string, CachedEntry>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}

function client(handler: Handler, extra: Partial<ConstructorParameters<typeof EsiClient>[0]> = {}) {
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {}));
  const esi = new EsiClient({
    baseUrl: "https://esi.test",
    userAgent: "Keystar/test (tests)",
    compatibilityDate: "2026-08-18",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
    ...extra,
  });
  return { esi, fetchImpl };
}

const later = () => new Date(Date.now() + 60_000).toUTCString();

describe("EsiClient", () => {
  it("sends compatibility date, user agent and bearer token", async () => {
    const tokenProvider = vi.fn(async () => "access-123");
    const { esi, fetchImpl } = client(() => json({ ok: true }), { tokenProvider });
    await esi.get("/characters/1/mining", { characterId: 1 });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Compatibility-Date"]).toBe("2026-08-18");
    expect(headers["User-Agent"]).toContain("Keystar");
    expect(headers.Authorization).toBe("Bearer access-123");
  });

  it("follows X-Pages and concatenates results", async () => {
    const { esi, fetchImpl } = client((url) => {
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      return json([page * 10, page * 10 + 1], { headers: { "x-pages": "3" } });
    });
    const res = await esi.getAllPages<number>("/corporation/1/mining/observers");
    expect(res.data).toEqual([10, 11, 20, 21, 30, 31]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("serves fresh cache entries without a request", async () => {
    const cache = memoryCache();
    const { esi, fetchImpl } = client(() => json([1], { headers: { expires: later(), etag: '"a"' } }), { cache });
    await esi.get("/markets/prices");
    const second = await esi.get("/markets/prices");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual([1]);
  });

  it("revalidates stale entries with If-None-Match and reuses the body on 304", async () => {
    const cache = memoryCache();
    cache.map.set("0:GET /markets/prices", { etag: '"v1"', body: [42], pages: 1, expiresAt: new Date(0) });
    const { esi, fetchImpl } = client(() => new Response(null, { status: 304, headers: { expires: later() } }), { cache });
    const res = await esi.get<number[]>("/markets/prices");
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["If-None-Match"]).toBe('"v1"');
    expect(res.notModified).toBe(true);
    expect(res.data).toEqual([42]);
  });

  it("refreshes the token once on 401", async () => {
    const tokenProvider = vi.fn(async (_id: number, opts?: { forceRefresh?: boolean }) => (opts?.forceRefresh ? "new" : "old"));
    const { esi } = client(
      (_url, init) =>
        (init.headers as Record<string, string>).Authorization === "Bearer new"
          ? json({ ok: true })
          : json({ error: "token is expired" }, { status: 401 }),
      { tokenProvider },
    );
    const res = await esi.get<{ ok: boolean }>("/characters/1/roles", { characterId: 1 });
    expect(res.data.ok).toBe(true);
    expect(tokenProvider).toHaveBeenLastCalledWith(1, { forceRefresh: true });
  });

  it("maps 403 to EsiForbiddenError", async () => {
    const { esi } = client(() => json({ error: "Character does not have required role(s)" }, { status: 403 }), {
      tokenProvider: async () => "t",
    });
    await expect(esi.get("/corporation/1/mining/observers", { characterId: 1 })).rejects.toBeInstanceOf(EsiForbiddenError);
  });

  it("backs off on 429 using Retry-After and pauses that group", async () => {
    let calls = 0;
    const { esi } = client(() => {
      calls++;
      return json({ error: "rate limited" }, { status: 429, headers: { "retry-after": "120", "x-ratelimit-group": "char-industry" } });
    });
    const err = await esi.get("/characters/1/mining").catch((e) => e);
    expect(err).toBeInstanceOf(EsiRateLimitedError);
    expect((err as EsiRateLimitedError).retryAt.getTime()).toBeGreaterThan(Date.now() + 100_000);
    // Further requests to the paused route fail fast without hitting ESI.
    await expect(esi.get("/characters/2/mining")).rejects.toBeInstanceOf(EsiRateLimitedError);
    expect(calls).toBe(1);
  });

  it("pauses for the error limit only when ESI reports it", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => void sleeps.push(ms);
    const quiet = client(() => json({ ok: 1 }), { sleep });
    await quiet.esi.get("/status");
    await quiet.esi.get("/status", { noCache: true });
    expect(sleeps).toEqual([]);

    const low = client(() => json({ ok: 1 }, { headers: { "x-esi-error-limit-remain": "5", "x-esi-error-limit-reset": "10" } }), { sleep });
    await low.esi.get("/status");
    await low.esi.get("/status", { noCache: true });
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(9_000);
  });

  it("retries transient 5xx errors", async () => {
    let calls = 0;
    const { esi } = client(() => (++calls < 3 ? json({ error: "bad gateway" }, { status: 502 }) : json({ ok: 1 })));
    const res = await esi.get<{ ok: number }>("/status");
    expect(res.data.ok).toBe(1);
    expect(calls).toBe(3);
  });

  it("normalises routes for rate-limit grouping", () => {
    expect(routePattern("/characters/2120000001/mining")).toBe("/characters/{id}/mining");
    expect(routePattern("/corporation/98765432/mining/observers/1045000000001")).toBe(
      "/corporation/{id}/mining/observers/{id}",
    );
  });
});
