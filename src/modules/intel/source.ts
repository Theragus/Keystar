import { eq } from "drizzle-orm";
import { eveGroups, eveSystems, eveTypes, getDb, type Db } from "@/core/db";
import { mulberry32 } from "@/lib/random";
import { getZkill } from "@/modules/killboard/sync";
import type { ZkillAttacker, ZkillItem, ZkillKillmail } from "@/modules/killboard/zkill";
import { CYNO_TYPES } from "./hulls";

/**
 * Where the worker gets pilot data: zKillboard (through the shared, polite
 * client) or, in demo mode, a deterministic generator that never touches the
 * network.
 */
export interface IntelSource {
  stats(characterId: number): Promise<{ kind: "ok"; stats: Record<string, unknown> } | { kind: "none" }>;
  page(characterId: number, page: number, side?: "kills" | "losses"): Promise<ZkillKillmail[]>;
}

export function zkillSource(): IntelSource {
  const zkill = getZkill();
  return {
    stats: (id) => zkill.characterStats(id),
    page: (id, page, side) => zkill.characterPage(id, page, { side }),
  };
}

// ---------------------------------------------------------------------------
// Demo source
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Archetype = "quiet" | "hunter" | "gang" | "blob" | "cyno";

interface Persona {
  archetype: Archetype;
  /** Kills per week right now. */
  rate: number;
  /** Peak EVE hour. */
  peak: number;
  hulls: number[];
  systems: number[];
  gang: [number, number];
}

interface DemoUniverse {
  ships: { typeId: number; groupId: number }[];
  systems: number[];
}

let universe: Promise<DemoUniverse> | null = null;

async function loadUniverse(db: Db): Promise<DemoUniverse> {
  const ships = await db
    .select({ typeId: eveTypes.typeId, groupId: eveTypes.groupId })
    .from(eveTypes)
    .innerJoin(eveGroups, eq(eveGroups.groupId, eveTypes.groupId))
    .where(eq(eveGroups.categoryId, 6));
  const systems = await db.select({ id: eveSystems.systemId }).from(eveSystems);
  return { ships: ships.filter((s) => s.groupId !== 29), systems: systems.map((s) => s.id) };
}

function persona(characterId: number, u: DemoUniverse): Persona {
  const rand = mulberry32(characterId);
  const roll = rand();
  const archetype: Archetype = roll < 0.25 ? "quiet" : roll < 0.5 ? "hunter" : roll < 0.75 ? "gang" : roll < 0.9 ? "blob" : "cyno";
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const byGroups = (groups: number[]) => u.ships.filter((s) => groups.includes(s.groupId)).map((s) => s.typeId);
  const pool =
    archetype === "hunter"
      ? byGroups([831, 963, 833, 324])
      : archetype === "gang"
        ? byGroups([358, 420, 1305, 541, 26])
        : archetype === "blob"
          ? byGroups([27, 419, 900, 26])
          : archetype === "cyno"
            ? byGroups([833, 25])
            : byGroups([25, 463, 1202]);
  const hulls = (pool.length ? pool : u.ships.map((s) => s.typeId)).slice();
  const own = Array.from({ length: 3 }, () => pick(hulls));
  return {
    archetype,
    rate: archetype === "quiet" ? 0 : archetype === "cyno" ? 1 : Math.round(3 + rand() * 25),
    peak: Math.floor(rand() * 24),
    hulls: own,
    systems: Array.from({ length: 3 }, () => pick(u.systems)),
    gang:
      archetype === "hunter" ? [1, 4] : archetype === "gang" ? [3, 12] : archetype === "blob" ? [30, 120] : archetype === "cyno" ? [15, 60] : [2, 6],
  };
}

/** Deterministic killmails for a demo pilot, newest first, generated around "now". */
function demoKillmails(characterId: number, p: Persona, u: DemoUniverse, now: number): ZkillKillmail[] {
  const rand = mulberry32(characterId * 7 + 1);
  const out: ZkillKillmail[] = [];
  const victims = u.ships.map((s) => s.typeId);
  const count = p.archetype === "quiet" ? 0 : Math.min(180, Math.round((p.rate * 60) / 7));
  for (let i = 0; i < count; i++) {
    // Denser recently: ages skew toward now.
    const ageDays = 60 * rand() ** 1.6;
    const hour = (p.peak + Math.round((rand() - 0.5) * 6) + 24) % 24;
    const t = new Date(now - ageDays * DAY);
    t.setUTCHours(hour, Math.floor(rand() * 60));
    if (t.getTime() > now) t.setTime(now - rand() * 3_600_000);
    const loss = rand() < (p.archetype === "cyno" ? 0.7 : 0.15);
    const ship = p.hulls[Math.floor(rand() * p.hulls.length)];
    const size = Math.max(1, Math.round(p.gang[0] + rand() * (p.gang[1] - p.gang[0])));
    const allies: ZkillAttacker[] = Array.from({ length: Math.min(size - 1, 40) }, (_, k) => ({
      character_id: 2_100_000_000 + ((characterId + k * 97) % 5000),
      corporation_id: 98_500_101,
      ship_type_id: victims[Math.floor(rand() * victims.length)],
      damage_done: 100,
      final_blow: false,
    }));
    const me: ZkillAttacker = { character_id: characterId, corporation_id: 98_500_101, ship_type_id: ship, damage_done: 500, final_blow: rand() < 0.4 };
    const items: ZkillItem[] = loss
      ? [
          { item_type_id: 2048, flag: 11, quantity_destroyed: 1 },
          ...(p.archetype === "cyno" ? [{ item_type_id: rand() < 0.5 ? CYNO_TYPES.covert : CYNO_TYPES.normal, flag: 27, quantity_destroyed: 1 }] : []),
        ]
      : [];
    const value = Math.round(5e6 + rand() ** 2 * (p.archetype === "blob" ? 2e9 : 4e8));
    out.push({
      killmail_id: 900_000_000 + characterId * 1000 + i,
      killmail_time: t.toISOString(),
      solar_system_id: p.systems[Math.floor(rand() * p.systems.length)],
      victim: loss
        ? { character_id: characterId, corporation_id: 98_500_101, ship_type_id: ship, damage_taken: 5000, items }
        : { character_id: 2_110_000_000 + i, corporation_id: 98_000_001, ship_type_id: victims[Math.floor(rand() * victims.length)], damage_taken: 3000 },
      attackers: loss
        ? [{ character_id: 2_120_000_000 + i, corporation_id: 98_000_002, ship_type_id: victims[0], damage_done: 5000, final_blow: true }]
        : [me, ...allies],
      zkb: {
        hash: `demo${i}`,
        locationID: rand() < 0.3 ? 50_000_000 + i : 40_000_000 + i,
        totalValue: value,
        solo: !loss && size === 1,
        npc: false,
        awox: false,
        labels: [],
      },
    });
  }
  return out.sort((a, b) => Date.parse(b.killmail_time) - Date.parse(a.killmail_time));
}

/** zKillboard-shaped statistics derived from the same generated killmails. */
function demoStats(characterId: number, p: Persona, kms: ZkillKillmail[], now: number): Record<string, unknown> {
  const rand = mulberry32(characterId * 13 + 5);
  const months: Record<string, unknown> = {};
  const add = (d: Date, kill: boolean, value: number) => {
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = (months[key] ??= { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, shipsDestroyed: 0, shipsLost: 0, iskDestroyed: 0, iskLost: 0 }) as Record<string, number>;
    if (kill) {
      m.shipsDestroyed++;
      m.iskDestroyed += value;
    } else {
      m.shipsLost++;
      m.iskLost += value;
    }
  };
  for (const km of kms) add(new Date(km.killmail_time), km.victim.character_id !== characterId, km.zkb.totalValue ?? 0);
  // An older career, a year or two back.
  const careerMonths = Math.floor(rand() * 18);
  for (let i = 0; i < careerMonths; i++) {
    const d = new Date(now - (90 + i * 30) * DAY);
    for (let k = 0; k < Math.round(rand() * 20); k++) add(d, rand() < 0.8, 50e6);
  }
  const kills = kms.filter((k) => k.victim.character_id !== characterId);
  const weekKills = kills.filter((k) => now - Date.parse(k.killmail_time) < 7 * DAY).length;
  const activity: Record<string, Record<string, number>> = {};
  for (const k of kills) {
    const d = new Date(k.killmail_time);
    const day = (activity[String(d.getUTCDay())] ??= {});
    day[String(d.getUTCHours())] = (day[String(d.getUTCHours())] ?? 0) + 1;
  }
  const solo = kills.filter((k) => k.attackers.length === 1).length;
  return {
    shipsDestroyed: Object.values(months).reduce((s: number, m) => s + (m as Record<string, number>).shipsDestroyed, 0),
    shipsLost: Object.values(months).reduce((s: number, m) => s + (m as Record<string, number>).shipsLost, 0),
    iskDestroyed: kills.reduce((s, k) => s + (k.zkb.totalValue ?? 0), 0),
    soloKills: solo,
    dangerRatio: Math.round(60 + rand() * 35),
    gangRatio: kills.length ? Math.round(100 - (100 * solo) / kills.length) : 0,
    months,
    activepvp: weekKills ? { kills: { type: "Total Kills", count: weekKills } } : {},
    activity: kills.length ? activity : undefined,
    recentShips: p.hulls.map((t) => ({ shipTypeID: t, appearances: Math.round(5 + rand() * 40), kills: 10, losses: 2 })),
    associates: [],
    labels: { "#:1": { shipsDestroyed: solo }, "#:5+": { shipsDestroyed: kills.length - solo } },
    fc: { level: p.archetype === "blob" && rand() < 0.3 ? "medium" : "low", score: 20 },
    activityTags: { blops: 0, logi: 0, capital: p.archetype === "blob" ? 2 : 0, super: 0, titan: 0 },
    info: { birthday: new Date(now - (p.archetype === "cyno" ? 12 : 400 + rand() * 4000) * DAY).toISOString(), secStatus: -2 + rand() * 7 },
  };
}

/** Demo data shaped like zKillboard's, with a short delay so the page fills in visibly. */
export function demoSource(opts: { db?: Db; delayMs?: number; now?: () => number } = {}): IntelSource {
  const db = opts.db ?? getDb();
  const delay = opts.delayMs ?? 300;
  const now = opts.now ?? (() => Date.now());
  const ready = () => (universe ??= loadUniverse(db));
  return {
    async stats(characterId) {
      await sleep(delay);
      const u = await ready();
      if (!u.ships.length) return { kind: "none" };
      const p = persona(characterId, u);
      const kms = demoKillmails(characterId, p, u, now());
      return { kind: "ok", stats: demoStats(characterId, p, kms, now()) };
    },
    async page(characterId, page, side) {
      await sleep(delay);
      const u = await ready();
      const p = persona(characterId, u);
      let kms = demoKillmails(characterId, p, u, now());
      if (side === "losses") kms = kms.filter((k) => k.victim.character_id === characterId);
      if (side === "kills") kms = kms.filter((k) => k.victim.character_id !== characterId);
      return kms.slice((page - 1) * 200, page * 200);
    },
  };
}
