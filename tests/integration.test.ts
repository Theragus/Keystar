/**
 * Database-backed tests. They run only when TEST_DATABASE_URL points at a
 * disposable Postgres database (it is truncated!), e.g.
 *   TEST_DATABASE_URL=postgres://keystar:keystar@localhost:5432/keystar_test pnpm test
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
  const corp = { corp: true, ownCharacterIds: [] as number[] };
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
      sync_jobs, app_settings RESTART IDENTITY CASCADE`);
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
      const own = await q.getMiningSummary(filters(), { corp: false, ownCharacterIds: [2, 3] }, val);
      expect(own.current.value).toBe(100 * 600 + 500 * 10);
      // Asking for someone else's character as a member yields nothing.
      const other = await q.getMiningSummary(filters({ chars: "1" }), { corp: false, ownCharacterIds: [2, 3] }, val);
      expect(other.current.quantity).toBe(0);
      const none = await q.getMiningSummary(filters(), { corp: false, ownCharacterIds: [] }, val);
      expect(none.current.quantity).toBe(0);
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
      const observers = await q.getObserverSummaries(filters(), val, 100);
      expect(observers[0].name).toBe("Osmon Athanor");
      expect(observers[0].foreignMiners).toBe(1);
    });
  });

  describe("sync scheduler", () => {
    const job = (run: () => Promise<void>) => ({
      key: "test.job",
      label: "Test",
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
