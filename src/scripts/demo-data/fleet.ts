import type { Db } from "@/core/db";
import type { EsiFleetMember } from "@/modules/fleet/logic";
import { closeFleet, recordFleetSnapshot } from "@/modules/fleet/sync";

/**
 * Demo fleets: one still open (shown as live in demo mode) and two past ones,
 * stored through the same code path as the worker. Ship types and systems
 * come from the killboard demo data, which must be seeded first.
 */
const HULLS = [622, 622, 17843, 17843, 29337, 11957, 22464, 35683];
const WINGS = [
  { id: 1001, name: "Mainline", squads: [{ id: 2001, name: "DPS" }, { id: 2002, name: "Logistics" }] },
  { id: 1002, name: "Support", squads: [{ id: 2003, name: "Tackle" }] },
];

export async function seedFleets(
  db: Db,
  opts: { pilots: number[]; systems: { systemId: number }[]; rand: () => number; now: Date },
): Promise<number> {
  const { pilots, rand, now } = opts;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const system = opts.systems[0].systemId;

  const members = (count: number, start: Date): EsiFleetMember[] =>
    pilots.slice(0, count).map((characterId, i) => {
      const squad = i === 0 ? null : i % 4 === 0 ? 2002 : i % 5 === 0 ? 2003 : 2001;
      return {
        character_id: characterId,
        join_time: new Date(start.getTime() + i * 90_000).toISOString(),
        role: i === 0 ? "fleet_commander" : "squad_member",
        role_name: i === 0 ? "Fleet Commander (Boss)" : "Squad Member",
        ship_type_id: squad === 2003 ? 22464 : pick(HULLS),
        solar_system_id: i % 7 === 6 ? pick(opts.systems).systemId : system,
        wing_id: squad === null ? -1 : squad === 2003 ? 1002 : 1001,
        squad_id: squad ?? -1,
        takes_fleet_warp: true,
      };
    });
  const fleet = (motd: string) => ({ is_free_move: false, is_registered: false, is_voice_enabled: false, motd });

  const past = [
    { fleetId: 1_090_000_001, daysAgo: 3, size: 9, hours: 2.5 },
    { fleetId: 1_090_000_002, daysAgo: 1, size: 6, hours: 1.2 },
  ];
  for (const p of past) {
    const start = new Date(now.getTime() - p.daysAgo * 86_400_000);
    const all = members(p.size, start);
    await recordFleetSnapshot(db, { fleetId: p.fleetId, bossCharacterId: all[0].character_id, fleet: fleet(""), members: all, wings: WINGS }, start);
    await closeFleet(db, p.fleetId, new Date(start.getTime() + p.hours * 3_600_000));
  }

  // The live fleet: one pilot already left, the rest are still in it.
  const start = new Date(now.getTime() - 50 * 60_000);
  const live = members(Math.min(12, pilots.length), start);
  const liveId = 1_090_000_003;
  const motd = "<font color=\"#ffffffff\">Form up on the boss. Comms: demo channel.</font>";
  await recordFleetSnapshot(db, { fleetId: liveId, bossCharacterId: live[0].character_id, fleet: fleet(motd), members: live, wings: WINGS }, new Date(now.getTime() - 60_000));
  await recordFleetSnapshot(db, { fleetId: liveId, bossCharacterId: live[0].character_id, fleet: fleet(motd), members: live.slice(0, -1), wings: WINGS }, now);
  return past.length + 1;
}
