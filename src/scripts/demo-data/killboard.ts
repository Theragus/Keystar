import { eveCorporations, eveEntities, eveGroups, eveTypes, syncJobs, type Db } from "@/core/db";
import { storeKillmails } from "@/modules/killboard/sync";
import type { ZkillAttacker, ZkillKillmail } from "@/modules/killboard/zkill";

/**
 * Demo killboard: ~90 days of fights for the demo corporation, stored through
 * the same code path as real zKillboard data. Deterministic for a given PRNG.
 */

interface Hull {
  typeId: number;
  name: string;
  groupId: number;
  /** Typical killmail value range in ISK. */
  value: [number, number];
}

const GROUPS = [
  { groupId: 25, name: "Frigate", categoryId: 6 },
  { groupId: 26, name: "Cruiser", categoryId: 6 },
  { groupId: 27, name: "Battleship", categoryId: 6 },
  { groupId: 29, name: "Capsule", categoryId: 6 },
  { groupId: 324, name: "Assault Frigate", categoryId: 6 },
  { groupId: 358, name: "Heavy Assault Cruiser", categoryId: 6 },
  { groupId: 419, name: "Combat Battlecruiser", categoryId: 6 },
  { groupId: 420, name: "Destroyer", categoryId: 6 },
  { groupId: 463, name: "Mining Barge", categoryId: 6 },
  { groupId: 485, name: "Dreadnought", categoryId: 6 },
  { groupId: 541, name: "Interdictor", categoryId: 6 },
  { groupId: 831, name: "Interceptor", categoryId: 6 },
  { groupId: 833, name: "Force Recon Ship", categoryId: 6 },
  { groupId: 900, name: "Marauder", categoryId: 6 },
  { groupId: 963, name: "Strategic Cruiser", categoryId: 6 },
  { groupId: 1202, name: "Blockade Runner", categoryId: 6 },
  { groupId: 1305, name: "Tactical Destroyer", categoryId: 6 },
  { groupId: 1534, name: "Command Destroyer", categoryId: 6 },
];

const H = (typeId: number, name: string, groupId: number, value: [number, number]): Hull => ({ typeId, name, groupId, value });

/** What our pilots fly (weighted by repetition). */
const DOCTRINE: Hull[] = [
  H(622, "Stabber", 26, [40e6, 90e6]),
  H(622, "Stabber", 26, [40e6, 90e6]),
  H(17843, "Vexor Navy Issue", 26, [80e6, 140e6]),
  H(17843, "Vexor Navy Issue", 26, [80e6, 140e6]),
  H(22464, "Flycatcher", 541, [90e6, 160e6]),
  H(11186, "Malediction", 831, [30e6, 60e6]),
  H(35683, "Hecate", 1305, [90e6, 150e6]),
  H(29337, "Augoror Navy Issue", 26, [70e6, 120e6]),
  H(11957, "Falcon", 833, [180e6, 260e6]),
  H(37480, "Bifrost", 1534, [40e6, 70e6]),
];

/** What we shoot (and who shoots us). */
const TARGETS: Hull[] = [
  H(587, "Rifter", 25, [3e6, 12e6]),
  H(16242, "Thrasher", 420, [8e6, 25e6]),
  H(621, "Caracal", 26, [30e6, 80e6]),
  H(24698, "Drake", 419, [70e6, 140e6]),
  H(17478, "Retriever", 463, [40e6, 90e6]),
  H(12743, "Viator", 1202, [80e6, 260e6]),
  H(22452, "Heretic", 541, [40e6, 70e6]),
  H(12042, "Ishkur", 324, [30e6, 60e6]),
  H(12003, "Zealot", 358, [220e6, 380e6]),
  H(29990, "Loki", 963, [600e6, 1.1e9]),
  H(638, "Raven", 27, [250e6, 600e6]),
  H(28665, "Vargur", 900, [2.4e9, 4.2e9]),
  H(19722, "Naglfar", 485, [2.1e9, 3.2e9]),
];

const CAPSULE = H(670, "Capsule", 29, [10_000, 10_000]);
/** Hot spots first; picked by name from the demo's static systems. */
const KILL_SYSTEMS = ["Tama", "Amamake", "Akora", "Hek", "Rens", "Sobaseki"];

export const HOSTILE_CORPS = [
  { corporationId: 98_500_101, name: "Crimson Talon Raiders", ticker: "CTRDS" },
  { corporationId: 98_500_202, name: "Null Vector Syndicate", ticker: "NVS" },
  { corporationId: 98_500_303, name: "Pale Horizon Logistics", ticker: "PHLOG" },
];
export const HOSTILE_NAMES = [
  "Draven Kask", "Ilse Morrow", "Teo Varkhan", "Jun Aelric", "Mara Quessel", "Oskar Venn", "Yara Dusk",
  "Bastion Krell", "Nadia Strome", "Pyre Holt", "Cass Orlov", "Edda Vintner", "Rook Saelen", "Lio Marchetti",
  "Sable Wyrm", "Torvin Ashe", "Kaito Ren", "Veda Quill", "Hask Morrigan", "Ulla Brenn",
];

/** The demo's hostile pilots (they fight the home corporation on its killboard). */
export function hostilePilots() {
  return HOSTILE_NAMES.map((name, i) => ({
    characterId: 2_130_000_001 + i,
    name,
    corporationId: HOSTILE_CORPS[i % HOSTILE_CORPS.length].corporationId,
  }));
}

export async function seedKillboard(
  db: Db,
  opts: {
    corporationId: number;
    /** Combat-active members and how often they undock (relative weights). */
    pilots: { characterId: number; weight: number }[];
    systems: { systemId: number; name: string; securityStatus: number }[];
    rand: () => number;
    now: Date;
  },
): Promise<{ killmails: number }> {
  const { rand } = opts;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const between = ([a, b]: [number, number]) => a + rand() * (b - a);
  const weighted = () => {
    const total = opts.pilots.reduce((s, p) => s + p.weight, 0);
    let r = rand() * total;
    for (const p of opts.pilots) if ((r -= p.weight) <= 0) return p;
    return opts.pilots[0];
  };

  // Static data for ships, hostile corporations and pilots.
  const hulls = [...new Map([...DOCTRINE, ...TARGETS, CAPSULE].map((h) => [h.typeId, h])).values()];
  await db.insert(eveGroups).values(GROUPS).onConflictDoNothing();
  await db
    .insert(eveTypes)
    .values(hulls.map((h) => ({ typeId: h.typeId, name: h.name, groupId: h.groupId, volume: 0, portionSize: 1, published: true })))
    .onConflictDoNothing();
  await db.insert(eveCorporations).values(HOSTILE_CORPS.map((c) => ({ ...c, memberCount: 40 }))).onConflictDoNothing();
  const hostiles = hostilePilots();
  await db
    .insert(eveEntities)
    .values([
      ...hostiles.map((h) => ({ id: h.characterId, name: h.name, category: "character" })),
      ...HOSTILE_CORPS.map((c) => ({ id: c.corporationId, name: c.name, category: "corporation" })),
    ])
    .onConflictDoNothing();

  const byName = new Map(opts.systems.map((s) => [s.name, s.systemId]));
  const named = KILL_SYSTEMS.flatMap((n) => (byName.has(n) ? [byName.get(n)!] : []));
  const systems = named.length >= 2 ? named : opts.systems.map((s) => s.systemId);
  const hotspots = [systems[0], systems[0], systems[1], systems[1], ...systems];

  const entries: ZkillKillmail[] = [];
  let killmailId = 140_000_000;
  const hash = () => Array.from({ length: 40 }, () => Math.floor(rand() * 16).toString(16)).join("");
  const DAY = 86_400_000;
  const start = new Date(Date.UTC(opts.now.getUTCFullYear(), opts.now.getUTCMonth(), opts.now.getUTCDate()));

  for (let d = 89; d >= 0; d--) {
    // A quiet patch three weeks ago, a strong last week: gives the week-over-week numbers a story.
    const tempo = d < 7 ? 1.6 : d >= 14 && d < 21 ? 0.45 : 1;
    const weekend = new Date(start.getTime() - d * DAY).getUTCDay() % 6 === 0 ? 1.4 : 1;
    const fights = Math.round(rand() * 6 * tempo * weekend);
    for (let f = 0; f < fights; f++) {
      const time = new Date(start.getTime() - d * DAY + Math.floor(rand() * DAY));
      if (time > opts.now) continue;
      const system = pick(hotspots);
      const isLoss = rand() < 0.32;

      if (!isLoss) {
        const victim = pick(hostiles);
        const target = rand() < 0.03 ? pick(TARGETS.slice(-2)) : pick(TARGETS.slice(0, -2));
        const gang = 1 + Math.floor(rand() * rand() * 7);
        const crew = [...new Set(Array.from({ length: gang }, () => weighted()))];
        const attackers: ZkillAttacker[] = crew.map((p, i) => ({
          character_id: p.characterId,
          corporation_id: opts.corporationId,
          ship_type_id: pick(DOCTRINE).typeId,
          damage_done: Math.round(500 + rand() * 4000),
          final_blow: i === 0,
        }));
        const value = between(target.value);
        entries.push(km(killmailId++, time, system, victim, target.typeId, attackers, value, hash(), attackers.length === 1));
        // Pod the pilot now and then.
        if (rand() < 0.35) {
          entries.push(
            km(killmailId++, new Date(time.getTime() + 20_000), system, victim, CAPSULE.typeId, attackers.slice(0, 2), 10_000, hash(), attackers.length === 1),
          );
        }
      } else {
        const pilot = weighted();
        const hull = pick(DOCTRINE);
        const gang = 2 + Math.floor(rand() * 10);
        const attackers: ZkillAttacker[] = Array.from({ length: gang }, (_, i) => {
          const h = pick(hostiles);
          return {
            character_id: h.characterId,
            corporation_id: h.corporationId,
            ship_type_id: pick(TARGETS.slice(0, -2)).typeId,
            damage_done: Math.round(300 + rand() * 3000),
            final_blow: i === 0,
          };
        });
        const victim = { characterId: pilot.characterId, corporationId: opts.corporationId };
        entries.push(km(killmailId++, time, system, victim, hull.typeId, attackers, between(hull.value), hash(), false));
      }
    }
  }

  await storeKillmails(db, entries);
  await db.insert(syncJobs).values({
    jobKey: "killboard.zkill-sync",
    ownerType: "global",
    ownerId: 0,
    lastStatus: "ok",
    lastSummary: `Imported ${entries.length} killmails, ${entries.length} new`,
    lastRunAt: new Date(opts.now.getTime() - 12 * 60_000),
    lastSuccessAt: new Date(opts.now.getTime() - 12 * 60_000),
    lastDurationMs: 4200,
    nextRunAt: new Date(opts.now.getTime() + 48 * 60_000),
    meta: { corporationId: opts.corporationId, lastSyncAt: new Date(opts.now.getTime() - 12 * 60_000).toISOString() },
  });
  return { killmails: entries.length };
}

function km(
  id: number,
  time: Date,
  systemId: number,
  victim: { characterId: number; corporationId: number },
  shipTypeId: number,
  attackers: ZkillAttacker[],
  value: number,
  hash: string,
  solo: boolean,
): ZkillKillmail {
  return {
    killmail_id: id,
    killmail_time: time.toISOString().replace(/\.\d+Z$/, "Z"),
    solar_system_id: systemId,
    victim: {
      character_id: victim.characterId,
      corporation_id: victim.corporationId,
      ship_type_id: shipTypeId,
      damage_taken: attackers.reduce((s, a) => s + a.damage_done, 0),
    },
    attackers,
    zkb: {
      hash,
      totalValue: Math.round(value),
      fittedValue: Math.round(value * 0.6),
      destroyedValue: Math.round(value * 0.7),
      droppedValue: Math.round(value * 0.3),
      points: Math.max(1, Math.round(10 - Math.log10(Math.max(value, 1)))),
      npc: false,
      solo,
      awox: false,
      labels: ["pvp"],
    },
  };
}
