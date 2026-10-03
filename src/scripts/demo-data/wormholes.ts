import { randomUUID } from "node:crypto";
import type { Db } from "@/core/db";
import * as maps from "@/modules/wormholes/maps";
import type { ConnectionPatch } from "@/modules/wormholes/state";
import { WH } from "@/modules/wormholes/static-data";

/**
 * A demo chain from a C4 home, written through the same code as the map
 * page: statics and K162s, holes in every lifetime band and mass state, a
 * loop, labels and one pinned system. Housekeeping collapses it within a
 * couple of days; seed again for a fresh chain.
 */
export async function seedWormholes(db: Db, opts: { userId: string; userName: string; now: Date }) {
  const actor = { id: opts.userId, name: opts.userName };
  const ago = (hours: number) => new Date(opts.now.getTime() - hours * 3_600_000);
  const id = (name: string) => {
    const s = WH.byName(name);
    if (!s) throw new Error(`Demo chain: unknown system ${name}`);
    return s.id;
  };
  const map = await maps.getCorpMap(db);
  const home = id("J113551");
  await maps.setHome(db, map.id, actor, home);

  const links: [from: string, to: string, hoursAgo: number, patch: ConnectionPatch & { at?: number }][] = [
    ["J113551", "J160941", 4, { type: "N766", typeOn: home }],
    ["J113551", "J153546", 11, { type: "C247", typeOn: home, life: "lt4h", at: 0.8 }],
    ["J160941", "Hek", 3, { type: "B274", typeOn: id("J160941"), mass: "reduced", at: 1 }],
    ["J160941", "J105443", 7, { life: "lt1d", at: 2 }],
    ["J153546", "1DQ1-A", 6, { type: "K346", typeOn: id("J153546"), mass: "critical", at: 0.5 }],
    ["J113551", "J132814", 2, {}],
    ["J132814", "J160941", 1.5, { type: "D364", typeOn: id("J132814") }],
  ];
  for (const [from, to, hoursAgo, { at, ...patch }] of links) {
    const connId = randomUUID();
    await maps.addSystem(db, map.id, actor, { systemId: id(to), connectTo: id(from), connId }, ago(hoursAgo));
    if (Object.keys(patch).length) await maps.updateConnection(db, map.id, actor, connId, patch, ago(at ?? hoursAgo));
  }
  await maps.autoArrange(db, map.id, true);
  await maps.setLabel(db, map.id, id("J153546"), "Sleeper sites, cleared");
  await maps.setLabel(db, map.id, id("Hek"), "Trade exit");
  await maps.setPinned(db, map.id, id("1DQ1-A"), true);

  const state = await maps.loadMapState(db, map.id);
  return { systems: state.systems.length, connections: state.connections.length };
}
