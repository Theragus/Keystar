/**
 * Threat intel against a real database (skipped without TEST_DATABASE_URL, which is truncated!).
 * ESI is mocked at the fetch level; zKillboard is never called here.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("intel integration", async () => {
  const { closeDb, getDb, schema } = await import("@/core/db");
  const { runMigrations } = await import("@/scripts/migrate");
  const { setSetting } = await import("@/core/settings");
  const { storeKillmails } = await import("@/modules/killboard/sync");
  const { startScan, getScanPilots, profileRemaining } = await import("@/modules/intel/scans");
  const { encountersWithUs, engagementsWithUs } = await import("@/modules/intel/history");
  const { enqueuePilots } = await import("@/modules/intel/queue");

  const db = () => getDb();
  const HOME = 100;
  const now = new Date("2026-10-02T20:00:00Z");
  const at = (iso: string) => `${iso}Z`;
  let userId = "";

  // Pilot 9 (corp 555) killed one of ours and lost two ships to us; 10 (corp 555) flew with 9;
  // 11 is in our alliance; 12 is in a corporation we set red.
  const killmails = [
    { killmail_id: 1, killmail_time: at("2026-09-28T20:00:00"), solar_system_id: 30000180,
      victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 900 },
      attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 17843, damage_done: 900, final_blow: true }],
      zkb: { hash: "h1", totalValue: 100e6 } },
    { killmail_id: 2, killmail_time: at("2026-09-28T20:10:00"), solar_system_id: 30000180,
      victim: { character_id: 1, corporation_id: HOME, ship_type_id: 17843, damage_taken: 5000 },
      attackers: [
        { character_id: 9, corporation_id: 555, ship_type_id: 22456, damage_done: 3000, final_blow: true },
        { character_id: 10, corporation_id: 555, ship_type_id: 29990, damage_done: 1500, final_blow: false },
        { character_id: 77, corporation_id: 556, alliance_id: 600, ship_type_id: 11987, damage_done: 500, final_blow: false },
      ],
      zkb: { hash: "h2", totalValue: 250e6 } },
    { killmail_id: 3, killmail_time: at("2026-08-01T12:00:00"), solar_system_id: 30000181,
      victim: { character_id: 9, corporation_id: 555, ship_type_id: 587, damage_taken: 300 },
      attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 11186, damage_done: 300, final_blow: true }],
      zkb: { hash: "h3", totalValue: 10e6 } },
    // Someone else's fight: not history with us.
    { killmail_id: 4, killmail_time: at("2026-09-29T12:00:00"), solar_system_id: 30000180,
      victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 100 },
      attackers: [{ character_id: 8, corporation_id: 888, ship_type_id: 622, damage_done: 100, final_blow: true }],
      zkb: { hash: "h4", totalValue: 1e9 } },
  ];

  const esi = (handler: (path: string, body: unknown) => unknown) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const result = handler(url.pathname, body);
      if (result === undefined) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
    });

  const characters: Record<string, { id: number; corporation_id: number; alliance_id?: number }> = {
    "pilot nine": { id: 9, corporation_id: 555 },
    "pilot ten": { id: 10, corporation_id: 555 },
    "ally eleven": { id: 11, corporation_id: 101, alliance_id: 200 },
    "red twelve": { id: 12, corporation_id: 300 },
  };
  const fakeEsi = (path: string, body: unknown) => {
    if (path === "/universe/ids") {
      const names = body as string[];
      const found = names.flatMap((n) => {
        const c = characters[n.toLowerCase()];
        return c ? [{ id: c.id, name: n }] : [];
      });
      return { characters: found };
    }
    if (path === "/characters/affiliation") {
      return (body as number[]).map((id) => {
        const c = Object.values(characters).find((x) => x.id === id)!;
        return { character_id: id, corporation_id: c.corporation_id, alliance_id: c.alliance_id };
      });
    }
    if (path.startsWith("/corporations/")) return { name: `Corp ${path.split("/")[2]}`, ticker: "TCK", member_count: 10 };
    if (path === "/universe/names") return [];
    return undefined;
  };

  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE users, characters, app_settings, eve_entities, eve_corporations, eve_systems, eve_types,
      eve_groups, eve_constellations, killmails, killmail_attackers, sync_jobs, esi_cache, intel_scans, intel_scan_pilots,
      intel_pilots, intel_pilot_killmails, intel_queue, intel_contacts, intel_ai_notes RESTART IDENTITY CASCADE`);
    const [u] = await db().insert(schema.users).values({ role: "member" }).returning();
    userId = u.id;
    await setSetting("corp.homeCorporationId", HOME);
    await db().insert(schema.eveCorporations).values({ corporationId: HOME, name: "Home", ticker: "HOME", allianceId: 200 });
    await db().insert(schema.intelContacts).values({ ownerType: "corporation", ownerId: HOME, contactId: 300, contactType: "corporation", standing: -10 });
    expect(await storeKillmails(db(), killmails as never)).toBe(4);
  });

  it("finds fights with us and what they brought", async () => {
    const encounters = await encountersWithUs(HOME, [9, 10, 11]);
    expect(encounters.map((e) => [e.characterId, e.killmailId, e.kind]).sort()).toEqual([
      [10, 2, "onUs"],
      [9, 1, "byUs"],
      [9, 2, "onUs"],
      [9, 3, "byUs"],
    ]);
    const fights = await engagementsWithUs(HOME, encounters, [9, 10]);
    expect(fights).toHaveLength(2);
    // Newest first: the fight on 28 September with both kills, then the August one.
    expect(fights[0]).toMatchObject({ systemId: 30000180, ourKills: 1, ourLosses: 1, iskKilled: 100e6, iskLost: 250e6 });
    expect(fights[0].pilots.map((p) => [p.characterId, p.role])).toEqual([
      [9, "both"],
      [10, "attacker"],
    ]);
    expect(fights[0].others).toEqual([{ corporationId: 556, allianceId: 600, pilots: 1 }]);
    expect(fights[1]).toMatchObject({ systemId: 30000181, ourKills: 1, ourLosses: 0 });
  });

  it("creates a scan: resolves names, keeps history, profiles only non-friendlies", async () => {
    const spy = esi(fakeEsi);
    try {
      const result = await startScan(
        {
          text: "Pilot Nine\nPilot Ten\nAlly Eleven\nRed Twelve\nNobody Known",
          userId,
          userName: "Tester",
          aiAllowed: true,
        },
        { now },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.naming.typeIds).toEqual(expect.arrayContaining([22456, 29990, 11987]));

      const [scan] = await db().select().from(schema.intelScans);
      expect(scan).toMatchObject({ id: result.id, pilotCount: 4, unresolved: ["Nobody Known"], status: "running", aiAllowed: true });

      const pilots = await getScanPilots(result.id);
      const byId = new Map(pilots.map((p) => [p.characterId, p]));
      expect(byId.get(9)!.history).toMatchObject({ killsOnUs: 1, lossesToUs: 2 });
      expect(byId.get(11)!.profiled).toBe(false); // alliance mate
      expect(byId.get(12)!.profiled).toBe(true);

      // Red and recent killers first; the alliance mate is not queued.
      const queue = await db().select().from(schema.intelQueue);
      const priority = new Map(queue.map((q) => [q.characterId, q.priority]));
      expect([...priority.keys()].sort((a, b) => a - b)).toEqual([9, 10, 12]);
      expect(priority.get(12)!).toBeGreaterThan(priority.get(10)!);
      expect(priority.get(9)).toBe(priority.get(10)); // both were on a recent loss of ours

      // Affiliations are cached for the next scan.
      const cached = await db().select().from(schema.intelPilots);
      expect(cached.find((p) => p.characterId === 11)).toMatchObject({ corporationId: 101, allianceId: 200 });

      // Profiling the rest on request queues the alliance mate too.
      expect(await profileRemaining(result.id)).toBe(1);
      expect((await db().select().from(schema.intelQueue)).length).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses empty pastes and unknown systems", async () => {
    const spy = esi(fakeEsi);
    try {
      expect(await startScan({ text: "12345\tWreck\tRifter Wreck\t1 km", userId, userName: null, aiAllowed: false })).toMatchObject({
        ok: false,
        error: expect.stringContaining("d-scan"),
      });
      expect(await startScan({ text: "Pilot Nine", systemName: "Nowhere", userId, userName: null, aiAllowed: false })).toMatchObject({
        ok: false,
        error: expect.stringContaining("Unknown solar system"),
      });
      expect(await startScan({ text: "Nobody Known", userId, userName: null, aiAllowed: false })).toMatchObject({ ok: false });
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps queued work when a pilot is requested again, raising its priority", async () => {
    await enqueuePilots([{ characterId: 9, priority: 5 }]);
    await db().update(schema.intelQueue).set({ stage: 2 });
    await enqueuePilots([{ characterId: 9, priority: 40 }, { characterId: 9, priority: 1 }]);
    const [row] = await db().select().from(schema.intelQueue);
    expect(row).toMatchObject({ characterId: 9, stage: 2, priority: 40 });
  });
});
