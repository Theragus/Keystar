import { and, eq } from "drizzle-orm";
import { getCorporation } from "@/core/corp";
import { getDb, intelContacts } from "@/core/db";
import { getSetting } from "@/core/settings";
import type { Standing, StandingClass } from "./types";

/**
 * Friend or foe: the home corporation and alliance are always friendly;
 * otherwise the corporation's and the alliance's contact lists decide, the
 * most specific entity first (character, then corporation, alliance and
 * faction) and the corporation's own list before the alliance's.
 */

export interface StandingsContext {
  homeCorporationId: number | null;
  homeAllianceId: number | null;
  corporationContacts: Map<number, number>;
  allianceContacts: Map<number, number>;
}

export interface Affiliated {
  characterId: number;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
}

export const EMPTY_STANDINGS: StandingsContext = {
  homeCorporationId: null,
  homeAllianceId: null,
  corporationContacts: new Map(),
  allianceContacts: new Map(),
};

export function classifyStanding(value: number): StandingClass {
  if (value >= 5) return "blue";
  if (value > 0) return "lightblue";
  if (value <= -5) return "red";
  if (value < 0) return "orange";
  return "neutral";
}

export function standingOf(pilot: Affiliated, ctx: StandingsContext): Standing {
  if (
    (ctx.homeCorporationId && pilot.corporationId === ctx.homeCorporationId) ||
    (ctx.homeAllianceId && pilot.allianceId === ctx.homeAllianceId)
  ) {
    return { cls: "own", value: null, source: null, via: null };
  }
  const entities: [Standing["via"], number | null][] = [
    ["character", pilot.characterId],
    ["corporation", pilot.corporationId],
    ["alliance", pilot.allianceId],
    ["faction", pilot.factionId],
  ];
  for (const [via, id] of entities) {
    if (!id) continue;
    const corp = ctx.corporationContacts.get(id);
    if (corp !== undefined) return { cls: classifyStanding(corp), value: corp, source: "corporation", via };
    const alliance = ctx.allianceContacts.get(id);
    if (alliance !== undefined) return { cls: classifyStanding(alliance), value: alliance, source: "alliance", via };
  }
  return { cls: "neutral", value: null, source: null, via: null };
}

/** Friendly pilots are shown but left out of totals, the feed and automatic profiling. */
export function isFriendly(standing: Standing): boolean {
  return standing.cls === "own" || standing.cls === "blue";
}

export function isHostile(standing: Standing): boolean {
  return standing.cls === "red" || standing.cls === "orange";
}

/** The home corporation, its alliance and both contact lists. */
export async function loadStandings(): Promise<StandingsContext> {
  const homeCorporationId = await getSetting("corp.homeCorporationId");
  if (!homeCorporationId) return EMPTY_STANDINGS;
  const corp = await getCorporation(homeCorporationId);
  const homeAllianceId = corp?.allianceId ?? null;
  const db = getDb();
  const load = async (ownerType: "corporation" | "alliance", ownerId: number | null) => {
    if (!ownerId) return new Map<number, number>();
    const rows = await db
      .select({ id: intelContacts.contactId, standing: intelContacts.standing })
      .from(intelContacts)
      .where(and(eq(intelContacts.ownerType, ownerType), eq(intelContacts.ownerId, ownerId)));
    return new Map(rows.map((r) => [r.id, r.standing]));
  };
  return {
    homeCorporationId,
    homeAllianceId,
    corporationContacts: await load("corporation", homeCorporationId),
    allianceContacts: await load("alliance", homeAllianceId),
  };
}
