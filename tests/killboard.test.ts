import { describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/core/env";
import { killboardWindows, parseKillboardFilters, rangeLabel, reportWindow, ycYear } from "@/modules/killboard/filters";
import { claudeReport, sanitizeReport } from "@/modules/killboard/report/claude";
import { writeReport } from "@/modules/killboard/report/generate";
import { parseMarkup, stripMarkup } from "@/modules/killboard/report/markup";
import { readinessOf, templateReport } from "@/modules/killboard/report/template";
import type { ReportFacts } from "@/modules/killboard/report/types";
import { planSync } from "@/modules/killboard/sync";
import { monthsBetween, toRows, windowPath, ZkillClient, ZkillError, type ZkillKillmail } from "@/modules/killboard/zkill";

const entry = (id: number, overrides: Partial<ZkillKillmail> = {}): ZkillKillmail => ({
  killmail_id: id,
  killmail_time: "2026-09-30T21:30:56Z",
  solar_system_id: 30002813,
  victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 1200 },
  attackers: [
    { character_id: 1, corporation_id: 100, ship_type_id: 17843, weapon_type_id: 2185, damage_done: 1000, final_blow: true },
    { faction_id: 500010, ship_type_id: 0, damage_done: 200, final_blow: false },
  ],
  zkb: { hash: "abc", totalValue: 88_712_058.5, fittedValue: 1, droppedValue: 2, destroyedValue: 3, points: 6, npc: false, solo: true, awox: false, labels: ["pvp"] },
  ...overrides,
});

describe("zKillboard client", () => {
  it("builds window paths within zKillboard's limits", () => {
    expect(windowPath({ pastSeconds: 604800 })).toBe("pastSeconds/604800/");
    expect(windowPath({ pastSeconds: 10 })).toBe("pastSeconds/3600/");
    expect(windowPath({ pastSeconds: 5000 })).toBe("pastSeconds/7200/");
    expect(windowPath({ pastSeconds: 10_000_000 })).toBe("pastSeconds/604800/");
    expect(windowPath({ year: 2026, month: 9 })).toBe("year/2026/month/9/");
  });

  it("pages until an empty page, with a User-Agent, and drops malformed entries", async () => {
    const pages = [[entry(1), entry(2), { nonsense: true }], [entry(3)], []];
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("test-agent");
      return new Response(JSON.stringify(pages[urls.length - 1] ?? []), { status: 200 });
    });
    const client = new ZkillClient({ userAgent: "test-agent", fetch: fetchImpl as typeof fetch, sleep: async () => {} });
    const ids: number[] = [];
    for await (const page of client.corporationKillmails(100, { pastSeconds: 604800 })) ids.push(...page.map((k) => k.killmail_id));
    expect(ids).toEqual([1, 2, 3]);
    expect(urls).toEqual([
      "https://zkillboard.com/api/corporationID/100/pastSeconds/604800/page/1/",
      "https://zkillboard.com/api/corporationID/100/pastSeconds/604800/page/2/",
      "https://zkillboard.com/api/corporationID/100/pastSeconds/604800/page/3/",
    ]);
  });

  it("retries 429/5xx, then fails on other errors", async () => {
    const sleeps: number[] = [];
    const responses = [new Response("", { status: 429, headers: { "retry-after": "2" } }), new Response("[]", { status: 200 })];
    const client = new ZkillClient({
      userAgent: "ua",
      fetch: (async () => responses.shift()!) as typeof fetch,
      sleep: async (ms) => void sleeps.push(ms),
    });
    await expect(client.get("/api/x/")).resolves.toEqual([]);
    expect(sleeps).toContain(2000);

    const forbidden = new ZkillClient({ userAgent: "ua", fetch: (async () => new Response("", { status: 403 })) as typeof fetch, sleep: async () => {} });
    await expect(forbidden.get("/api/x/")).rejects.toBeInstanceOf(ZkillError);

    const errorBody = new ZkillClient({
      userAgent: "ua",
      fetch: (async () => new Response(JSON.stringify({ error: "invalid modifiers" }), { status: 200 })) as typeof fetch,
      sleep: async () => {},
    });
    await expect(errorBody.get("/api/x/")).rejects.toThrow("invalid modifiers");
  });

  it("spaces requests out", async () => {
    const sleeps: number[] = [];
    const client = new ZkillClient({
      userAgent: "ua",
      minIntervalMs: 1000,
      fetch: (async () => new Response("[]")) as typeof fetch,
      sleep: async (ms) => void sleeps.push(ms),
    });
    await client.get("/a/");
    await client.get("/b/");
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThan(900);
  });

  it("flattens a killmail into rows", () => {
    const { killmail, attackers } = toRows(entry(42));
    expect(killmail).toMatchObject({
      killmailId: 42,
      hash: "abc",
      victimCharacterId: 9,
      victimCorporationId: 555,
      victimAllianceId: null,
      attackerCount: 2,
      totalValue: 88_712_058.5,
      solo: true,
      labels: ["pvp"],
    });
    expect(killmail.killmailTime.toISOString()).toBe("2026-09-30T21:30:56.000Z");
    expect(attackers[0]).toMatchObject({ idx: 0, characterId: 1, corporationId: 100, finalBlow: true });
    expect(attackers[1]).toMatchObject({ idx: 1, characterId: null, factionId: 500010, shipTypeId: null });
  });

  it("lists calendar months across a year boundary", () => {
    expect(monthsBetween(new Date("2025-11-20T00:00:00Z"), new Date("2026-02-02T00:00:00Z"))).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });
});

describe("killboard sync plan", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("backfills 90 days on first run or for a new corporation", () => {
    const first = planSync(100, {}, now);
    expect(first.mode).toBe("backfill");
    expect(first.since.toISOString()).toBe("2026-07-04T12:00:00.000Z");
    expect(first.windows[0]).toEqual({ year: 2026, month: 7 });
    expect(first.windows.at(-1)).toEqual({ year: 2026, month: 10 });
    expect(planSync(200, { corporationId: 100, lastSyncAt: now.toISOString() }, now).mode).toBe("backfill");
  });

  it("sweeps the last 7 days when up to date, and backfills a long gap", () => {
    const recent = planSync(100, { corporationId: 100, lastSyncAt: "2026-10-02T11:00:00Z" }, now);
    expect(recent).toMatchObject({ mode: "sweep", windows: [{ pastSeconds: 604800 }] });
    const gap = planSync(100, { corporationId: 100, lastSyncAt: "2026-09-20T12:00:00Z" }, now);
    expect(gap.mode).toBe("backfill");
    expect(gap.since.toISOString()).toBe("2026-09-19T12:00:00.000Z");
    expect(gap.windows).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
  });
});

describe("killboard windows", () => {
  it("defaults to 90 days and compares the last complete week", () => {
    const period = parseKillboardFilters({}, "2026-10-02");
    expect(period).toEqual({ from: "2026-07-05", to: "2026-10-02" });
    const w = killboardWindows(period, "2026-10-02");
    expect(w.week).toEqual({ from: "2026-09-25", to: "2026-10-01" });
    expect(w.prevWeek).toEqual({ from: "2026-09-18", to: "2026-09-24" });
  });

  it("uses a past period's own last week and clamps the future", () => {
    const w = killboardWindows(parseKillboardFilters({ from: "2026-09-01", to: "2026-09-30" }, "2026-10-02"), "2026-10-02");
    expect(w.week).toEqual({ from: "2026-09-24", to: "2026-09-30" });
    expect(parseKillboardFilters({ from: "2026-09-01", to: "2027-01-01" }, "2026-10-02").to).toBe("2026-10-02");
  });

  it("reports on the window that closed at least two hours ago", () => {
    expect(reportWindow(new Date("2026-10-02T01:00:00Z")).week).toEqual({ from: "2026-09-24", to: "2026-09-30" });
    expect(reportWindow(new Date("2026-10-02T03:00:00Z")).week).toEqual({ from: "2026-09-25", to: "2026-10-01" });
  });

  it("formats labels and EVE years", () => {
    expect(rangeLabel({ from: "2026-09-25", to: "2026-10-01" })).toBe("Sep 25 – Oct 1");
    expect(rangeLabel({ from: "2026-10-01", to: "2026-10-07" }, "de")).toBe("1. Okt. – 7. Okt.");
    expect(ycYear("2026-05-19")).toBe(128);
  });
});

describe("situation report markup", () => {
  it("parses styled segments without ever producing HTML", () => {
    expect(parseMarkup("{@Kania} got {+51 kills}, lost {-4.77B ISK} near **M-OEE8**.")).toEqual([
      { kind: "pilot", text: "Kania" },
      { kind: "text", text: " got " },
      { kind: "good", text: "51 kills" },
      { kind: "text", text: ", lost " },
      { kind: "bad", text: "4.77B ISK" },
      { kind: "text", text: " near " },
      { kind: "bold", text: "M-OEE8" },
      { kind: "text", text: "." },
    ]);
    expect(parseMarkup("<script>alert(1)</script>")).toEqual([{ kind: "text", text: "<script>alert(1)</script>" }]);
    expect(stripMarkup("{++9} kills")).toBe("+9 kills");
  });
});

const facts = (over: Partial<ReportFacts> = {}): ReportFacts => ({
  corporation: { name: "Lucky.Punch", ticker: "L...P" },
  window: { from: "2026-05-13", to: "2026-05-19", label: "May 13 – May 19", yc: 128 },
  previousWindow: { from: "2026-05-06", to: "2026-05-12", label: "May 6 – May 12" },
  week: { kills: 100, losses: 67, iskDestroyed: "22.8B", iskLost: "4.77B", efficiency: "82.7%", soloKills: 12 },
  previousWeek: { kills: 30, losses: 22, iskDestroyed: "23.8B", iskLost: "5.45B", efficiency: "81.3%", soloKills: 3 },
  change: { kills: 70, losses: 45, efficiencyPoints: 1.4 },
  topPilots: [
    { name: "Kania", kills: 60, previousKills: 9, finalBlows: 20, soloKills: 2, iskDestroyed: "9.1B", losses: 12 },
    { name: "The Dexter", kills: 40, previousKills: 7, finalBlows: 8, soloKills: 1, iskDestroyed: "5.2B", losses: 6 },
    { name: "Buzz Tard", kills: 30, previousKills: 1, finalBlows: 4, soloKills: 0, iskDestroyed: "3B", losses: 7 },
  ],
  topShips: [{ name: "Stabber", kills: 40, change: 18 }],
  lostShips: [{ name: "Vexor Navy Issue", losses: 9, iskLost: "1.2B" }],
  killSystems: [{ name: "M-OEE8", kills: 23, change: 20 }],
  lossSystems: [{ name: "Taisy", losses: 13, change: 5 }],
  biggestKill: { ship: "Vargur", victim: "Someone", system: "Taisy", value: "3.94B", finalBlow: "Kania" },
  biggestLoss: { ship: "Leopard", victim: "Kania", system: "Hageken", value: "459M" },
  ...over,
});

describe("situation report template", () => {
  it("writes a briefing from the facts", () => {
    const r = templateReport(facts());
    expect(r.headline).toBe("Lucky.Punch steps up the offensive");
    expect(r.readiness.level).toBe("surging");
    const text = r.paragraphs.map(stripMarkup).join("\n");
    expect(text).toContain("100 confirmed kills against 67 losses");
    expect(text).toContain("Kania led the board with 60 kills, landing 20 final blows");
    expect(text).toContain("The Dexter posted the biggest gain (+33 kills). Buzz Tard also contributed.");
    expect(text).toContain("Stabber saw the strongest growth");
    expect(text).toContain("Primary theatre of operations: M-OEE8");
    expect(text).toContain("Vargur worth 3.94B ISK in Taisy, final blow by Kania");
  });

  it("handles a quiet week and strained exchanges", () => {
    const quiet = facts({ week: { ...facts().week, kills: 0, losses: 0 }, topPilots: [], topShips: [] });
    expect(templateReport(quiet).paragraphs).toHaveLength(1);
    expect(readinessOf(quiet).level).toBe("quiet");
    const strained = facts({ week: { ...facts().week, kills: 10, losses: 25, efficiency: "31.0%" } });
    expect(readinessOf(strained).level).toBe("strained");
    expect(stripMarkup(templateReport(facts({ week: { ...facts().week, losses: 1 } })).paragraphs[0])).toContain("1 loss ");
  });
});

describe("Claude situation report", () => {
  const output = {
    headline: "  Lucky.Punch **returns** to the offensive ",
    paragraphs: ["{@Kania} led with {+51 kills}.", "  ", "Primary theatre: **M-OEE8**."],
    readiness: { level: "surging" as const, label: "Tempo restored", assessment: "Hold the line." },
  };

  it("sends the facts with structured output and sanitises the result", async () => {
    const parse = vi.fn(async (params: Record<string, unknown>) => {
      expect(params.model).toBe("claude-sonnet-5-5");
      expect(params.output_config).toBeDefined();
      expect(String((params.messages as { content: string }[])[0].content)).toContain('"name": "Kania"');
      return { stop_reason: "end_turn", parsed_output: output, model: "claude-sonnet-5-5" };
    });
    const client = { messages: { parse } } as unknown as Parameters<typeof claudeReport>[1]["client"];
    const out = await claudeReport(facts(), { apiKey: "k", model: "claude-sonnet-5-5", client });
    expect(out.model).toBe("claude-sonnet-5-5");
    expect(out.report.headline).toBe("Lucky.Punch returns to the offensive");
    expect(out.report.paragraphs).toEqual(["{@Kania} led with {+51 kills}.", "Primary theatre: **M-OEE8**."]);
    expect(out.report.readiness.label).toBe("TEMPO RESTORED");
  });

  it("rejects refusals and empty reports", async () => {
    const client = (res: object) =>
      ({ messages: { parse: async () => res } }) as unknown as Parameters<typeof claudeReport>[1]["client"];
    await expect(claudeReport(facts(), { apiKey: "k", model: "m", client: client({ stop_reason: "refusal" }) })).rejects.toThrow(
      "declined",
    );
    expect(() => sanitizeReport({ ...output, paragraphs: [" "] })).toThrow("empty");
  });

  it("falls back to the template without a key or when Claude fails", async () => {
    const claude = vi.fn(async () => {
      throw new Error("overloaded");
    });
    delete process.env.ANTHROPIC_API_KEY;
    resetEnvCache();
    expect((await writeReport(facts(), { claude })).source).toBe("template");
    expect(claude).not.toHaveBeenCalled();

    process.env.ANTHROPIC_API_KEY = "test-key";
    resetEnvCache();
    try {
      const failed = await writeReport(facts(), { claude });
      expect(failed).toMatchObject({ source: "template", error: "overloaded" });
      const ok = await writeReport(facts(), {
        claude: async () => ({ report: templateReport(facts()), model: "claude-sonnet-5-5" }),
      });
      expect(ok).toMatchObject({ source: "claude", model: "claude-sonnet-5-5", error: null });
      // Nothing happened this week: no API call needed.
      const quiet = await writeReport(facts({ week: { ...facts().week, kills: 0, losses: 0 } }), { claude });
      expect(quiet.source).toBe("template");
      expect(claude).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      resetEnvCache();
    }
  });
});
