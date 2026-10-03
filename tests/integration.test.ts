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
      sync_jobs, app_settings, killmails, killmail_attackers, killboard_reports, appraisals, esi_cache,
      fleets, fleet_members, fleet_trackers, eve_constellations, intel_scans, intel_scan_pilots, intel_pilots,
      intel_pilot_killmails, intel_queue, intel_contacts, intel_ai_notes, wallet_transactions, mining_activity,
      mining_activity_coverage, mining_pnl_settings, mining_pnl_characters, mining_pnl_price_rules,
      mining_pnl_tx_overrides, mining_pnl_entries, corp_wallet_divisions, corp_wallet_balance_history,
      corp_wallet_journal, corp_wallet_transactions, corp_wallet_sync_state
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

  describe("mining P&L", async () => {
    const pnl = await import("@/modules/mining/pnl/queries");
    const { pnlScope } = await import("@/modules/mining/pnl/scope");
    const { buildPnlReport } = await import("@/modules/mining/pnl/report");
    const { characterLedgerJob } = await import("@/modules/mining/jobs");
    const { walletTransactionsJob } = await import("@/modules/wallet/jobs");
    const { WALLET_SCOPE } = await import("@/modules/wallet/module");

    const range = { from: "2026-09-01", to: "2026-09-30" };
    const scopeB = (extra: { characters?: number[]; ratePct?: number; mode?: "current" | "historical" } = {}) =>
      pnlScope(
        { id: userB, characterIds: [2, 3] },
        { ...range, characters: extra.characters ?? [] },
        { ...val, mode: extra.mode ?? "current" },
        extra.ratePct ?? 100,
      );
    const income = async (s: ReturnType<typeof scopeB>) =>
      (await pnl.getIncomeRows(s)).reduce((sum, r) => sum + r.value, 0);
    const tx = (characterId: number, transactionId: number, typeId: number, extra: Record<string, unknown> = {}) => ({
      characterId,
      transactionId,
      userId: userB,
      date: new Date("2026-09-10T12:00:00Z"),
      typeId,
      quantity: 10,
      unitPrice: 1000,
      isBuy: true,
      clientId: 1,
      locationId: 60003760,
      journalRefId: transactionId,
      ...extra,
    });

    beforeEach(async () => {
      await db().insert(schema.eveGroups).values([
        { groupId: 482, name: "Mining Crystal", categoryId: 8 },
        { groupId: 423, name: "Ice Product", categoryId: 4 },
        { groupId: 18, name: "Mineral", categoryId: 4 },
      ]);
      await db().insert(schema.eveTypes).values([
        { typeId: 18066, name: "Veldspar Mining Crystal I", groupId: 482, volume: 6 },
        { typeId: 16272, name: "Heavy Water", groupId: 423, volume: 0.4 },
        { typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01 },
        { typeId: 62516, name: "Compressed Veldspar", groupId: 462, volume: 0.001, portionSize: 1 },
      ]);
      await db().update(schema.eveTypes).set({ compressedTypeId: 62516 }).where(sql`type_id = 1230`);
    });

    it("values income like the dashboard, then applies the rate and price rules", async () => {
      const dashboard = await q.getMiningSummary(filters(), own([2, 3]), val);
      expect(await income(scopeB())).toBe(dashboard.current.value);
      expect(await income(scopeB({ ratePct: 90 }))).toBeCloseTo(58_500);

      // Veldspar sold at 20 ISK from the 11th: only Bravo Alt's 500 units on the 11th.
      await db().insert(schema.miningPnlPriceRules).values({ userId: userB, typeId: 1230, unitPrice: 20, validFrom: "2026-09-11" });
      expect(await income(scopeB({ ratePct: 90 }))).toBeCloseTo(100 * 600 * 0.9 + 500 * 20);
      // Another account's rules never apply.
      await db().insert(schema.miningPnlPriceRules).values({ userId: userA, typeId: 45490, unitPrice: 1 });
      expect(await income(scopeB({ ratePct: 90 }))).toBeCloseTo(100 * 600 * 0.9 + 500 * 20);

      await db().execute(sql`TRUNCATE mining_pnl_price_rules`);
      expect(await income(scopeB({ mode: "historical" }))).toBe(100 * 500 + 500 * 10);
      // A member asking for someone else's character gets their own.
      const a = pnlScope({ id: userA, characterIds: [1] }, { ...range, characters: [2] }, val, 100);
      expect(a.characterIds).toEqual([1]);
      expect(await income(a)).toBe(1000 * 10);
    });

    it("keeps wallet purchases private to the importing account", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(2, 1, 18066),
        // Imported while the character belonged to someone else.
        { ...tx(2, 2, 18066), userId: userA },
      ]);
      const rows = await pnl.getPurchases(scopeB(), { status: "mining", limit: 50, offset: 0 });
      expect(rows.rows.map((r) => r.transactionId)).toEqual([1]);
      const a = pnlScope({ id: userA, characterIds: [1] }, { ...range, characters: [2] }, val, 100);
      expect((await pnl.getPurchases(a, { status: "mining", limit: 50, offset: 0 })).total).toBe(0);
      expect(await pnl.getExpenseRows(a)).toEqual([]);
    });

    it("classifies purchases: suggested by default, counted when switched on, overrides win", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(2, 1, 18066), // crystal, Bravo: auto-count off -> suggested
        tx(3, 2, 16272), // heavy water, Bravo Alt: auto-count on -> counted
        tx(2, 3, 34), // tritanium: untagged
        tx(3, 4, 18066), // crystal excluded by hand
        tx(2, 5, 34), // tritanium tagged and included by hand
        tx(2, 6, 18066, { isBuy: false }), // a sale is never an expense
        tx(2, 7, 18066, { date: new Date("2026-10-01T00:00:00Z") }), // outside the range
      ]);
      await db().insert(schema.miningPnlCharacters).values({ userId: userB, characterId: 3, autoIncludeExpenses: true });
      await db().insert(schema.miningPnlTxOverrides).values([
        { userId: userB, characterId: 3, transactionId: 4, included: false },
        { userId: userB, characterId: 2, transactionId: 5, category: "other", included: true },
      ]);
      const status = async (s: "counted" | "suggested" | "excluded" | "untagged") =>
        (await pnl.getPurchases(scopeB(), { status: s, limit: 50, offset: 0 })).rows.map((r) => r.transactionId);
      expect(await status("suggested")).toEqual([1]);
      expect((await status("counted")).sort()).toEqual([2, 5]);
      expect(await status("excluded")).toEqual([4]);
      expect(await status("untagged")).toEqual([3]);

      const report = buildPnlReport({
        ...range,
        bucket: "month",
        income: await pnl.getIncomeRows(scopeB()),
        expenses: await pnl.getExpenseRows(scopeB()),
        manual: [],
        activity: await pnl.getActivityStats(scopeB()),
        characters: [
          { characterId: 2, name: "Bravo" },
          { characterId: 3, name: "Bravo Alt" },
        ],
      });
      expect(report.totals.wallet).toBe(20_000);
      expect(report.purchases.suggested).toEqual({ amount: 10_000, count: 1 });
      expect(report.byCategory).toEqual([
        { category: "fuel", amount: 10_000 },
        { category: "other", amount: 10_000 },
      ]);
    });

    it("spreads manual entries over their days; account-wide ones only without a character filter", async () => {
      await db().insert(schema.miningPnlEntries).values([
        { userId: userB, characterId: 3, date: "2026-08-17", spreadDays: 30, category: "subscription", amount: 3000 },
        { userId: userB, characterId: null, date: "2026-09-05", category: "other", amount: 100 },
        { userId: userA, characterId: 1, date: "2026-09-05", category: "other", amount: 999 },
      ]);
      const all = await pnl.getManualDaily(scopeB(), [2, 3]);
      expect(all.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1500 + 100);
      expect(all.filter((r) => r.characterId === 3)).toHaveLength(15);
      const narrowed = await pnl.getManualDaily(scopeB({ characters: [3] }), [2, 3]);
      expect(narrowed.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1500);
      expect((await pnl.getManualEntries(userB, range.from, range.to)).map((e) => e.amount)).toEqual([100, 3000]);
    });

    it("measures wall-clock and character hours from activity windows", async () => {
      await db().insert(schema.miningCharacterLedger).values({
        characterId: 3, date: "2026-09-10", solarSystemId: 30000180, typeId: 1230, quantity: 300,
      });
      await db().insert(schema.miningActivity).values([
        { characterId: 2, date: "2026-09-10", typeId: 45490, quantity: 50,
          windowStart: new Date("2026-09-10T10:00:00Z"), windowEnd: new Date("2026-09-10T11:00:00Z") },
        { characterId: 3, date: "2026-09-10", typeId: 1230, quantity: 300,
          windowStart: new Date("2026-09-10T10:30:00Z"), windowEnd: new Date("2026-09-10T11:30:00Z") },
      ]);
      await db().insert(schema.miningActivityCoverage).values([
        { characterId: 2, since: new Date("2026-09-01T00:00:00Z"), lastObservedAt: new Date("2026-09-10T11:00:00Z") },
      ]);
      const stats = await pnl.getActivityStats(scopeB());
      expect(stats.total.hours).toBeCloseTo(1.5);
      expect(stats.total.value).toBe(50 * 600 + 300 * 10);
      expect(stats.byCharacter.get(2)?.hours).toBeCloseTo(1);
      expect(stats.byActivity.get("moon")?.hours).toBeCloseTo(1);
      expect(stats.byActivity.get("ore")?.value).toBe(3000);
      expect(stats.trackedSince?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });

    it("records ledger growth in the sync job", async () => {
      const today = new Date().toISOString().slice(0, 10);
      let quantity = 1000;
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async () =>
          new Response(JSON.stringify([{ date: today, quantity, solar_system_id: 30000180, type_id: 1230 }]), {
            status: 200,
            headers: { "content-type": "application/json", "last-modified": new Date().toUTCString() },
          })) as unknown as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 1, characterId: 1, esi, db: db(), log: undefined as never, meta: {} };
      await characterLedgerJob.run(ctx);
      const [first] = await db().select().from(schema.miningActivityCoverage);
      expect(first.characterId).toBe(1);
      expect(await db().select().from(schema.miningActivity)).toHaveLength(0);

      // Fifteen minutes later the ledger has grown.
      const earlier = new Date(Date.now() - 15 * 60_000);
      await db().update(schema.miningActivityCoverage).set({ lastObservedAt: earlier });
      quantity = 1600;
      await characterLedgerJob.run(ctx);
      const rows = await db().select().from(schema.miningActivity);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ characterId: 1, date: today, typeId: 1230, quantity: 600 });
      expect(rows[0].windowStart.getTime()).toBe(earlier.getTime());
      const [ledger] = await db().select().from(schema.miningCharacterLedger).where(sql`character_id = 1 AND date = ${today}`);
      expect(ledger.quantity).toBe(1600);

      // A snapshot that isn't newer than the last observation never rolls the ledger back.
      await db().update(schema.miningActivityCoverage).set({ lastObservedAt: new Date(Date.now() + 60_000) });
      quantity = 1200;
      expect((await characterLedgerJob.run(ctx))?.summary).toContain("older snapshot, skipped");
      const [kept] = await db().select().from(schema.miningCharacterLedger).where(sql`character_id = 1 AND date = ${today}`);
      expect(kept.quantity).toBe(1600);
    });

    it("imports wallet transactions for the owning account", async () => {
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (url: string) =>
          new Response(
            JSON.stringify(
              String(url).includes("from_id")
                ? []
                : [
                    { transaction_id: 11, date: "2026-09-10T12:00:00Z", type_id: 16272, quantity: 500, unit_price: 700,
                      is_buy: true, is_personal: true, client_id: 5, location_id: 60003760, journal_ref_id: 1 },
                    { transaction_id: 12, date: "2026-09-10T12:00:00Z", type_id: 34, quantity: 1, unit_price: 5,
                      is_buy: true, is_personal: false, client_id: 5, location_id: 60003760, journal_ref_id: 2 },
                  ],
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          )) as unknown as typeof fetch,
      });
      expect(walletTransactionsJob.requiredScopes).toEqual([WALLET_SCOPE]);
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 3, characterId: 3, esi, db: db(), log: undefined as never, meta: {} };
      const result = await walletTransactionsJob.run(ctx);
      expect(result?.summary).toBe("1 new transaction");
      const rows = await db().select().from(schema.walletTransactions);
      expect(rows).toEqual([expect.objectContaining({ characterId: 3, transactionId: 11, userId: userB, isBuy: true })]);
    });

    it("ignores market trades between the account's own characters", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(2, 31, 18066), // bought from a stranger: a cost
        tx(2, 32, 18066, { clientId: 3 }), // bought from your own alt: just moving crystals around
        tx(3, 33, 1230, { isBuy: false, quantity: 100, unitPrice: 50, clientId: 2 }), // sold to your main
      ]);
      const rows = await pnl.getPurchases(scopeB(), { status: "mining", limit: 50, offset: 0 });
      expect(rows.rows.map((r) => r.transactionId)).toEqual([31]);
      expect(await pnl.getSaleHints(scopeB(), range)).toEqual([]);
    });

    it("never brings wallet rows back for a character removed or sold during the import", async () => {
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async () => {
          // The character changes hands while ESI is answering.
          await db().execute(sql`UPDATE characters SET user_id = ${userA} WHERE character_id = 3`);
          return new Response(
            JSON.stringify([{ transaction_id: 41, date: "2026-09-10T12:00:00Z", type_id: 16272, quantity: 1, unit_price: 1,
              is_buy: true, is_personal: true, client_id: 5, location_id: 60003760, journal_ref_id: 1 }]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }) as unknown as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 3, characterId: 3, esi, db: db(), log: undefined as never, meta: {} };
      const result = await walletTransactionsJob.run(ctx);
      expect(result?.summary).toBe("Character changed owner during the import");
      expect(await db().select().from(schema.walletTransactions)).toEqual([]);
    });

    it("resumes the wallet import per owner, past unstored corporation trades", async () => {
      // A previous owner's rows must not hide the new owner's history.
      await db().insert(schema.walletTransactions).values({ ...tx(3, 900, 34), userId: userA });
      const seen: (string | null)[] = [];
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (url: string) => {
          const fromId = new URL(String(url)).searchParams.get("from_id");
          seen.push(fromId);
          const all = [
            { transaction_id: 950, is_personal: false },
            { transaction_id: 800, is_personal: true },
          ].map((t) => ({ ...t, date: "2026-09-10T12:00:00Z", type_id: 34, quantity: 1, unit_price: 5, is_buy: true,
            client_id: 5, location_id: 60003760, journal_ref_id: t.transaction_id }));
          return new Response(JSON.stringify(all.filter((t) => !fromId || t.transaction_id < Number(fromId))), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as unknown as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 3, characterId: 3, esi, db: db(), log: undefined as never, meta: {} };
      const first = await walletTransactionsJob.run(ctx);
      expect(first?.summary).toBe("1 new transaction");
      expect(first?.meta).toEqual({ userId: userB, newestSeenId: 950 });
      // Next run: the corporation trade (950) is the high-water mark, so one request is enough.
      seen.length = 0;
      await walletTransactionsJob.run({ ...ctx, meta: first!.meta! });
      expect(seen).toEqual([null]);
    });

    it("drops the previous owner's wallet history when a character is transferred", async () => {
      const { detachTransferredCharacter } = await import("@/core/auth/provision");
      await db().insert(schema.walletTransactions).values([tx(3, 51, 18066), tx(2, 52, 18066)]);
      await db().transaction((t) => detachTransferredCharacter(t, 3, userB, { keepAccount: false }));
      expect((await db().select().from(schema.walletTransactions)).map((r) => r.transactionId)).toEqual([52]);
    });

    it("reports opt-in scopes that a generic re-link dropped", async () => {
      const { encryptToken } = await import("@/core/crypto");
      const { provisionFromSso } = await import("@/core/auth/provision");
      const MINING = "esi-industry.read_character_mining.v1";
      await db().insert(schema.esiTokens).values({ characterId: 2, refreshTokenEnc: encryptToken("r"), scopes: [MINING, WALLET_SCOPE] });
      // The shared client may already hold an earlier fetch, so stub its calls rather than global fetch.
      const { getEsi } = await import("@/core/esi");
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi
        .spyOn(getEsi(), "get")
        .mockImplementation(async (path: string) =>
          reply(path.startsWith("/corporations/") ? { name: "Home", ticker: "HOME", member_count: 3 } : { corporation_id: 100 }),
        ) as unknown as { mockRestore: () => void };
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async () => reply([]));
      const link = (scopes: string[]) =>
        provisionFromSso({
          verified: { characterId: 2, name: "Bravo", ownerHash: "h2", scopes, expiresAt: new Date(Date.now() + 1e6) },
          tokens: { access_token: "a", refresh_token: "r", expires_in: 1200, token_type: "Bearer" },
          intent: "link",
          currentUserId: userB,
        });
      try {
        expect((await link([MINING])).lostOptionalScopes).toEqual([WALLET_SCOPE]);
        // Granted again: nothing lost.
        await db().update(schema.esiTokens).set({ scopes: [MINING, WALLET_SCOPE] });
        expect((await link([MINING, WALLET_SCOPE])).lostOptionalScopes).toEqual([]);
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
      }
    });

    it("hints at realised sale prices per raw unit, raw or compressed", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(3, 21, 62516, { isBuy: false, quantity: 10, unitPrice: 1100 }), // 10 compressed = 1000 raw
        tx(3, 22, 1230, { isBuy: false, quantity: 500, unitPrice: 12 }),
        { ...tx(1, 23, 1230, { isBuy: false, quantity: 1, unitPrice: 1e6 }), userId: userA },
      ]);
      const hints = await pnl.getSaleHints(scopeB(), range);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toMatchObject({ typeId: 1230, rawUnits: 1500, isk: 17_000, sales: 2, baseUnitPrice: 10 });
      expect(hints[0].rawUnitPrice).toBeCloseTo(17_000 / 1500);
    });
  });

  describe("corporation wallets", async () => {
    const { corporationWalletsJob, corporationDivisionsJob } = await import("@/modules/wallet/corp/sync");
    const walletQ = await import("@/modules/wallet/corp/queries");
    const { parseCorpWalletFilters } = await import("@/modules/wallet/corp/filters");
    const DAY = 86_400_000;
    const NOW = Math.floor(Date.now() / 1000) * 1000;
    const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");

    /** Fake ESI for corporation 100: journal and transactions per division, routed by path. */
    function corpEsi(data: {
      journal?: Record<number, Record<string, unknown>[]>;
      transactions?: Record<number, Record<string, unknown>[]>;
      divisions?: { division: number; name?: string }[];
    }) {
      const calls: string[] = [];
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (url: string) => {
          const u = new URL(String(url));
          calls.push(u.pathname + u.search);
          const m = u.pathname.match(/\/wallets\/(\d)\/(journal|transactions)$/);
          let body: unknown = [];
          if (u.pathname.endsWith("/wallets")) body = [1, 2, 3, 4, 5, 6, 7].map((division) => ({ division, balance: division * 1e6 }));
          else if (u.pathname.endsWith("/divisions")) body = { hangar: [], wallet: data.divisions ?? [] };
          else if (m && m[2] === "journal") body = data.journal?.[Number(m[1])] ?? [];
          else if (m && !u.searchParams.has("from_id")) body = data.transactions?.[Number(m[1])] ?? [];
          return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-pages": "1" } });
        }) as unknown as typeof fetch,
      });
      return { esi, calls };
    }
    const ctx = (esi: InstanceType<typeof EsiClient>) => ({
      jobId: 1, ownerType: "corporation" as const, ownerId: 100, characterId: 1, esi, db: db(), log: undefined as never, meta: {},
    });
    const j = (id: number, daysAgo: number, amount: number, extra: Record<string, unknown> = {}) => ({
      id, date: iso(daysAgo), ref_type: "bounty_prizes", description: "", amount, first_party_id: 1000125, second_party_id: 100, ...extra,
    });
    const filters = parseCorpWalletFilters({}, new Date().toISOString().slice(0, 10));

    beforeEach(async () => {
      // Known names and types, so the resolver has nothing to ask ESI for.
      await db().insert(schema.eveEntities).values([
        { id: 100, name: "Home Corp", category: "corporation" },
        { id: 1000125, name: "CONCORD", category: "corporation" },
        { id: 1, name: "Alpha", category: "character" },
      ]);
      await db().insert(schema.eveTypes).values({ typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01, portionSize: 1 });
    });

    it("archives balances, journal and transactions without duplicates", async () => {
      const { esi } = corpEsi({
        journal: {
          1: [
            j(3, 1, 5e6),
            j(2, 2, -2e6, { ref_type: "corporation_account_withdrawal", first_party_id: 100, second_party_id: 100 }),
            j(1, 3, -1e6, { ref_type: "office_rental_fee", second_party_id: 1000125, first_party_id: 100 }),
          ],
          2: [j(10, 2, 2e6, { ref_type: "corporation_account_withdrawal", first_party_id: 100, second_party_id: 100 })],
        },
        transactions: {
          1: [{ transaction_id: 77, date: iso(1), type_id: 34, quantity: 1000, unit_price: 4, is_buy: true, client_id: 1,
            location_id: 60003760, journal_ref_id: 3 }],
        },
      });
      expect(corporationWalletsJob.preferredCorpRoles).toEqual(["Accountant", "Junior_Accountant"]);
      const first = await corporationWalletsJob.run(ctx(esi));
      expect(first?.summary).toBe("7 divisions, 4 new journal entries, 1 new transaction");
      const second = await corporationWalletsJob.run(ctx(esi));
      expect(second?.summary).toBe("7 divisions, 0 new journal entries, 0 new transactions");
      expect(await db().select().from(schema.corpWalletJournal)).toHaveLength(4);
      expect(await db().select().from(schema.corpWalletTransactions)).toHaveLength(1);
      expect((await walletQ.getDivisions(100)).map((d) => d.balance)).toEqual([1e6, 2e6, 3e6, 4e6, 5e6, 6e6, 7e6]);
      const state = await walletQ.getSyncState(100);
      expect(state).toHaveLength(14);
      expect(state.every((s) => s.gaps.length === 0 && s.lastSyncedAt)).toBe(true);
      expect(state.find((s) => s.division === 1 && s.stream === "journal")?.historyStartsAt?.toISOString()).toBe(
        new Date(iso(3)).toISOString(),
      );

      // Income and expenses leave the transfer out; it shows up as moved between divisions.
      const flows = await walletQ.getDailyFlows(100, filters);
      const sum = (k: "income" | "expenses" | "transfersIn" | "transfersOut") => flows.reduce((s, r) => s + r[k], 0);
      expect([sum("income"), sum("expenses"), sum("transfersIn"), sum("transfersOut")]).toEqual([5e6, 1e6, 2e6, 2e6]);

      const all = await walletQ.getJournal(100, filters, { limit: 50, offset: 0 });
      expect(all.total).toBe(4);
      expect(all.rows[0]).toMatchObject({ id: 3, category: "bounties", firstPartyName: "CONCORD", transfer: false });
      const rent = await walletQ.getJournal(100, { ...filters, categories: ["structures"] }, { limit: 50, offset: 0 });
      expect(rent.rows.map((r) => r.id)).toEqual([1]);
      const transfers = await walletQ.getJournal(100, { ...filters, flow: "transfer" }, { limit: 50, offset: 0 });
      expect(transfers.rows.map((r) => r.id).sort()).toEqual([10, 2]);
      const expenses = await walletQ.getJournal(100, { ...filters, flow: "expense", divisions: [1] }, { limit: 50, offset: 0 });
      expect(expenses.rows.map((r) => r.id)).toEqual([1]);
    });

    it("keeps history ESI no longer returns and records the hole when imports stopped too long", async () => {
      await db().insert(schema.corpWalletJournal).values({
        corporationId: 100, division: 1, id: 1, date: new Date(iso(60)), refType: "bounty_prizes", amount: 1e6, description: "",
      });
      await db().insert(schema.corpWalletSyncState).values({
        corporationId: 100, division: 1, stream: "journal", historyStartsAt: new Date(iso(90)), lastSyncedAt: new Date(iso(60)),
      });
      const { esi } = corpEsi({ journal: { 1: [j(500, 10, 3e6), j(499, 20, 3e6)] } });
      const result = await corporationWalletsJob.run(ctx(esi));
      expect(result?.summary).toContain("history gap in division 1");
      expect((await db().select().from(schema.corpWalletJournal)).map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 499, 500]);
      const state = (await walletQ.getSyncState(100)).find((s) => s.division === 1 && s.stream === "journal")!;
      expect(state.historyStartsAt?.toISOString()).toBe(new Date(iso(90)).toISOString());
      expect(state.gaps).toHaveLength(1);
      expect(new Date(state.gaps[0].from).getTime()).toBeLessThan(new Date(state.gaps[0].to).getTime());

      // The next hourly import overlaps: no new gap.
      await corporationWalletsJob.run(ctx(esi));
      const again = (await walletQ.getSyncState(100)).find((s) => s.division === 1 && s.stream === "journal")!;
      expect(again.gaps).toHaveLength(1);
    });

    it("stores custom division names and clears renamed-back ones", async () => {
      await corporationDivisionsJob.run(ctx(corpEsi({ divisions: [{ division: 2, name: "SRP" }, { division: 7, name: " " }] }).esi));
      expect((await walletQ.getDivisions(100)).map((d) => d.name)).toEqual([null, "SRP", null, null, null, null, null]);
      await corporationDivisionsJob.run(ctx(corpEsi({ divisions: [] }).esi));
      expect((await walletQ.getDivisions(100)).every((d) => d.name === null)).toBe(true);
    });
  });

  describe("fleet", async () => {
    const { createLogger } = await import("@/core/logger");
    const { fleetLiveJob } = await import("@/modules/fleet/jobs");
    const { EsiError } = await import("@/core/esi/client");
    type Routes = Record<string, unknown>;
    // Stub ESI: each path returns its fixture, an Error is thrown, a missing path is a 404.
    const stubEsi = (routes: Routes) =>
      ({
        get: async (path: string) => {
          const out = routes[path];
          if (out instanceof Error) throw out;
          if (out === undefined) throw new EsiError(`ESI GET ${path} failed: not found`, 404, path);
          return { data: out, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false };
        },
      }) as unknown as InstanceType<typeof EsiClient>;
    const run = (characterId: number, routes: Routes) =>
      fleetLiveJob.run({
        jobId: 1,
        ownerType: "character",
        ownerId: characterId,
        characterId,
        esi: stubEsi(routes),
        db: db(),
        log: createLogger("test"),
        meta: {},
      }).then((r) => ({ summary: r?.summary }));
    const fm = (id: number, role: string, wing: number, squad: number, ship = 1230) => ({
      character_id: id,
      join_time: "2026-10-03T18:00:00Z",
      role,
      role_name: role,
      ship_type_id: ship,
      solar_system_id: 30000180,
      squad_id: squad,
      wing_id: wing,
      takes_fleet_warp: true,
    });
    const boss = (members: unknown[]) => ({
      "/characters/1/fleet": { fleet_id: 77, fleet_boss_id: 1, role: "fleet_commander", wing_id: -1, squad_id: -1 },
      "/fleets/77": { is_free_move: true, is_registered: false, is_voice_enabled: false, motd: "hi" },
      "/fleets/77/members": members,
      "/fleets/77/wings": [{ id: 5, name: "Wing", squads: [{ id: 50, name: "Squad" }] }],
    });

    beforeEach(async () => {
      await db().insert(schema.eveEntities).values([
        { id: 1, name: "Alpha", category: "character" },
        { id: 2, name: "Bravo", category: "character" },
      ]);
    });

    it("does nothing without an active tracker", async () => {
      const out = await run(1, {});
      expect(out.summary).toBe("Not tracking");
      expect(await db().select().from(schema.fleets)).toEqual([]);
    });

    it("records the fleet, then who left, then closes it when the boss leaves", async () => {
      await db().insert(schema.fleetTrackers).values({ characterId: 1, userId: userA });
      await run(1, boss([fm(1, "fleet_commander", -1, -1), fm(2, "squad_member", 5, 50, 45490), fm(9, "squad_member", 5, 50)]));
      const [fleet] = await db().select().from(schema.fleets);
      expect(fleet).toMatchObject({ fleetId: 77, bossCharacterId: 1, isFreeMove: true, endedAt: null });
      expect(fleet.wings).toEqual([{ id: 5, name: "Wing", squads: [{ id: 50, name: "Squad" }] }]);
      expect(await db().select().from(schema.fleetMembers)).toHaveLength(3);
      const [tracker] = await db().select().from(schema.fleetTrackers);
      expect(tracker).toMatchObject({ status: "tracking", fleetId: 77 });

      await run(1, boss([fm(1, "fleet_commander", -1, -1), fm(2, "squad_member", 5, 50, 45490)]));
      const members = await db().select().from(schema.fleetMembers);
      expect(members.filter((m) => m.leftAt).map((m) => m.characterId)).toEqual([9]);

      const out = await run(1, {});
      expect(out.summary).toMatch(/Not in a fleet/);
      const [ended] = await db().select().from(schema.fleets);
      expect(ended.endedAt).not.toBeNull();
      expect((await db().select().from(schema.fleetMembers)).every((m) => m.leftAt)).toBe(true);
      const [stopped] = await db().select().from(schema.fleetTrackers);
      expect(stopped.status).toBe("no_fleet");
    });

    it("waits without reading members while the character is not the boss", async () => {
      await db().insert(schema.fleetTrackers).values({ characterId: 2, userId: userB });
      const out = await run(2, {
        "/characters/2/fleet": { fleet_id: 77, fleet_boss_id: 1, role: "squad_member", wing_id: 5, squad_id: 50 },
        "/fleets/77/members": new Error("must not be called"),
      });
      expect(out.summary).toMatch(/not the boss/);
      const [tracker] = await db().select().from(schema.fleetTrackers);
      expect(tracker).toMatchObject({ status: "not_boss", fleetId: 77 });
      expect(await db().select().from(schema.fleets)).toEqual([]);
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

    it("keeps a trigger that arrives while the job runs", async () => {
      let triggered = false;
      const def = job(async () => {
        await scheduler.triggerJobs({ jobKey: "test.job" });
        triggered = true;
      });
      await scheduler.planJobs([def]);
      const [claimed] = await scheduler.claimDueJobs("w1", [def.key], 10);
      await scheduler.executeJob(claimed, def, { esi });
      expect(triggered).toBe(true);
      const [row] = await db().select().from(schema.syncJobs);
      expect(row.lastStatus).toBe("ok");
      expect(row.nextRunAt.getTime()).toBeLessThan(Date.now() + 5_000);

      // Without a trigger the interval applies again.
      const [again] = await scheduler.claimDueJobs("w1", [def.key], 10);
      await scheduler.executeJob(again, job(async () => {}), { esi });
      const [after] = await db().select().from(schema.syncJobs);
      expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
    });

    it("lets any corporation member serve role-less corporation jobs, role holders first", async () => {
      await db().insert(schema.characterCorpRoles).values([
        { characterId: 1, roles: [] },
        { characterId: 2, roles: ["Director"] },
      ]);
      await db().execute(sql`UPDATE esi_tokens SET scopes = ARRAY['scope.a'], status = 'active'`);
      const base = { ...job(async () => {}), owner: "corporation" as const };
      expect(await scheduler.corporationCandidates(db(), 100, base)).toEqual([2, 3]);
      expect(await scheduler.corporationCandidates(db(), 100, { ...base, anyCorpMember: true })).toEqual([2, 1, 3]);
    });
  });
});
