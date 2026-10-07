import { createHash } from "node:crypto";
import { securityClass } from "@/modules/map/model";
import type { CheckedKill } from "../check";
import type { GatecheckQuery } from "../params";
import type { GatecheckResult } from "../service";

/**
 * What Claude reads for a route briefing: the computed check and estimates,
 * written out with names, in English. Only systems with something to say are
 * listed; the quiet rest is a count. Minutes are relative to the check, so the
 * same situation hashes the same for a few minutes. Pure.
 */
const MAX_SYSTEMS = 25;

const minutes = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
const round5 = (n: number) => Math.round(n / 5) * 5;

export interface RouteFacts {
  route: {
    from: string;
    to: string;
    preference: string;
    jumps: number;
    securityOfSystemsEntered: Record<"high" | "low" | "null", number>;
    arrivalEveTime: string;
    avoiding: string[];
  };
  data: { feed: string; killWindowHours: number; historyDays: number };
  systems: unknown[];
  quietSystems: number;
}

function place(k: CheckedKill, name: (id: number | null) => string): string {
  if (k.place === "entry") return `arrival gate (from ${name(k.gateDestinationId)})`;
  if (k.place === "exit") return `departure gate (to ${name(k.gateDestinationId)})`;
  if (k.place === "gate") return `another gate (to ${name(k.gateDestinationId)})`;
  return "away from the gates";
}

export function buildRouteFacts(result: GatecheckResult, query: GatecheckQuery): RouteFacts {
  const { names, now } = result;
  const sys = (id: number | null) => (id === null ? "" : (result.systemNames.get(id) ?? String(id)));
  const type = (id: number) => names.types.get(id)?.name ?? `type ${id}`;
  const entity = (id: number) => names.entities.get(id) ?? `#${id}`;
  const route = result.route ?? [];
  const listed = result.check.systems.filter((s) => {
    const p = result.predictions[s.index];
    return s.status !== "quiet" && s.status !== "unknown" ? true : !!p && (p.level !== "low" || p.sightings.length > 0);
  });
  const systems = listed.slice(0, MAX_SYSTEMS).map((s) => {
    const p = result.predictions[s.index];
    return {
      name: sys(s.systemId),
      jump: s.index,
      security: `${securityClass(s.security)}-sec ${(Math.round(s.security * 10) / 10).toFixed(1)}`,
      arrivalEveTime: p ? hhmm(p.eta) : null,
      status: s.status,
      killsAtRouteGates: s.routeKills.filter((k) => !k.npc).length,
      minutesSinceLastRouteGateKill: s.lastRouteKill ? round5(minutes(s.lastRouteKill, now)) : null,
      routeGateTags: s.routeTags,
      killsElsewhereInSystem: s.otherKills.filter((k) => !k.npc).length,
      tagsElsewhereInSystem: s.systemTags.filter((t) => !s.routeTags.includes(t)),
      latestKills: s.routeKills.slice(0, 3).map((k) => ({
        minutesAgo: round5(minutes(k.time, now)),
        where: place(k, sys),
        victimShip: type(k.victimShipTypeId),
        attackers: k.attackerCount,
        attackerShips: [...new Set(k.attackers.map((a) => a.shipTypeId).filter(Boolean))].slice(0, 6).map(type),
        attackerGroups: [...new Set(k.attackers.map((a) => a.allianceId || a.corporationId).filter(Boolean))].slice(0, 3).map(entity),
        tags: k.tags,
        npcOnly: k.npc,
      })),
      campEstimate: p
        ? {
            level: p.level,
            chancePercent: Math.round(p.chance * 100),
            daysWithKillsNearArrivalTime: p.activeDays,
            daysWithAnyGateKills: p.campDays,
            historyDays: p.historyDays,
            confidence: p.confidence,
            tagsSeenInHistory: p.tagCounts,
            regulars: p.regulars.slice(0, 4).map((r) => {
              const seen = p.sightings.find((x) => x.characterId === r.characterId);
              return {
                name: entity(r.characterId),
                group: r.allianceId || r.corporationId ? entity(r.allianceId || r.corporationId) : null,
                days: r.days,
                kills: r.kills,
                ships: r.shipTypeIds.map(type),
                usualEveHours: r.hours,
                activeAroundArrivalTime: r.nearEta,
                seenNearbyRecently: seen
                  ? {
                      system: sys(seen.systemId),
                      jumpsAway: seen.jumps,
                      minutesAgo: round5(minutes(seen.time, now)),
                    }
                  : null,
              };
            }),
            groupsBehindMostKills: p.groups.map((g) => entity(g.id)),
          }
        : null,
    };
  });
  const arrival = result.etas[result.etas.length - 1];
  return {
    route: {
      from: result.resolved.from?.name ?? query.from,
      to: result.resolved.to?.name ?? query.to,
      preference: query.preference,
      jumps: Math.max(0, route.length - 1),
      securityOfSystemsEntered: result.mix,
      arrivalEveTime: arrival ? hhmm(arrival) : "",
      avoiding: result.resolved.avoid.map((s) => s.name),
    },
    data: {
      feed: result.feed.health,
      killWindowHours: result.check.windowHours,
      historyDays: result.feed.historyDays,
    },
    systems,
    quietSystems: result.check.systems.length - listed.length,
  };
}

export function factsHash(facts: RouteFacts): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}
