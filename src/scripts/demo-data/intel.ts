import { eq, inArray } from "drizzle-orm";
import { eveConstellations, eveCorporations, eveEntities, eveTypes, intelContacts, intelPilots, intelScans, type Db } from "@/core/db";
import { getEsi } from "@/core/esi";
import { createLogger } from "@/core/logger";
import { writeBriefing, writeDscanRead } from "@/modules/intel/ai/generate";
import { getScanPilots, startScan } from "@/modules/intel/scans";
import { demoSource } from "@/modules/intel/source";
import type { DscanEntry, PilotProfile } from "@/modules/intel/types";
import { runScanWorker } from "@/modules/intel/worker";
import { HOSTILE_CORPS, hostilePilots } from "./killboard";

/**
 * Demo threat intel: affiliations and standings for the demo's pilots, real
 * constellation/region data for the static systems, and one finished scan
 * (with briefing and d-scan) produced by the real scan, worker and writer code
 * from generated zKillboard-like data.
 */

/** The demo systems' constellations and regions (from ESI). */
const CONSTELLATIONS = [
  { constellationId: 20000026, name: "Aulari", regionId: 10000002, regionName: "The Forge" },
  { constellationId: 20000018, name: "Anttanen", regionId: 10000002, regionName: "The Forge" },
  { constellationId: 20000019, name: "Ihilakken", regionId: 10000002, regionName: "The Forge" },
  { constellationId: 20000212, name: "Mito", regionId: 10000016, regionName: "Lonetrek" },
  { constellationId: 20000412, name: "Isoma", regionId: 10000033, regionName: "The Citadel" },
  { constellationId: 20000372, name: "Hed", regionId: 10000030, regionName: "Heimatar" },
  { constellationId: 20000302, name: "Barvigrard", regionId: 10000042, regionName: "Metropolis" },
  { constellationId: 20000367, name: "Ortner", regionId: 10000030, regionName: "Heimatar" },
  { constellationId: 20000023, name: "Ihatalo", regionId: 10000002, regionName: "The Forge" },
  { constellationId: 20000199, name: "Koichi", regionId: 10000016, regionName: "Lonetrek" },
  { constellationId: 20000779, name: "Ancbeu", regionId: 10000068, regionName: "Verge Vendor" },
  { constellationId: 20000730, name: "Balrille", regionId: 10000064, regionName: "Essence" },
];

const ALLIED_CORP = { corporationId: 98_600_101, name: "Starfall Collective", ticker: "STARF" };
const NPC_CORP = { corporationId: 1_000_167, name: "State War Academy", ticker: "SWA" };
const BLUES = ["Wren Halloway", "Ostin Pell"].map((name, i) => ({ characterId: 2_140_000_001 + i, name, corporationId: ALLIED_CORP.corporationId }));
const NEUTRALS = ["Kade Morrow", "Lena Fisk", "Ruvo Tanaka"].map((name, i) => ({ characterId: 2_150_000_001 + i, name, corporationId: NPC_CORP.corporationId }));

export async function seedIntel(
  db: Db,
  opts: { homeCorporationId: number; userId: string; userName: string; now: Date },
): Promise<{ scanId: string; pilots: number }> {
  const log = createLogger("demo-intel");
  await db
    .insert(eveConstellations)
    .values(CONSTELLATIONS.map((c) => ({ constellationId: c.constellationId, name: c.name, regionId: c.regionId })))
    .onConflictDoNothing();
  await db
    .insert(eveEntities)
    .values([
      ...[...new Map(CONSTELLATIONS.map((c) => [c.regionId, c.regionName]))].map(([id, name]) => ({ id, name, category: "region" })),
      ...[...BLUES, ...NEUTRALS].map((p) => ({ id: p.characterId, name: p.name, category: "character" })),
      ...[ALLIED_CORP, NPC_CORP].map((c) => ({ id: c.corporationId, name: c.name, category: "corporation" })),
    ])
    .onConflictDoNothing();
  await db.insert(eveCorporations).values([{ ...ALLIED_CORP, memberCount: 31 }, { ...NPC_CORP, memberCount: 999 }]).onConflictDoNothing();

  // Affiliations as if resolved a moment ago, so scans need no ESI.
  const pilots = [...hostilePilots(), ...BLUES, ...NEUTRALS];
  await db
    .insert(intelPilots)
    .values(pilots.map((p) => ({ characterId: p.characterId, name: p.name, corporationId: p.corporationId, affiliationAt: opts.now })))
    .onConflictDoNothing();

  // The home corporation's standings: two hostile corporations red, the allied one blue.
  await db.insert(intelContacts).values([
    { ownerType: "corporation", ownerId: opts.homeCorporationId, contactId: HOSTILE_CORPS[0].corporationId, contactType: "corporation", standing: -10 },
    { ownerType: "corporation", ownerId: opts.homeCorporationId, contactId: HOSTILE_CORPS[1].corporationId, contactType: "corporation", standing: -5 },
    { ownerType: "corporation", ownerId: opts.homeCorporationId, contactId: ALLIED_CORP.corporationId, contactType: "corporation", standing: 10 },
  ]);

  // A finished scan of a busy local in Amamake.
  const local = [...hostilePilots().slice(0, 12), ...BLUES, ...NEUTRALS].map((p) => p.name);
  const scan = await startScan({ text: local.join("\n"), systemName: "Amamake", userId: opts.userId, userName: opts.userName, aiAllowed: true }, { now: opts.now, db });
  if (!scan.ok) throw new Error(`Demo scan failed: ${scan.error}`);
  const source = demoSource({ db, delayMs: 0 });
  for (let i = 0; i < 20; i++) {
    const out = await runScanWorker({ db, esi: getEsi(), log }, { source, offline: true, budgetMs: 60_000 });
    if (!out.remaining) break;
  }

  // A d-scan of what the most dangerous pilots fly, then the briefing and the d-scan read.
  const scanned = await getScanPilots(scan.id, { db });
  const counts = new Map<number, DscanEntry>();
  for (const p of scanned.filter((x) => (x.score ?? 0) >= 25).slice(0, 6)) {
    const hull = (p.profile as PilotProfile | null)?.hulls[0];
    if (!hull) continue;
    const e = counts.get(hull.shipTypeId) ?? { typeId: hull.shipTypeId, name: "", count: 0, groupId: hull.groupId };
    e.count++;
    counts.set(hull.shipTypeId, e);
  }
  if (counts.size) {
    const types = await db
      .select({ id: eveTypes.typeId, name: eveTypes.name })
      .from(eveTypes)
      .where(inArray(eveTypes.typeId, [...counts.keys()]));
    for (const t of types) counts.get(t.id)!.name = t.name;
    await db.update(intelScans).set({ dscan: [...counts.values()] }).where(eq(intelScans.id, scan.id));
  }
  await writeBriefing(scan.id, { createdBy: null, automatic: true }, { db });
  if (counts.size) await writeDscanRead(scan.id, { createdBy: opts.userId }, { db });
  return { scanId: scan.id, pilots: scanned.length };
}
