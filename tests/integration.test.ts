/**
 * Database-backed tests. They run only when TEST_DATABASE_URL points at a
 * disposable Postgres database (it is truncated!), e.g.
 *   TEST_DATABASE_URL=postgres://keystar:keystar@localhost:5432/keystar_test pnpm test
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration", async () => {
  const { closeDb, getDb, schema } = await import("@/core/db");
  const { runMigrations } = await import("@/scripts/migrate");
  const q = await import("@/modules/mining/queries");
  const { parseMiningFilters } = await import("@/modules/mining/filters");
  const scheduler = await import("@/core/sync/scheduler");
  const { EsiClient } = await import("@/core/esi/client");

  const db = () => getDb();
  const filters = (extra: Record<string, string> = {}) =>
    parseMiningFilters({ from: "2026-09-01", to: "2026-09-30", ...extra }, "2026-10-02");
  const corp = { corp: true, ownCharacterIds: [] as number[], homeCorporationId: 100 };
  const own = (ids: number[]) => ({ corp: false, ownCharacterIds: ids, homeCorporationId: 100 });
  const val = { source: "jita_buy" as const, mode: "current" as const };
  let userA = "";
  let userB = "";

  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE users, characters, esi_tokens, sessions, eve_types, eve_groups, eve_systems,
      eve_entities, type_values, type_value_history, mining_character_ledger, mining_observer_ledger, mining_observers,
      sync_jobs, app_settings, killmails, killmail_attackers, killboard_reports, appraisals, esi_cache
      RESTART IDENTITY CASCADE`);
    const [a] = await db().insert(schema.users).values({ role: "member", mainCharacterId: 1 }).returning();
    const [b] = await db().insert(schema.users).values({ role: "member", mainCharacterId: 2 }).returning();
    userA = a.id;
    userB = b.id;
    await db().insert(schema.characters).values([
      { characterId: 1, userId: userA, name: "Alpha", corporationId: 100, ownerHash: "h1" },
      { characterId: 2, userId: userB, name: "Bravo", corporationId: 100, ownerHash: "h2" },
      { characterId: 3, userId: userB, name: "Bravo Alt", corporationId: 100, ownerHash: "h3" },
    ]);
    await db().insert(schema.eveEntities).values({ id: 9, name: "Outsider", category: "character" });
    await db().insert(schema.eveGroups).values([
      { groupId: 462, name: "Veldspar", categoryId: 25 },
      { groupId: 1884, name: "Ubiquitous Moon Asteroids", categoryId: 25 },
    ]);
    await db().insert(schema.eveTypes).values([
      { typeId: 1230, name: "Veldspar", groupId: 462, volume: 0.1, portionSize: 100 },
      { typeId: 45490, name: "Zeolites", groupId: 1884, volume: 10, portionSize: 100 },
    ]);
    await db().insert(schema.eveSystems).values({ systemId: 30000180, name: "Osmon", securityStatus: 0.68 });
    await db().insert(schema.typeValues).values([
      { typeId: 1230, source: "jita_buy", unitPrice: 10, basis: "direct" },
      { typeId: 45490, source: "jita_buy", unitPrice: 600, basis: "direct" },
    ]);
    await db().insert(schema.typeValueHistory).values([
      { typeId: 45490, source: "jita_buy", date: "2026-09-01", unitPrice: 500 },
    ]);
    await db().insert(schema.miningCharacterLedger).values([
      { characterId: 1, date: "2026-09-10", solarSystemId: 30000180, typeId: 1230, quantity: 1000 },
      { characterId: 2, date: "2026-09-10", solarSystemId: 30000180, typeId: 45490, quantity: 100 },
      { characterId: 3, date: "2026-09-11", solarSystemId: 30000180, typeId: 1230, quantity: 500 },
    ]);
    await db().insert(schema.miningObservers).values({
      observerId: 77,
      corporationId: 100,
      observerType: "structure",
      name: "Osmon Athanor",
      solarSystemId: 30000180,
    });
    await db().insert(schema.miningObserverLedger).values([
      // Same mining as Bravo's personal ledger: must not be double counted.
      { observerId: 77, corporationId: 100, characterId: 2, recordedCorporationId: 100, date: "2026-09-10", typeId: 45490, quantity: 100 },
      // An unregistered pilot from another corp.
      { observerId: 77, corporationId: 100, characterId: 9, recordedCorporationId: 555, date: "2026-09-10", typeId: 45490, quantity: 50 },
    ]);
  });

  describe("mining queries", () => {
    it("de-duplicates personal and observer ledgers in the combined view", async () => {
      const all = await q.getMiningSummary(filters(), corp, val);
      expect(all.current.value).toBe(1000 * 10 + 100 * 600 + 500 * 10 + 50 * 600);
      expect(all.current.characters).toBe(4);
      expect(all.current.miners).toBe(3); // Alpha, Bravo (+alt), Outsider

      const personal = await q.getMiningSummary(filters({ source: "personal" }), corp, val);
      expect(personal.current.value).toBe(75_000);
      const observer = await q.getMiningSummary(filters({ source: "observer" }), corp, val);
      expect(observer.current.value).toBe(90_000);
    });

    it("restricts members to their own characters", async () => {
      const mine = await q.getMiningSummary(filters(), own([2, 3]), val);
      expect(mine.current.value).toBe(100 * 600 + 500 * 10);
      // Asking for someone else's character as a member yields nothing.
      const other = await q.getMiningSummary(filters({ chars: "1" }), own([2, 3]), val);
      expect(other.current.quantity).toBe(0);
      const none = await q.getMiningSummary(filters(), own([]), val);
      expect(none.current.quantity).toBe(0);
    });

    it("limits corporation views to the home corporation", async () => {
      // A guest from another corporation and a refinery of a previous home corporation.
      await db().insert(schema.characters).values({ characterId: 4, userId: userA, name: "Alpha Elsewhere", corporationId: 200, ownerHash: "h4" });
      await db().insert(schema.miningCharacterLedger).values({ characterId: 4, date: "2026-09-12", solarSystemId: 30000180, typeId: 1230, quantity: 7000 });
      await db().insert(schema.miningObservers).values({ observerId: 88, corporationId: 200, observerType: "structure", name: "Old Athanor" });
      await db().insert(schema.miningObserverLedger).values({ observerId: 88, corporationId: 200, characterId: 9, recordedCorporationId: 555, date: "2026-09-12", typeId: 45490, quantity: 999 });

      const corpView = await q.getMiningSummary(filters(), corp, val);
      expect(corpView.current.value).toBe(105_000); // unchanged by the foreign rows
      const observers = await q.getObserverSummaries(filters(), val, 100);
      expect(observers.map((o) => o.name)).toEqual(["Osmon Athanor"]);
      const options = await q.getFilterOptions(corp);
      expect(options.characters.map((c) => c.id)).not.toContain(4);

      // The owner still sees their own character, whatever its corporation.
      const mine = await q.getMiningSummary(filters({ source: "personal" }), own([1, 4]), val);
      expect(mine.current.value).toBe(1000 * 10 + 7000 * 10);
    });

    it("shows no corporation-wide data until a home corporation is set", async () => {
      const viewer = { can: (perm: string) => perm === "mining.view.corp", characterIds: [1] };
      const scope = q.miningScope(viewer, null);
      expect(scope.corp).toBe(false);
      const mine = await q.getMiningSummary(filters({ source: "personal" }), scope, val);
      expect(mine.current.value).toBe(1000 * 10);

      // A hand-built corporation scope without a home corporation fails closed.
      const unscoped = await q.getMiningSummary(filters(), { ...corp, homeCorporationId: null }, val);
      expect(unscoped.current.quantity).toBe(0);
      expect(await q.getObserverSummaries(filters(), val, null)).toEqual([]);
    });

    it("filters by ore class and system", async () => {
      const moon = await q.getMiningSummary(filters({ classes: "moon_r4" }), corp, val);
      expect(moon.current.value).toBe(90_000);
      const nowhere = await q.getMiningSummary(filters({ systems: "30000142" }), corp, val);
      expect(nowhere.current.quantity).toBe(0);
    });

    it("groups alts under their main", async () => {
      const rows = await q.getMemberBreakdown(filters(), corp, val);
      const bravo = rows.find((r) => r.userId === userB)!;
      expect(bravo.name).toBe("Bravo");
      expect(bravo.characters).toBe(2);
      expect(bravo.value).toBe(65_000);
      const outsider = rows.find((r) => r.key === "char:9")!;
      expect(outsider.name).toBe("Outsider");
      expect(outsider.userId).toBeNull();

      const byChar = await q.getMemberBreakdown(filters({ by: "character" }), corp, val);
      expect(byChar.find((r) => r.key === "3")?.ownerName).toBe("Bravo");
    });

    it("values at the historical price when configured", async () => {
      const hist = await q.getMiningSummary(filters({ classes: "moon_r4" }), corp, { ...val, mode: "historical" });
      expect(hist.current.value).toBe(150 * 500);
    });

    it("pages the ledger and flags foreign refinery miners", async () => {
      const page = await q.getLedgerRows(filters(), corp, val, { limit: 2, offset: 0 });
      expect(page.total).toBe(4);
      expect(page.rows).toHaveLength(2);
      // Paging one row at a time (as the streamed CSV export does) returns every row exactly once.
      const keys: string[] = [];
      for (let offset = 0; offset < 10; offset++) {
        const { rows } = await q.getLedgerRows(filters(), corp, val, { limit: 1, offset, count: false });
        if (!rows.length) break;
        keys.push(`${rows[0].source}:${rows[0].characterId}:${rows[0].date}:${rows[0].typeId}`);
      }
      expect(keys).toHaveLength(4);
      expect(new Set(keys).size).toBe(4);
      const observers = await q.getObserverSummaries(filters(), val, 100);
      expect(observers[0].name).toBe("Osmon Athanor");
      expect(observers[0].foreignMiners).toBe(1);
    });
  });

  describe("sessions and tokens", () => {
    it("slides the session expiry with activity", async () => {
      const { createSession, validateSessionToken } = await import("@/core/auth/session");
      const token = await createSession(userA);
      await db().execute(sql`UPDATE sessions SET last_seen_at = now() - interval '10 minutes', expires_at = now() + interval '1 day'`);
      expect(await validateSessionToken(token)).not.toBeNull();
      const [row] = await db().select().from(schema.sessions);
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    });

    it("retires an account whose last character was transferred", async () => {
      const { createSession } = await import("@/core/auth/session");
      const { detachTransferredCharacter } = await import("@/core/auth/provision");
      await createSession(userA);
      await createSession(userB);

      // Bravo keeps an alt: the account stays active and the alt becomes main.
      const bravo = await db().transaction((tx) => detachTransferredCharacter(tx, 2, userB, { keepAccount: false }));
      expect(bravo.retired).toBe(false);
      // Alpha loses their only character: disabled and signed out.
      const alpha = await db().transaction((tx) => detachTransferredCharacter(tx, 1, userA, { keepAccount: false }));
      expect(alpha.retired).toBe(true);

      const users = await db().select().from(schema.users);
      const a = users.find((u) => u.id === userA)!;
      const b = users.find((u) => u.id === userB)!;
      expect(a).toMatchObject({ isDisabled: true, mainCharacterId: null, role: "member" });
      expect(b).toMatchObject({ isDisabled: false, mainCharacterId: 3 });
      const remaining = await db().select().from(schema.sessions);
      expect(remaining.map((r) => r.userId)).toEqual([userB]);
      expect((await db().select().from(schema.characters)).map((c) => c.characterId)).toEqual([3]);
    });

    it("keeps the account when it links a transferred character back to itself", async () => {
      const { detachTransferredCharacter } = await import("@/core/auth/provision");
      const result = await db().transaction((tx) => detachTransferredCharacter(tx, 1, userA, { keepAccount: true }));
      expect(result.retired).toBe(false);
      const [a] = await db().select().from(schema.users).where(sql`id = ${userA}`);
      expect(a.isDisabled).toBe(false);
    });

    it("only invalidates a token on invalid_grant", async () => {
      const { encryptToken } = await import("@/core/crypto");
      const { getAccessToken } = await import("@/core/esi/tokens");
      await db().insert(schema.esiTokens).values({ characterId: 1, refreshTokenEnc: encryptToken("refresh"), scopes: [] });
      const respond = (error: string) =>
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
          new Response(JSON.stringify({ error, error_description: error }), { status: error === "invalid_grant" ? 400 : 401 }),
        );

      const misconfigured = respond("invalid_client");
      await expect(getAccessToken(1)).rejects.toThrow();
      misconfigured.mockRestore();
      let [row] = await db().select().from(schema.esiTokens);
      expect(row.status).toBe("active");

      const revoked = respond("invalid_grant");
      await expect(getAccessToken(1)).rejects.toThrow();
      revoked.mockRestore();
      [row] = await db().select().from(schema.esiTokens);
      expect(row.status).toBe("invalid");
    });
  });

  describe("killboard", () => {
    const kb = () => import("@/modules/killboard/queries");
    const HOME = 100;
    const at = (iso: string) => `${iso}Z`;
    // A kill, a solo kill (previous week), a loss, an awox (loss only), someone else's fight and an old kill.
    const fixture = [
      { killmail_id: 1, killmail_time: at("2026-09-28T20:00:00"), solar_system_id: 30000180,
        victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 900 },
        attackers: [
          { character_id: 1, corporation_id: HOME, ship_type_id: 17843, damage_done: 600, final_blow: true },
          { character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_done: 300, final_blow: false },
        ],
        zkb: { hash: "h1", totalValue: 100e6, solo: false } },
      { killmail_id: 2, killmail_time: at("2026-09-20T20:00:00"), solar_system_id: 30000180,
        victim: { character_id: 9, corporation_id: 555, ship_type_id: 587, damage_taken: 300 },
        attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 11186, damage_done: 300, final_blow: true }],
        zkb: { hash: "h2", totalValue: 10e6, solo: true } },
      { killmail_id: 3, killmail_time: at("2026-09-29T10:00:00"), solar_system_id: 30000181,
        victim: { character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_taken: 5000 },
        attackers: [{ character_id: 9, corporation_id: 555, ship_type_id: 622, damage_done: 5000, final_blow: true }],
        zkb: { hash: "h3", totalValue: 50e6 } },
      { killmail_id: 4, killmail_time: at("2026-09-29T11:00:00"), solar_system_id: 30000181,
        victim: { character_id: 1, corporation_id: HOME, ship_type_id: 670, damage_taken: 100 },
        attackers: [{ character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_done: 100, final_blow: true }],
        zkb: { hash: "h4", totalValue: 10_000, awox: true } },
      { killmail_id: 5, killmail_time: at("2026-09-29T12:00:00"), solar_system_id: 30000180,
        victim: { character_id: 7, corporation_id: 777, ship_type_id: 622, damage_taken: 100 },
        attackers: [{ character_id: 8, corporation_id: 888, ship_type_id: 622, damage_done: 100, final_blow: true }],
        zkb: { hash: "h5", totalValue: 1e9 } },
      { killmail_id: 6, killmail_time: at("2026-06-01T12:00:00"), solar_system_id: 30000180,
        victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 100 },
        attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 622, damage_done: 100, final_blow: true }],
        zkb: { hash: "h6", totalValue: 5e9 } },
    ];
    const windows = {
      period: { from: "2026-07-05", to: "2026-10-02" },
      week: { from: "2026-09-25", to: "2026-10-01" },
      prevWeek: { from: "2026-09-18", to: "2026-09-24" },
    };

    beforeEach(async () => {
      const { storeKillmails } = await import("@/modules/killboard/sync");
      await db().insert(schema.eveEntities).values([
        { id: 1, name: "Alpha", category: "character" },
        { id: 2, name: "Bravo", category: "character" },
      ]);
      await db().insert(schema.eveSystems).values({ systemId: 30000181, name: "Tama", securityStatus: 0.28 });
      expect(await storeKillmails(db(), fixture as never)).toBe(6);
    });

    it("stores killmails idempotently and refreshes zKillboard values", async () => {
      const { storeKillmails } = await import("@/modules/killboard/sync");
      expect(await storeKillmails(db(), fixture as never)).toBe(0);
      const revalued = { ...fixture[0], zkb: { ...fixture[0].zkb, totalValue: 120e6 } };
      expect(await storeKillmails(db(), [revalued] as never)).toBe(0);
      // A change in any refreshed field alone is persisted too.
      const refitted = { ...revalued, zkb: { ...revalued.zkb, fittedValue: 7e6, labels: ["pvp", "loc:lowsec"] } };
      expect(await storeKillmails(db(), [refitted] as never)).toBe(0);
      const rows = await db().execute<{ v: number; f: number; l: string[]; n: number }>(
        sql`SELECT k.total_value::float8 AS v, k.fitted_value::float8 AS f, k.labels AS l,
                   (SELECT COUNT(*) FROM killmail_attackers)::int AS n
            FROM killmails k WHERE k.killmail_id = 1`,
      );
      expect(rows[0]).toEqual({ v: 120e6, f: 7e6, l: ["pvp", "loc:lowsec"], n: 7 });
    });

    it("reports the sync time only for the corporation that was synced", async () => {
      const q2 = await kb();
      const syncedAt = "2026-10-02T02:00:00.000Z";
      await db().insert(schema.syncJobs).values({
        jobKey: "killboard.zkill-sync",
        ownerType: "global",
        ownerId: 0,
        meta: { corporationId: 999, lastSyncAt: syncedAt },
      });
      // The home corporation changed to 100, but the last sync was for 999.
      expect((await q2.getKillboardStatus(HOME)).lastSyncAt).toBeNull();
      await db().execute(sql`UPDATE sync_jobs SET meta = ${JSON.stringify({ corporationId: HOME, lastSyncAt: syncedAt })}::jsonb`);
      expect((await q2.getKillboardStatus(HOME)).lastSyncAt?.toISOString()).toBe(syncedAt);
    });

    it("counts kills and losses like zKillboard (awox is a loss only)", async () => {
      const q2 = await kb();
      expect(await q2.getTotals(HOME, windows.period)).toEqual({
        kills: 2,
        losses: 2,
        iskDestroyed: 110e6,
        iskLost: 50e6 + 10_000,
        soloKills: 1,
      });
      expect(await q2.getTotals(HOME, windows.week)).toMatchObject({ kills: 1, losses: 2 });
      expect(await q2.getTotals(HOME, windows.prevWeek)).toMatchObject({ kills: 1, losses: 0 });

      const killSystems = await q2.getTopSystems(HOME, windows, "kills");
      expect(killSystems).toEqual([
        { systemId: 30000180, name: "Osmon", security: 0.68, count: 2, value: 110e6, week: 1, prevWeek: 1 },
      ]);
      const lossSystems = await q2.getTopSystems(HOME, windows, "losses");
      expect(lossSystems.map((r) => [r.name, r.count, r.week, r.prevWeek])).toEqual([["Tama", 2, 2, 0]]);

      const recent = await q2.getRecentActivity(HOME, windows.period);
      expect(recent.map((r) => [r.killmailId, r.kind])).toEqual([
        [4, "loss"],
        [3, "loss"],
        [1, "kill"],
        [2, "kill"],
      ]);
    });

    it("aggregates ships and pilots with week-over-week deltas", async () => {
      const q2 = await kb();
      const ships = await q2.getShips(HOME, windows);
      expect(ships.map((s) => [s.typeId, s.kills, s.destroyed, s.losses, s.lost, s.killsDelta, s.lossesDelta])).toEqual([
        [17843, 1, 100e6, 1, 50e6, 1, 1],
        [11186, 1, 10e6, 0, 0, -1, 0],
        [670, 0, 0, 1, 10_000, 0, 1],
      ]);
      const pilots = await q2.getPilots(HOME, windows);
      expect(pilots).toEqual([
        { characterId: 1, name: "Alpha", kills: 2, losses: 1, finalBlows: 2, solo: 1, destroyed: 110e6, lost: 10_000, killsDelta: 0, lossesDelta: 1 },
        { characterId: 2, name: "Bravo", kills: 1, losses: 1, finalBlows: 0, solo: 0, destroyed: 100e6, lost: 50e6, killsDelta: 1, lossesDelta: 1 },
      ]);
      const notable = await q2.getNotable(HOME, windows.week, "kills");
      expect(notable).toMatchObject({ killmailId: 1, finalBlowName: "Alpha", value: 100e6 });
    });

    it("syncs only killmails inside the plan's window", async () => {
      const { syncCorporationKillmails } = await import("@/modules/killboard/sync");
      await db().execute(sql`TRUNCATE killmails, killmail_attackers`);
      const resolved: number[] = [];
      const zkill = {
        async *corporationKillmails() {
          yield fixture.slice(0, 3) as never;
          yield fixture.slice(2, 4) as never; // overlap is de-duplicated
        },
      };
      const out = await syncCorporationKillmails(
        db(),
        HOME,
        { mode: "backfill", windows: [{ year: 2026, month: 9 }], since: new Date("2026-09-21T00:00:00Z") },
        { zkill, resolve: async (_corp, entries) => void resolved.push(...entries.map((e) => e.killmail_id)) },
      );
      expect(out).toEqual({ mode: "backfill", fetched: 3, inserted: 3 });
      expect(resolved.sort()).toEqual([1, 3, 4]);
    });

    it("writes one situation report per week window", async () => {
      const { generateSituationReport, getLatestReport } = await import("@/modules/killboard/report/generate");
      const now = new Date("2026-10-02T03:00:00Z");
      const first = await generateSituationReport(db(), HOME, now);
      expect(first).toMatchObject({ created: true, source: "template", week: windows.week });
      expect((await generateSituationReport(db(), HOME, now)).created).toBe(false);
      expect((await generateSituationReport(db(), HOME, now, { force: true })).created).toBe(true);
      const latest = await getLatestReport(HOME);
      expect(latest?.periodTo).toBe("2026-10-01");
      expect(latest?.facts.week).toMatchObject({ kills: 1, losses: 2 });
      expect(latest?.facts.topPilots.map((p) => p.name)).toEqual(["Alpha", "Bravo"]);
      expect(latest?.report.paragraphs.length).toBeGreaterThan(0);
    });
  });

  describe("appraisal", () => {
    it("appraises a paste end to end and saves a shareable snapshot", async () => {
      const { appraise, saveAppraisal } = await import("@/modules/trade/appraisal/appraise");
      await db().insert(schema.eveGroups).values({ groupId: 25, name: "Frigate", categoryId: 6 });
      await db().insert(schema.eveTypes).values([
        { typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01, packagedVolume: 0.01, portionSize: 1 },
        { typeId: 587, name: "Rifter", groupId: 25, volume: 27289, packagedVolume: 2500, portionSize: 1 },
      ]);
      await db().insert(schema.typeValues).values([
        { typeId: 34, source: "jita_buy", unitPrice: 4, basis: "direct" },
        { typeId: 34, source: "jita_sell", unitPrice: 5, basis: "direct" },
        // An ESI-average fallback is not a Jita price.
        { typeId: 587, source: "jita_buy", unitPrice: 400_000, basis: "esi_average" },
      ]);
      // No network: unknown names resolve to nothing, live pricing finds no orders.
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/universe/ids")) return new Response("{}", { status: 200 });
        return new Response("[]", { status: 200, headers: { "x-pages": "1" } });
      });
      try {
        const result = await appraise("Tritanium x 1,000\ntritanium\t500\n[Rifter, test]\nNot an item");
        expect(result.items).toEqual([
          { typeId: 34, name: "Tritanium", quantity: 1500, buy: 4, sell: 5, volume: 0.01 },
          { typeId: 587, name: "Rifter", quantity: 1, buy: null, sell: null, volume: 2500 },
        ]);
        expect(result.totals).toMatchObject({ buy: 6000, sell: 7500, split: 6750, volume: 2515, types: 2, unpriced: 1 });
        expect(result.unparsed).toEqual([{ line: 4, raw: "Not an item" }]);
        // Rifter only had a recent buy-side value, so it was priced again; Tritanium was fresh on both sides.
        const orderCalls = fetchSpy.mock.calls.map(([u]) => String(u instanceof Request ? u.url : u)).filter((u) => u.includes("/orders"));
        expect(orderCalls.some((u) => u.includes("type_id=587"))).toBe(true);
        expect(orderCalls.some((u) => u.includes("type_id=34"))).toBe(false);

        const id = await saveAppraisal(result, { input: "x", pricePercent: 90, userId: userA, userName: "Alpha" });
        const [row] = await db().select().from(schema.appraisals);
        expect(row).toMatchObject({ id, pricePercent: 90, createdBy: userA, createdByName: "Alpha" });
        expect((row.items as unknown[]).length).toBe(2);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("sync scheduler", () => {
    const job = (run: () => Promise<void>) => ({
      key: "test.job",
      label: () => "Test",
      module: "test",
      owner: "character" as const,
      requiredScopes: ["scope.a"],
      intervalSeconds: 600,
      run: async () => {
        await run();
        return { summary: "done" };
      },
    });
    const esi = new EsiClient({ baseUrl: "https://esi.invalid", userAgent: "t", compatibilityDate: "2026-08-18" });

    beforeEach(async () => {
      await db().insert(schema.esiTokens).values([
        { characterId: 1, refreshTokenEnc: "x", scopes: ["scope.a", "scope.b"] },
        { characterId: 2, refreshTokenEnc: "x", scopes: ["scope.b"] },
        { characterId: 3, refreshTokenEnc: "x", scopes: ["scope.a"], status: "invalid" },
      ]);
    });

    it("plans rows only for active tokens with the scope and disables stale ones", async () => {
      const def = job(async () => {});
      await scheduler.planJobs([def]);
      let rows = await db().select().from(schema.syncJobs);
      expect(rows.filter((r) => r.enabled).map((r) => r.ownerId)).toEqual([1]);

      await db().execute(sql`UPDATE esi_tokens SET status = 'invalid' WHERE character_id = 1`);
      await scheduler.planJobs([def]);
      rows = await db().select().from(schema.syncJobs);
      expect(rows.every((r) => !r.enabled)).toBe(true);
    });

    it("claims due jobs exactly once and records success", async () => {
      const def = job(async () => {});
      await scheduler.planJobs([def]);
      const first = await scheduler.claimDueJobs("w1", [def.key], 10);
      const second = await scheduler.claimDueJobs("w2", [def.key], 10);
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);

      await scheduler.executeJob(first[0], def, { esi });
      const [row] = await db().select().from(schema.syncJobs);
      expect(row.lastStatus).toBe("ok");
      expect(row.lastSummary).toBe("done");
      expect(row.lockedBy).toBeNull();
      expect(row.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
    });

    it("backs off exponentially on failure", async () => {
      const def = job(async () => {
        throw new Error("boom");
      });
      await scheduler.planJobs([def]);
      const [claimed] = await scheduler.claimDueJobs("w1", [def.key], 10);
      await scheduler.executeJob(claimed, def, { esi });
      const [row] = await db().select().from(schema.syncJobs);
      expect(row.lastStatus).toBe("error");
      expect(row.lastError).toBe("boom");
      expect(row.consecutiveFailures).toBe(1);
      expect(row.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    });
  });
});
